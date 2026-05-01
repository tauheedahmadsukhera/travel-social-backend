const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['friends', 'family', 'custom'], default: 'custom' },
  members: [{ type: String, index: true }],   // array of user IDs
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Group || mongoose.model('Group', groupSchema);
