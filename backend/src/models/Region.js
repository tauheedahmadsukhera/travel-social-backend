const mongoose = require('mongoose');

const RegionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  countryCode: { type: String }, // e.g., 'PK', 'US'
  image: { type: String, default: null }, // Cloudinary URL
  type: { type: String, enum: ['country', 'region', 'city'], default: 'country' },
  order: { type: Number, default: 0 },
  regionKey: { type: String }, // for grouping e.g. 'europe', 'asia'
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.Region || mongoose.model('Region', RegionSchema);
