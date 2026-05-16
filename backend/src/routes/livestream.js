const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/authMiddleware');

// GET / - Get all active livestreams (public — no auth needed)
router.get('/', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const livestreams = await db.collection('livestreams')
      .find({ isLive: true })
      .sort({ startedAt: -1 })
      .toArray();
    res.json({ success: true, data: livestreams || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

// GET /:id - Get livestream by ID (public)
router.get('/:id', async (req, res) => {
  try {
    const objectId = mongoose.Types.ObjectId.isValid(req.params.id)
      ? new mongoose.Types.ObjectId(req.params.id)
      : req.params.id;
    const livestream = await mongoose.connection.db
      .collection('livestreams')
      .findOne({ _id: objectId });
    if (!livestream) return res.status(404).json({ success: false, error: 'Livestream not found' });
    res.json({ success: true, data: livestream });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// GET /user/:userId - Get broadcaster's active stream (public)
router.get('/user/:userId', async (req, res) => {
  try {
    const livestream = await mongoose.connection.db
      .collection('livestreams')
      .findOne({ userId: req.params.userId, isLive: true });
    res.json({ success: true, data: livestream });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// POST / - Start livestream (JWT required — userId from token)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { title, description } = req.body;
    const userId = req.userId; // From JWT — not body

    if (!title) {
      return res.status(400).json({ success: false, error: 'title required' });
    }

    const livestream = {
      userId,
      title,
      description: description || '',
      isLive: true,
      viewers: [],
      viewerCount: 0,
      startedAt: new Date(),
      endedAt: null,
      likes: [],
      likesCount: 0
    };

    const result = await mongoose.connection.db
      .collection('livestreams')
      .insertOne(livestream);

    res.status(201).json({ success: true, data: { ...livestream, _id: result.insertedId } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// PUT /:id/end - End livestream (JWT required, owner only)
router.put('/:id/end', verifyToken, async (req, res) => {
  try {
    const objectId = mongoose.Types.ObjectId.isValid(req.params.id)
      ? new mongoose.Types.ObjectId(req.params.id)
      : req.params.id;

    const coll = mongoose.connection.db.collection('livestreams');
    const stream = await coll.findOne({ _id: objectId });
    if (!stream) return res.status(404).json({ success: false, error: 'Livestream not found' });
    if (String(stream.userId) !== req.userId) {
      return res.status(403).json({ success: false, error: 'Forbidden: not your stream' });
    }

    const result = await coll.findOneAndUpdate(
      { _id: objectId },
      { $set: { isLive: false, endedAt: new Date() } },
      { returnDocument: 'after' }
    );
    res.json({ success: true, data: result.value });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// POST /:id/join - Join livestream (JWT required — userId from token)
router.post('/:id/join', verifyToken, async (req, res) => {
  try {
    const objectId = mongoose.Types.ObjectId.isValid(req.params.id)
      ? new mongoose.Types.ObjectId(req.params.id)
      : req.params.id;

    const { userName, userAvatar } = req.body;
    const viewer = { odId: req.userId, name: userName, avatar: userAvatar, joinedAt: new Date() };

    const result = await mongoose.connection.db
      .collection('livestreams')
      .findOneAndUpdate(
        { _id: objectId },
        { $addToSet: { viewers: viewer }, $inc: { viewerCount: 1 } },
        { returnDocument: 'after' }
      );

    if (!result.value) return res.status(404).json({ success: false, error: 'Livestream not found' });
    res.json({ success: true, data: result.value });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// POST /:id/leave - Leave livestream (JWT required)
router.post('/:id/leave', verifyToken, async (req, res) => {
  try {
    const objectId = mongoose.Types.ObjectId.isValid(req.params.id)
      ? new mongoose.Types.ObjectId(req.params.id)
      : req.params.id;

    const result = await mongoose.connection.db
      .collection('livestreams')
      .findOneAndUpdate(
        { _id: objectId },
        { $pull: { viewers: { odId: req.userId } }, $inc: { viewerCount: -1 } },
        { returnDocument: 'after' }
      );
    res.json({ success: true, data: result.value });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// POST /:id/like - Like livestream (JWT required)
router.post('/:id/like', verifyToken, async (req, res) => {
  try {
    const objectId = mongoose.Types.ObjectId.isValid(req.params.id)
      ? new mongoose.Types.ObjectId(req.params.id)
      : req.params.id;

    const result = await mongoose.connection.db
      .collection('livestreams')
      .findOneAndUpdate(
        { _id: objectId },
        { $addToSet: { likes: req.userId }, $inc: { likesCount: 1 } },
        { returnDocument: 'after' }
      );
    res.json({ success: true, data: result.value });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// POST /:id/comments - Send comment in livestream (JWT required)
router.post('/:id/comments', verifyToken, async (req, res) => {
  try {
    const objectId = mongoose.Types.ObjectId.isValid(req.params.id)
      ? new mongoose.Types.ObjectId(req.params.id)
      : req.params.id;

    const { userName, userAvatar, text } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ success: false, error: 'text required' });
    }

    const comment = {
      _id: new mongoose.Types.ObjectId(),
      userId: req.userId,  // From JWT
      userName,
      userAvatar,
      text,
      createdAt: new Date()
    };

    await mongoose.connection.db
      .collection('livestreams')
      .findOneAndUpdate(
        { _id: objectId },
        { $push: { comments: comment } },
        { returnDocument: 'after' }
      );

    res.json({ success: true, data: comment });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

module.exports = router;
