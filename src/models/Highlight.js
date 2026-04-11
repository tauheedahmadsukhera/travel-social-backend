const mongoose = require('mongoose');

const HighlightStorySchema = new mongoose.Schema({
  storyId:   { type: String },
  imageUrl:  { type: String },
  videoUrl:  { type: String },
  mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const HighlightSchema = new mongoose.Schema({
  userId:     { type: String, required: true, index: true },
  title:      { type: String, required: true },
  coverImage: { type: String },
  stories:    { type: [HighlightStorySchema], default: [] },
  createdAt:  { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now }
});

module.exports = mongoose.model('Highlight', HighlightSchema);