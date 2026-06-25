const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true }, // Used as title
  postIds: { type: [String], default: [] },
  coverImage: { type: String, default: null }, // Used as cover image
  visibility: { type: String, enum: ['public', 'private', 'specific'], default: 'private' },
  collaborators: { type: [String], default: [] },
  allowedUsers: { type: [String], default: [] },
  allowedGroups: { type: [String], default: [] },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Section', sectionSchema);
