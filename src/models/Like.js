const mongoose = require('mongoose');

const LikeSchema = new mongoose.Schema({
  postId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now }
});

// Compound index to ensure uniqueness and fast lookup
LikeSchema.index({ postId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.Like || mongoose.model('Like', LikeSchema);
