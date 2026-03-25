const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { resolveUserIdentifiers } = require('../src/utils/userUtils');

// Section model with cover image and posts
const sectionSchema = new mongoose.Schema({
  userId: String,
  name: String,
  order: Number,
  coverImage: String,
  postIds: [String], // Changed from posts to postIds for consistency
  visibility: { type: String, enum: ['public', 'private', 'specific'], default: 'private' },
  collaborators: [String],
  allowedUsers: [String], // Users who can see the section (for 'specific' visibility)
  allowedGroups: [String], // Group IDs selected for 'specific' visibility
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Section = mongoose.models.Section || mongoose.model('Section', sectionSchema);

// POST /api/sections - Create a new section
router.post('/', async (req, res) => {
  try {
    const { userId: rawUserId, name, coverImage, posts, postIds, visibility, collaborators } = req.body;

    if (!rawUserId || !name) {
      return res.status(400).json({ success: false, error: 'userId and name required' });
    }

    const user = await resolveUserIdentifiers(rawUserId);
    const userId = user.canonicalId;

    // Get max order for this user
    const lastSection = await Section.findOne({ userId: { $in: user.candidates } }).sort({ order: -1 });
    const nextOrder = (lastSection?.order || 0) + 1;

    const section = new Section({
      userId,
      name,
      order: nextOrder,
      coverImage: coverImage || null,
      postIds: postIds || posts || [], // Support both just in case
      visibility: visibility || 'private',
      collaborators: collaborators || [],
      allowedUsers: req.body.allowedUsers || [],
      allowedGroups: req.body.allowedGroups || []
    });
    await section.save();

    console.log('[POST /sections] Section created:', section._id, 'for user:', userId);
    res.status(201).json({ success: true, data: section });
  } catch (err) {
    console.error('[POST /sections] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get user sections
router.get('/users/:userId/sections', async (req, res) => {
  try {
    const user = await resolveUserIdentifiers(req.params.userId);
    const requesterId = req.query.requesterId;

    // Find sections owned by the user OR where the user is a collaborator
    const sections = await Section.find({ 
      $or: [
        { userId: { $in: user.candidates } },
        { collaborators: { $in: user.candidates } }
      ]
    }).sort({ order: 1 });
    
    // Filter by visibility and collaborators
    const filteredSections = sections.filter(section => {
      // 1. Owner can see all
      if (user.candidates.includes(requesterId)) return true;
      // 2. Public is visible to all
      if (section.visibility === 'public') return true;
      // 3. Collaborators can see
      if (section.collaborators && section.collaborators.includes(requesterId)) return true;
      // 4. Allowed users can see (specific visibility)
      if (section.visibility === 'specific' && section.allowedUsers && section.allowedUsers.includes(requesterId)) return true;
      
      return false;
    });

    // 5. Populate collaborators with basic user info
    const User = mongoose.models.User || mongoose.model('User');
    const populatedSections = await Promise.all(filteredSections.map(async (section) => {
      const s = section.toObject();
      if (s.collaborators && s.collaborators.length > 0) {
        const collabIds = s.collaborators.map(id => String(id));
        const collabUsers = await User.find({ 
          $or: [
            { _id: { $in: collabIds.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id)) } },
            { uid: { $in: collabIds } },
            { firebaseUid: { $in: collabIds } }
          ]
        }, 'name displayName username avatar uid firebaseUid _id');
        s.collaborators = s.collaborators.map(id => {
          const idStr = String(id);
          const u = collabUsers.find(user => String(user._id) === idStr || user.uid === idStr || user.firebaseUid === idStr);
          return u ? { ...u.toObject(), id: u._id } : id;
        });
      }
      return s;
    }));

    res.json({ success: true, data: populatedSections });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/sections - Get sections (optionally filtered by userId)
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    let sections = [];
    if (userId) {
      sections = await Section.find({ userId }).sort({ order: 1 });
    } else {
      sections = await Section.find().sort({ order: 1 });
    }
    res.json({ success: true, data: sections });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/sections/:sectionId - Update a specific section
router.patch('/:sectionId', async (req, res) => {
  try {
    const { name, coverImage, postIds, posts, order, visibility, collaborators, requesterId: reqId, viewerId } = req.body;
    const requesterId = reqId || viewerId;
    const { sectionId } = req.params;

    // Check ownership (only owner can edit)
    const existingSection = await Section.findById(sectionId);
    if (!existingSection) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }
    
    if (existingSection.userId !== requesterId) {
      const isCollaborator = existingSection.collaborators && existingSection.collaborators.includes(requesterId);
      if (isCollaborator) {
        // Collaborators can ONLY update postIds (add/remove posts)
        if (name !== undefined || visibility !== undefined || collaborators !== undefined || req.body.allowedUsers !== undefined || order !== undefined) {
          return res.status(403).json({ success: false, error: 'Unauthorized: Collaborators can only update posts' });
        }
      } else {
        return res.status(403).json({ success: false, error: 'Unauthorized: Only owner or collaborator can edit' });
      }
    }

    const updateData = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (coverImage !== undefined) updateData.coverImage = coverImage;
    if (postIds !== undefined) updateData.postIds = postIds;
    else if (posts !== undefined) updateData.postIds = posts;
    if (order !== undefined) updateData.order = order;
    if (visibility !== undefined) updateData.visibility = visibility;
    if (collaborators !== undefined) updateData.collaborators = collaborators;
    if (req.body.allowedUsers !== undefined) updateData.allowedUsers = req.body.allowedUsers;
    if (req.body.allowedGroups !== undefined) updateData.allowedGroups = req.body.allowedGroups;

    const section = await Section.findByIdAndUpdate(
      sectionId,
      updateData,
      { new: true }
    );

    if (!section) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    console.log('[PATCH /sections/:sectionId] Section updated:', sectionId);
    res.json({ success: true, data: section });
  } catch (err) {
    console.error('[PATCH /sections/:sectionId] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/sections/:sectionId - Delete a section
router.delete('/:sectionId', async (req, res) => {
  try {
    const { sectionId } = req.params;
    const { requesterId } = req.query;

    const existingSection = await Section.findById(sectionId);
    if (!existingSection) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    if (existingSection.userId !== requesterId) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Only owner can delete' });
    }

    const section = await Section.findByIdAndDelete(sectionId);

    if (!section) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    console.log('[DELETE /sections/:sectionId] Section deleted:', sectionId);
    res.json({ success: true, message: 'Section deleted successfully' });
  } catch (err) {
    console.error('[DELETE /sections/:sectionId] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update section order (batch update)
router.patch('/users/:userId/sections-order', async (req, res) => {
  try {
    const { sections } = req.body;

    if (!sections || !Array.isArray(sections)) {
      return res.status(400).json({ success: false, error: 'sections array required' });
    }

    // Update all sections in a single operation
    const updatePromises = sections.map((section, index) =>
      Section.updateOne(
        { _id: section._id || section.id },
        { order: index, updatedAt: new Date() }
      )
    );

    await Promise.all(updatePromises);

    console.log('[PATCH /sections-order] Updated order for', sections.length, 'sections');
    res.json({ success: true, message: 'Section order updated successfully' });
  } catch (err) {
    console.error('[PATCH /sections-order] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
