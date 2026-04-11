const Notification = require('../models/Notification');
const mongoose = require('mongoose');

// Create notification
exports.createNotification = async (req, res) => {
  try {
    const { recipientId, type, message, relatedPostId, relatedUserId } = req.body;

    if (!recipientId || !type || !message) {
      return res.status(400).json({ success: false, error: 'recipientId, type, and message required' });
    }

    const db = mongoose.connection.db;
    const notificationsCollection = db.collection('notifications');

    const notification = {
      recipientId,
      type,  // 'like', 'comment', 'follow', 'message', etc.
      message,
      relatedPostId: relatedPostId || null,
      relatedUserId: relatedUserId || null,
      read: false,
      createdAt: new Date()
    };

    const result = await Notification.create(notification);

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get notifications for user
exports.getUserNotifications = async (req, res) => {
  try {
    const { userId } = req.params;

    const db = mongoose.connection.db;
    const notificationsCollection = db.collection('notifications');

    const notifs = await Notification
      .find({ recipientId: userId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, data: notifs || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
};
