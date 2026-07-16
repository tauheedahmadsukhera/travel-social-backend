const mongoose = require('mongoose');

const SaveSchema = new mongoose.Schema({
  postId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now }
});

// Compound index to ensure uniqueness and fast lookup
SaveSchema.index({ postId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.Save || mongoose.model('Save', SaveSchema);
