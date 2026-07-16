const mongoose = require('mongoose');

const ReactionSchema = new mongoose.Schema({
  postId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  userName: String,
  userAvatar: String,
  emoji: { type: String, default: '❤️' },
  createdAt: { type: Date, default: Date.now }
});

// Ensure a user can only have one reaction per post
ReactionSchema.index({ postId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.Reaction || mongoose.model('Reaction', ReactionSchema);
