const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, index: true },
  id: { type: String, index: true }, // The frontend-generated ID or fallback
  senderId: { type: String, required: true, index: true },
  sender: String,
  text: String,
  recipientId: String,
  // ===== MEDIA SUPPORT =====
  mediaType: { type: String, enum: ['text', 'image', 'video', 'audio', 'post', 'story'], default: 'text' },
  mediaUrl: String, // Single media URL
  mediaUrls: [String], // Multiple media URLs
  audioUrl: String, // Audio note URL
  audioDuration: Number, // Duration in seconds
  thumbnailUrl: String, // Video thumbnail
  // ===== SHARED POST SUPPORT =====
  sharedPost: {
    postId: String,
    imageUrl: String,
    mediaUrls: [String],
    mediaCount: Number,
    text: String,
    caption: String,
    userId: String,
    userDisplayName: String,
    userName: String,
    userAvatar: String,
  },
  // ===== SHARED STORY SUPPORT =====
  sharedStory: {
    storyId: String,
    id: String,
    mediaUrl: String,
    mediaType: String,
    userId: String,
    userName: String,
    userAvatar: String,
  },
  // ===== REPLY & REACTIONS =====
  replyTo: {
    id: String,
    text: String,
    senderId: String,
    mediaUrl: String
  },
  reactions: {
    type: Map,
    of: [String]
  },
  tempId: String, // Link to client-side optimistic UI
  readBy: { type: [String], default: [] },
  read: { type: Boolean, default: false },
  delivered: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.models.Message || mongoose.model('Message', MessageSchema);
