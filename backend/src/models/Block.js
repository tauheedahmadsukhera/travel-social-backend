const mongoose = require('mongoose');

const BlockSchema = new mongoose.Schema({
  blockerId: { type: String, required: true, index: true },
  blockedId: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now }
});

// Compound index to prevent duplicate blocks
BlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

module.exports = mongoose.models.Block || mongoose.model('Block', BlockSchema);
