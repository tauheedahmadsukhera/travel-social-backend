const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipientId: { type: String, required: true, index: true },
  senderId: String,
  senderName: String,
  senderAvatar: String,
  type: String,
  message: String,
  createdAt: { type: Date, default: Date.now, index: true },
  read: { type: Boolean, default: false },
  postId: String,
  commentId: String
});

// Performance Indexes
// 1. Fetching notifications ordered by time is extremely fast now
NotificationSchema.index({ recipientId: 1, createdAt: -1 });
// 2. TTL Index: Automatically delete notifications older than 30 days (saves space)
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
