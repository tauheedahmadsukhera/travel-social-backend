const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  image: { type: String, default: null }, // Cloudinary URL
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.Category || mongoose.model('Category', CategorySchema);
