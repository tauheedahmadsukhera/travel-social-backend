const mongoose = require('mongoose');

const passportSchema = new mongoose.Schema({
  userId: String,
  ticketCount: { type: Number, default: 0 },
  stamps: [{
    type: { type: String, enum: ['country', 'city', 'place'], default: 'country' },
    name: String,
    countryCode: String,
    parentCountry: String, // For cities/places
    parentCity: String,    // For places
    lat: Number,
    lon: Number,
    count: { type: Number, default: 1 },
    visitHistory: [{
      visitedAt: { type: Date, default: Date.now },
      lat: Number,
      lon: Number
    }],
    createdAt: { type: Date, default: Date.now }
  }],
  lastVisitedCountry: String, // To track re-entry logic
  lastVisitedCity: String,
  lastVisitedPlace: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Passport || mongoose.model('Passport', passportSchema);
