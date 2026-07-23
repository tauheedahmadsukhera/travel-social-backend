const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../src/middleware/authMiddleware');
const { resolveUserIdentifiers } = require('../src/utils/userUtils');

const cacheMiddleware = require('../src/middleware/cacheMiddleware');

let LiveStream;
try {
  LiveStream = mongoose.model('LiveStream');
} catch {
  LiveStream = mongoose.model('LiveStream', new mongoose.Schema({
    userId: String,
    title: String,
    isActive: Boolean,
    createdAt: { type: Date, default: Date.now }
  }));
}

// GET /api/live-streams - Return all active live streams (short cache for map polling)
router.get('/', cacheMiddleware(10), async (req, res) => {
  try {
    const streams = await LiveStream.find({ isActive: true }).lean();
    res.status(200).json({ success: true, data: Array.isArray(streams) ? streams : [] });
  } catch (err) {
    res.status(200).json({ success: true, data: [] });
  }
});

// POST /api/live-streams - Start a new live stream (auth required)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { title } = req.body;
    const stream = new LiveStream({
      userId: String(req.userId),
      title: title || 'Live',
      isActive: true
    });
    await stream.save();
    res.json({ success: true, data: stream });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create live stream' });
  }
});

// PATCH /api/live-streams/:id/end - End a live stream (owner or admin)
router.patch('/:id/end', verifyToken, async (req, res) => {
  try {
    const stream = await LiveStream.findById(req.params.id);
    if (!stream) return res.status(404).json({ success: false, error: 'Stream not found' });

    const ownerResolved = await resolveUserIdentifiers(stream.userId);
    const meResolved = await resolveUserIdentifiers(req.userId);
    const isOwner = ownerResolved.candidates.some(c =>
      meResolved.candidates.map(String).includes(String(c))
    );
    if (!isOwner && req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    stream.isActive = false;
    await stream.save();
    res.json({ success: true, data: stream });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to end live stream' });
  }
});

module.exports = router;
