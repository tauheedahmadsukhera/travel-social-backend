const mongoose = require('mongoose');

const CollaboratorSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  addedAt: { type: Date, default: Date.now },
}, { _id: false });

const SectionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },   // owner
  name: { type: String, required: true },
  postIds: [String],
  coverImage: { type: String },

  // Visibility: who can see this collection
  visibility: {
    type: String,
    enum: ['public', 'private', 'specific'],
    default: 'private',
  },

  // Specific users (when visibility = 'specific')
  specificUsers: [String],

  // Collaborators: can add posts, but cannot edit/delete
  collaborators: [CollaboratorSchema],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

SectionSchema.index({ userId: 1, createdAt: 1 });

module.exports = mongoose.model('Section', SectionSchema);