const Highlight = require('../models/Highlight');

// Helper – normalise an incoming story entry from the client
function normaliseStory(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    return { storyId: entry, imageUrl: '', mediaType: 'image', createdAt: new Date() };
  }
  return {
    storyId:   entry.storyId   || entry.id   || '',
    imageUrl:  entry.imageUrl  || entry.image || entry.imageUri || '',
    videoUrl:  entry.videoUrl  || entry.videoUri || '',
    mediaType: entry.mediaType || (entry.videoUrl ? 'video' : 'image'),
    createdAt: entry.createdAt ? new Date(entry.createdAt) : new Date()
  };
}

// GET /api/highlights?userId=...
exports.getHighlightsByUser = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
    const highlights = await Highlight.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: highlights });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/highlights
exports.createHighlight = async (req, res) => {
  try {
    const { userId, title, coverImage, stories = [], storySnapshot } = req.body;
    if (!userId || !title) return res.status(400).json({ success: false, error: 'userId and title required' });

    let resolvedStories = [];
    if (storySnapshot) {
      const s = normaliseStory(storySnapshot);
      if (s) resolvedStories = [s];
    } else if (Array.isArray(stories) && stories.length > 0) {
      resolvedStories = stories.map(normaliseStory).filter(Boolean);
    }

    const coverUrl = coverImage || (resolvedStories[0] && resolvedStories[0].imageUrl) || '';

    const highlight = new Highlight({
      userId,
      title,
      coverImage: coverUrl,
      stories: resolvedStories,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await highlight.save();
    res.status(201).json({ success: true, data: highlight, id: highlight._id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/highlights/:id/stories
exports.addStoryToHighlight = async (req, res) => {
  try {
    const { id } = req.params;
    const { storySnapshot } = req.body;

    const highlight = await Highlight.findById(id);
    if (!highlight) return res.status(404).json({ success: false, error: 'Highlight not found' });

    const entry = normaliseStory(storySnapshot);
    if (!entry) return res.status(400).json({ success: false, error: 'story data required' });

    const alreadyIn = highlight.stories.some(s => s.storyId === entry.storyId);
    if (!alreadyIn) {
      highlight.stories.push(entry);
      if (!highlight.coverImage && entry.imageUrl) highlight.coverImage = entry.imageUrl;
      highlight.updatedAt = new Date();
      await highlight.save();
    }

    res.json({ success: true, data: highlight });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// DELETE /api/highlights/:id/stories/:storyId
exports.removeStoryFromHighlight = async (req, res) => {
  try {
    const { id, storyId } = req.params;

    const highlight = await Highlight.findById(id);
    if (!highlight) return res.status(404).json({ success: false, error: 'Highlight not found' });

    highlight.stories = highlight.stories.filter(s => s.storyId !== storyId);
    highlight.updatedAt = new Date();
    await highlight.save();

    res.json({ success: true, data: highlight });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// PATCH /api/highlights/:id
exports.updateHighlight = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, coverImage } = req.body;

    const highlight = await Highlight.findById(id);
    if (!highlight) return res.status(404).json({ success: false, error: 'Highlight not found' });

    if (title !== undefined) highlight.title = title;
    if (coverImage !== undefined) highlight.coverImage = coverImage;
    highlight.updatedAt = new Date();

    await highlight.save();
    res.json({ success: true, data: highlight });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// DELETE /api/highlights/:id
exports.deleteHighlight = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const highlight = await Highlight.findById(id);
    if (!highlight) return res.status(404).json({ success: false, error: 'Highlight not found' });

    if (userId && highlight.userId !== String(userId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    await Highlight.deleteOne({ _id: id });
    res.json({ success: true, message: 'Highlight deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
