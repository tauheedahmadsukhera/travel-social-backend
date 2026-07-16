const mongoose = require('mongoose');

const ArchivedNotificationSchema = new mongoose.Schema({
  recipientId: { type: String, required: true, index: true },
  senderId: String,
  senderName: String,
  senderAvatar: String,
  type: String,
  message: String,
  createdAt: { type: Date, required: true, index: true },
  read: { type: Boolean, default: true },
  postId: String,
  commentId: String,
  archivedAt: { type: Date, default: Date.now }
});

ArchivedNotificationSchema.index({ recipientId: 1, createdAt: -1 });

module.exports = mongoose.models.ArchivedNotification || mongoose.model('ArchivedNotification', ArchivedNotificationSchema);
