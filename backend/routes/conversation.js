// routes/conversation.js
const express = require('express');
const router = express.Router();
const Conversation = require('../src/models/Conversation');

// Get messages for a conversation
router.get('/:id/messages', async (req, res) => {
  try {
    const convo = await Conversation.findById(req.params.id);
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ messages: convo.messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send a message (add to conversation)
router.post('/:id/messages', async (req, res) => {
  try {
    const { senderId, sender, text, recipientId, replyTo, read } = req.body;
    const mongoose = require('mongoose');
    
    // Accept both senderId and sender for compatibility
    const actualSenderId = senderId || sender;
    if (!actualSenderId || !text) {
      return res.status(400).json({ error: 'Missing senderId and/or text' });
    }

    const convo = await Conversation.findById(req.params.id);
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    
    const messageId = new mongoose.Types.ObjectId();
    const message = { 
      id: messageId.toString(),
      senderId: actualSenderId, 
      text,
      read: read || false,
      timestamp: new Date()
    };
    
    // Add recipientId if provided
    if (recipientId) {
      message.recipientId = recipientId;
    }
    
    // Add replyTo if replying to a message
    if (replyTo) {
      message.replyTo = replyTo;
    }
    
    const actualConversationId = convo.conversationId || String(convo._id);

    // Dual-write: embedded array + Message collection
    convo.messages.push(message);
    convo.updatedAt = new Date();
    await convo.save();

    try {
      const Message = mongoose.model('Message');
      await Message.create({
        _id: messageId,
        id: messageId.toString(),
        conversationId: actualConversationId,
        senderId: actualSenderId,
        recipientId: recipientId || undefined,
        text,
        timestamp: message.timestamp,
        read: read || false,
        replyTo: replyTo || undefined,
      });
    } catch (e) {
      console.warn('[conversation] Message collection write failed (non-fatal):', e?.message);
    }
    
    res.json({ success: true, message });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
