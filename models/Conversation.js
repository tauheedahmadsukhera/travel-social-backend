// models/Conversation.js
const mongoose = require('mongoose');
const ConversationSchema = new mongoose.Schema({
  conversationId: { type: String, unique: true, sparse: true, index: true }, // String ID like "user1_user2"
  participants: { type: [String], index: true }, // user IDs - indexed for fast queries
  isGroup: { type: Boolean, default: false, index: true },
  groupName: { type: String, trim: true },
  groupAvatar: { type: String, trim: true },
  groupDescription: { type: String, trim: true },
  groupAdminIds: { type: [String], default: [] },
  archivedBy: { type: [String], default: [] },
  deletedBy: { type: [String], default: [] },
  clearedBy: { type: Map, of: Date, default: {} },
  messages: [{
    id: String,
    senderId: String,
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
    createdAt: { type: Date, default: Date.now },
    readBy: { type: [String], default: [] },
    read: { type: Boolean, default: false },
    delivered: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now }
  }],
  lastMessage: String,
  lastMessageAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);
