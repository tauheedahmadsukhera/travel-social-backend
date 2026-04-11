const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { resolveUserIdentifiers } = require('../src/utils/userUtils');

console.log('📌 Loading saved posts route...');

// Saved post schema
const savedPostSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  postId: { type: String, required: true },
  savedAt: { type: Date, default: Date.now }
});

const SavedPost = mongoose.models.SavedPost || mongoose.model('SavedPost', savedPostSchema);

// Save a post
router.post('/:userId/saved', async (req, res) => {
  try {
    const { userId } = req.params;
    const { postId } = req.body;
    
    if (!postId) {
      return res.status(400).json({ success: false, error: 'postId required' });
    }
    
    const resolved = await resolveUserIdentifiers(userId);
    const idCandidates = [...new Set(resolved.candidates.map((v) => String(v)))];
    const canonicalUserId = String(resolved.canonicalId || userId);

    // Check if already saved
    const existing = await SavedPost.findOne({ userId: { $in: idCandidates }, postId: String(postId) });
    if (existing) {
      return res.json({ success: true, message: 'Already saved' });
    }
    
    const savedPost = new SavedPost({ userId: canonicalUserId, postId: String(postId) });
    await savedPost.save();

    // Keep Post.savedBy in sync for newer APIs
    const Post = mongoose.model('Post');
    const targetPost = await Post.findById(postId);
    if (targetPost) {
      const alreadyInSavedBy = Array.isArray(targetPost.savedBy)
        && targetPost.savedBy.some((id) => idCandidates.includes(String(id)));
      if (!alreadyInSavedBy) {
        targetPost.savedBy = Array.isArray(targetPost.savedBy) ? targetPost.savedBy : [];
        targetPost.savedBy.push(canonicalUserId);
        targetPost.savesCount = targetPost.savedBy.length;
        await targetPost.save();
      }
    }
    
    res.json({ success: true, data: savedPost });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Unsave a post
router.delete('/:userId/saved/:postId', async (req, res) => {
  try {
    const { userId, postId } = req.params;
    const resolved = await resolveUserIdentifiers(userId);
    const idCandidates = [...new Set(resolved.candidates.map((v) => String(v)))];

    await SavedPost.deleteMany({ userId: { $in: idCandidates }, postId: String(postId) });

    const Post = mongoose.model('Post');
    const targetPost = await Post.findById(postId);
    if (targetPost) {
      targetPost.savedBy = (Array.isArray(targetPost.savedBy) ? targetPost.savedBy : []).filter((id) => !idCandidates.includes(String(id)));
      targetPost.savesCount = targetPost.savedBy.length;
      await targetPost.save();
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get saved posts for user
router.get('/:userId/saved', async (req, res) => {
  try {
    const { userId } = req.params;
    const resolved = await resolveUserIdentifiers(userId);
    const idCandidates = [...new Set(resolved.candidates.map((v) => String(v)))];
    const idObjectCandidates = idCandidates
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const savedPosts = await SavedPost.find({ userId: { $in: idCandidates } }).sort({ savedAt: -1 });
    const legacyPostIds = savedPosts.map((s) => String(s.postId)).filter(Boolean);

    // Include collection posts where user is owner/collaborator
    const Section = mongoose.model('Section');
    const sections = await Section.find({
      $or: [
        { userId: { $in: idCandidates } },
        { userId: { $in: idObjectCandidates } },
        { collaborators: { $in: idCandidates } },
        { collaborators: { $in: idObjectCandidates } },
        { 'collaborators.userId': { $in: idCandidates } },
        { 'collaborators.userId': { $in: idObjectCandidates } },
      ]
    }).lean();

    const sectionPostIds = [];
    (Array.isArray(sections) ? sections : []).forEach((s) => {
      const ids = Array.isArray(s?.postIds) ? s.postIds : [];
      ids.forEach((pid) => {
        const nextId = pid && typeof pid === 'object'
          ? String(pid._id || pid.id || pid.postId || '')
          : String(pid || '');
        if (nextId) sectionPostIds.push(nextId);
      });
    });

    const allPostIds = [...new Set([...legacyPostIds, ...sectionPostIds])];

    const Post = mongoose.model('Post');

    const objectPostIds = allPostIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
    const skip = parseInt(String(req.query.skip || '0'), 10) || 0;

    const posts = await Post.find({
      $or: [
        { savedBy: { $in: idCandidates } },
        { _id: { $in: objectPostIds } },
      ]
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    res.json({ success: true, data: posts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
