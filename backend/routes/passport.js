console.log('🎫 Passport routes loading...');
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { resolveUserIdentifiers } = require('../src/utils/userUtils');

const logFile = path.join(__dirname, '../passport_debug.log');
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
};

log('🎫 Registering passport endpoints...');

router.use((req, res, next) => {
  log(`🕵️ Passport router saw: ${req.method} ${req.url}`);
  next();
});

// Passport model with hierarchical stamps
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

const Passport = mongoose.models.Passport || mongoose.model('Passport', passportSchema);

// Get passport for user
router.get('/users/:userId/passport', async (req, res) => {
  try {
    log(`📡 GET passport for user: ${req.params.userId}`);
    // Ensure model is registered (avoiding "model not found" errors)
    const Post = mongoose.models.Post || require('../models/Post');
    
    // Direct DB check for debugging
    const directCount = await mongoose.connection.db.collection('posts').countDocuments({});
    log(`[Passport] Direct DB total post count: ${directCount}`);

    const user = await resolveUserIdentifiers(req.params.userId);
    log(`[Passport] User candidates: ${JSON.stringify(user.candidates)}`);
    
    // Debug: Get ALL unique location keys in the DB
    const allKeys = await Post.distinct('locationKeys');
    log(`[Passport] ALL unique location keys in DB: ${JSON.stringify(allKeys)}`);

    let passport = await Passport.findOne({ userId: { $in: user.candidates } });
    
    if (!passport) {
      return res.json({ success: true, data: { ticketCount: 0, stamps: [] } });
    }

    // Convert passport to object for manipulation
    const passportObj = passport.toObject();

    // Function to normalize keys for matching (copied from src/index.js)
    const normalizeKey = (val) => String(val || '').trim().toLowerCase();

    // Attach real post counts to each stamp using countDocuments (more reliable)
    passportObj.stamps = await Promise.all(passportObj.stamps.map(async (stamp) => {
      const nameKey = normalizeKey(stamp.name);
      const codeKey = stamp.countryCode ? normalizeKey(stamp.countryCode) : null;

      // Build query to match name, country code, or raw location string (fallback)
      const nameRegex = new RegExp(`${nameKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      
      let query = { 
        $or: [
          { locationKeys: nameKey },
          { location: nameRegex }
        ]
      };
      
      if (stamp.type === 'country' && codeKey) {
        query.$or.push({ locationKeys: codeKey });
      }
      
      // Count total posts in the DB (all users) mapping to this location
      const postCount = await Post.countDocuments(query);

      log(`[Passport] Stamp "${stamp.name}" (Type: ${stamp.type}, Code: ${stamp.countryCode}) -> query: ${JSON.stringify(query)} -> count: ${postCount}`);

      return {
        ...stamp,
        postCount: postCount || 0
      };
    }));

    res.json({ success: true, data: passportObj });
  } catch (err) {
    log(`❌ [Passport] GET error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add stamp to passport (handles hierarchy and re-entry/counter logic)
router.post('/users/:userId/passport/locations', async (req, res) => {
  try {
    const user = await resolveUserIdentifiers(req.params.userId);
    const userId = user.canonicalId; // Use canonical ID for storage
    const { type, name, countryCode, parentCountry, parentCity, lat, lon } = req.body;

    if (!name || !type) {
      return res.status(400).json({ success: false, error: 'name and type (country|city|place) required' });
    }

    let passport = await Passport.findOne({ userId: { $in: user.candidates } });
    if (!passport) {
      passport = new Passport({ userId, stamps: [], ticketCount: 0 });
    } else {
      // Ensure existing passport uses canonical ID if it was stored with a variant
      passport.userId = userId;
    }

    const now = new Date();

    // Unified re-entry logic for all levels (country, city, place)
    // Find the last stamp of this specific type
    const lastVisitOfType = passport.stamps.filter(s => s.type === type).pop();

    // Determine if it's a different location than the last visit of this type
    const isDifferentLocation = !lastVisitOfType || 
      lastVisitOfType.name !== name || 
      (parentCountry && lastVisitOfType.parentCountry !== parentCountry) ||
      (parentCity && lastVisitOfType.parentCity !== parentCity);

    if (isDifferentLocation) {
      // New location or re-entry after visiting somewhere else
      passport.stamps.push({
        type,
        name,
        countryCode,
        parentCountry,
        parentCity,
        lat,
        lon,
        count: 1,
        visitHistory: [{ visitedAt: now, lat, lon }]
      });

      // Update the "last visited" tracker for this type
      if (type === 'country') passport.lastVisitedCountry = name;
      else if (type === 'city') passport.lastVisitedCity = name;
      else if (type === 'place') passport.lastVisitedPlace = name;
    } else {
      // Just updating the same location visit
      // User is still at (or has come back to) the same location continuously
      lastVisitOfType.count = (lastVisitOfType.count || 1) + 1;
      lastVisitOfType.visitHistory.push({ visitedAt: now, lat, lon });
    }

    passport.ticketCount = passport.stamps.length;
    await passport.save();

    res.json({ success: true, data: passport });
  } catch (err) {
    console.error('Passport add error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Remove stamp from passport
router.delete('/users/:userId/passport/stamps/:stampId', async (req, res) => {
  try {
    const { userId, stampId } = req.params;

    let passport = await Passport.findOne({ userId });
    if (passport) {
      passport.stamps = passport.stamps.filter(s => s._id.toString() !== stampId);
      passport.ticketCount = passport.stamps.length;
      await passport.save();
    }

    res.json({ success: true, data: passport });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
