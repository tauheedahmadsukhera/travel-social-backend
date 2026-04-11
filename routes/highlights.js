const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { resolveUserIdentifiers } = require('../src/utils/userUtils');

// Use Highlight model (already loaded in server)
const getHighlight = () => {
  try {
    return mongoose.model('Highlight');
  } catch {
    return null;
  }
};

// Add a highlight
router.post('/highlights', async (req, res) => {
  try {
    const Highlight = getHighlight();
    if (!Highlight) return res.status(500).json({ success: false, error: 'Highlight model not available' });
    
    const { userId: rawUserId, title, coverImage, items, stories, storyIds, visibility } = req.body;
    const user = await resolveUserIdentifiers(rawUserId);
    const userId = user.canonicalId;
    
    // Support both 'stories' and 'storyIds' from frontend
    const storiesArray = stories || storyIds || [];
    
    const highlight = new Highlight({ 
      userId, 
      title, 
      coverImage: coverImage || null,
      items: items || [],
      stories: storiesArray,
      visibility: visibility || 'Public'
    });
    await highlight.save();
    
    const normalizedHighlight = {
      ...(highlight.toObject ? highlight.toObject() : highlight),
      id: String(highlight._id)
    };
    
    res.status(201).json({ success: true, data: normalizedHighlight });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add a highlight for a specific user (POST /users/:userId/highlights)
router.post('/users/:userId/highlights', async (req, res) => {
  try {
    const Highlight = getHighlight();
    if (!Highlight) return res.status(500).json({ success: false, error: 'Highlight model not available' });
    
    const { title, coverImage, items, stories, storyIds, visibility } = req.body;
    const user = await resolveUserIdentifiers(req.params.userId);
    const userId = user.canonicalId;
    
    // Support both 'stories' and 'storyIds' from frontend
    const storiesArray = stories || storyIds || [];
    
    // Create highlight with title, optional cover image, and visibility
    const highlight = new Highlight({ 
      userId, 
      title, 
      coverImage: coverImage || null,
      items: items || [],
      stories: storiesArray,
      visibility: visibility || 'Public'
    });
    
    await highlight.save();
    
    const normalizedHighlight = {
      ...(highlight.toObject ? highlight.toObject() : highlight),
      id: String(highlight._id)
    };
    
    res.status(201).json({ success: true, data: normalizedHighlight });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all highlights for a user
router.get('/users/:userId/highlights', async (req, res) => {
  try {
    const Highlight = getHighlight();
    if (!Highlight) return res.json({ success: true, data: [] });
    
    const user = await resolveUserIdentifiers(req.params.userId);
    const highlights = await Highlight.find({ userId: { $in: user.candidates } }).lean();
    
    // Normalize _id to id for client compatibility
    const normalizedHighlights = highlights.map(h => ({
      ...h,
      id: String(h._id)
    }));
    
    res.json({ success: true, data: normalizedHighlights });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/highlights - Get highlights (optionally filtered by userId)
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    let highlights = [];
    if (userId) {
      highlights = await Highlight.find({ userId }).lean();
    } else {
      highlights = await Highlight.find().lean();
    }
    
    const normalizedHighlights = highlights.map(h => ({
      ...h,
      id: String(h._id)
    }));
    
    res.json({ success: true, data: normalizedHighlights });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Edit a highlight
router.patch('/highlights/:highlightId', async (req, res) => {
  try {
    const { title, items } = req.body;
    const highlight = await Highlight.findById(req.params.highlightId);
    if (!highlight) return res.status(404).json({ success: false, error: 'Highlight not found' });
    if (title) highlight.title = title;
    if (items) highlight.items = items;
    await highlight.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add a story to an existing highlight
router.post('/highlights/:highlightId/stories', async (req, res) => {
  try {
    const { highlightId } = req.params;
    const { storyId } = req.body;
    
    if (!storyId) return res.status(400).json({ success: false, error: 'storyId is required' });

    const Highlight = getHighlight();
    const highlight = await Highlight.findById(highlightId);
    
    if (!highlight) return res.status(404).json({ success: false, error: 'Highlight not found' });
    
    // Add to items array if it doesn't exist
    const isAlreadyInItems = highlight.items?.some(item => (item.id === storyId || item === storyId));
    if (!isAlreadyInItems) {
      if (!highlight.items) highlight.items = [];
      highlight.items.push(storyId); // Keep simple string ID for now to match stories array
    }

    // Compatibility for stories array
    if (!highlight.stories.includes(storyId)) {
      highlight.stories.push(storyId);
    }
    
    await highlight.save();
    res.json({ success: true, data: highlight });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a highlight
router.delete('/highlights/:highlightId', async (req, res) => {
  try {
    await Highlight.findByIdAndDelete(req.params.highlightId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get stories for a highlight
router.get('/highlights/:highlightId/stories', async (req, res) => {
  try {
    const { highlightId } = req.params;
    const Highlight = getHighlight();
    const highlight = await Highlight.findById(highlightId);
    
    if (!highlight) {
      return res.status(404).json({ success: false, error: 'Highlight not found' });
    }

    // Try to use items if available, fallback to stories array
    const storyIds = highlight.items?.length > 0
      ? highlight.items.map(item => typeof item === 'string' ? item : item.id)
      : highlight.stories || [];

    if (!storyIds || storyIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Fetch the actual Story documents using the IDs
    const Story = mongoose.model('Story');
    const storiesArray = await Story.find({
      _id: { $in: storyIds.filter(id => mongoose.Types.ObjectId.isValid(id)) }
    }).lean();

    // Reconstruct with image/video urls which ProfileViewer expects
    const enrichedStories = storiesArray.map(story => ({
      ...story,
      id: String(story._id),
      imageUrl: story.image || null,
      videoUrl: story.video || null,
      mediaUrl: story.image || story.video || null,
      mediaType: story.video ? 'video' : 'image',
    }));

    // Sort to maintain original order if possible
    enrichedStories.sort((a, b) => {
      const idxA = storyIds.indexOf(a.id);
      const idxB = storyIds.indexOf(b.id);
      return idxA - idxB;
    });

    res.json({ success: true, data: enrichedStories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
