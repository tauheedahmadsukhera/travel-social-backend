const mongoose = require('mongoose');

const highlightSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: String,
  description: String,
  image: String,
  coverImage: String,
  stories: [String], // Array of story IDs (for compatibility)
  items: [mongoose.Schema.Types.Mixed], // Array of story objects { id, type, url }
  visibility: { type: String, default: 'Public' }, // Public, Private, Friends
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Highlight', highlightSchema);
