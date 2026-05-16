const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/authMiddleware');

// Send message (JWT required — fromUserId from token)
router.post('/', verifyToken, async (req, res) => {
  try {
    const fromUserId = req.userId; // From JWT — never trust body
    const { toUserId, text } = req.body;

    if (!toUserId || !text) {
      return res.status(400).json({ success: false, error: 'toUserId and text required' });
    }

    const Message = mongoose.model('Message');

    const message = {
      fromUserId,
      toUserId,
      text,
      read: false,
      createdAt: new Date()
    };

    const result = await Message.create(message);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// Get messages for user (inbox) — JWT required, self-only
router.get('/user/:userId', verifyToken, async (req, res) => {
  try {
    if (req.userId !== req.params.userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const Message = mongoose.model('Message');
    const messages = await Message
      .find({ toUserId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, data: messages || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

// Get conversation between two users — JWT required, participant-only
router.get('/:userId/:otherUserId', verifyToken, async (req, res) => {
  try {
    const { userId, otherUserId } = req.params;

    // Caller must be one of the two participants
    if (req.userId !== userId && req.userId !== otherUserId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const Message = mongoose.model('Message');
    const messages = await Message
      .find({
        $or: [
          { fromUserId: userId, toUserId: otherUserId },
          { fromUserId: otherUserId, toUserId: userId }
        ]
      })
      .sort({ createdAt: 1 });

    res.json({ success: true, data: messages || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

// Mark message as read — JWT required, recipient-only
router.put('/:messageId/read', verifyToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const objectId = mongoose.Types.ObjectId.isValid(messageId)
      ? new mongoose.Types.ObjectId(messageId)
      : messageId;

    const Message = mongoose.model('Message');
    const msg = await Message.findOne({ _id: objectId });

    if (!msg) return res.status(404).json({ success: false, error: 'Message not found' });

    // Only the recipient can mark a message as read
    if (String(msg.toUserId) !== req.userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const result = await Message.findOneAndUpdate(
      { _id: objectId },
      { $set: { read: true } },
      { new: true }
    );

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

module.exports = router;
