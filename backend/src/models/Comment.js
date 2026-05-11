const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  postId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  userName: String,
  userAvatar: String,
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  likes: { type: [String], default: [] },
  likesCount: { type: Number, default: 0 },
  replies: { type: [Object], default: [] },
  reactions: { type: Map, of: [String], default: {} },
  editedAt: Date
});

CommentSchema.index({ postId: 1, createdAt: -1 });

module.exports = mongoose.models.Comment || mongoose.model('Comment', CommentSchema);
