const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Send message
router.post('/', async (req, res) => {
  try {
    const { fromUserId, toUserId, text } = req.body;

    if (!fromUserId || !toUserId || !text) {
      return res.status(400).json({ success: false, error: 'fromUserId, toUserId, and text required' });
    }

    const db = mongoose.connection.db;
    const messagesCollection = db.collection('messages');

    const message = {
      fromUserId,
      toUserId,
      text,
      read: false,
      createdAt: new Date()
    };

    const result = await Message.create(message);

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// Get messages for user (inbox)
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const Message = mongoose.model('Message');

    // Get messages sent to this user
    const messages = await Message
      .find({ toUserId: userId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, data: messages || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

// Get conversation between two users
router.get('/:userId/:otherUserId', async (req, res) => {
  try {
    const { userId, otherUserId } = req.params;

    const Message = mongoose.model('Message');

    // Get all messages between these two users
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

// Mark message as read
router.put('/:messageId/read', async (req, res) => {
  try {
    const { messageId } = req.params;

    const objectId = mongoose.Types.ObjectId.isValid(messageId) ? new mongoose.Types.ObjectId(messageId) : messageId;

    const db = mongoose.connection.db;
    const messagesCollection = db.collection('messages');

    const result = await Message.findOneAndUpdate(
      { _id: objectId },
      { $set: { read: true } },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

module.exports = router;
