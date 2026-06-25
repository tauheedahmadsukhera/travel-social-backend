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
  // Messages are now stored in a separate Message collection linking to conversationId
  // to avoid hitting the 16MB MongoDB document limit.
  lastMessage: String,
  lastMessageAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

ConversationSchema.index({ participants: 1, lastMessageAt: -1 });
ConversationSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);

