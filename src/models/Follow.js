const mongoose = require('mongoose');

const FollowSchema = new mongoose.Schema({
  followerId: { type: String, required: true, index: true },
  followingId: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now }
});

// Compound index for fast lookup of specific follow relationship
FollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

module.exports = mongoose.models.Follow || mongoose.model('Follow', FollowSchema);
