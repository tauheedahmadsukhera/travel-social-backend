const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Helper to escape regex
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /meta - Get metadata for a location (visit counts, etc.)
router.get('/meta', async (req, res) => {
  try {
    const location = (req.query.location || '').trim();
    if (!location) return res.status(400).json({ success: false, error: 'location required' });

    const Post = mongoose.model('Post');
    const regex = new RegExp(escapeRegExp(location), 'i');

    const query = {
      $or: [
        { locationKeys: { $in: [location.toLowerCase(), location] } },
        { location: regex },
        { 'locationData.name': regex }
      ]
    };

    const count = await Post.countDocuments(query);
    const verifiedCount = await Post.countDocuments({ ...query, 'locationData.verified': true });

    res.json({
      success: true,
      data: {
        location,
        visits: count,
        postCount: count,
        verifiedVisits: verifiedCount
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /suggest - Autocomplete for locations
router.get('/suggest', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ success: true, data: [] });

    const limit = Math.min(parseInt(req.query.limit || '10'), 25);
    const Post = mongoose.model('Post');
    const regex = new RegExp(escapeRegExp(q), 'i');

    const results = await Post.aggregate([
      { $match: { $or: [{ location: regex }, { 'locationData.name': regex }] } },
      { $group: { _id: { $ifNull: ['$locationData.name', '$location'] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]);

    const data = results.map(r => ({
      name: r._id,
      count: r.count
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
});

module.exports = router;
