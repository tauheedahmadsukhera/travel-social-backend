const mongoose = require('mongoose');

const highlightSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: String,
  description: String,
  image: String,
  coverImage: String,
  stories: [String],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Highlight', highlightSchema);
