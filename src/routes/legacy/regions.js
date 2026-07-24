const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const cacheMiddleware = require('../../middleware/cacheMiddleware');

// GET /api/regions - Public route with mapping for Mobile App (Cached for 1 hour)
router.get('/', cacheMiddleware(3600), async (req, res) => {
  try {
    const Region = mongoose.model('Region');
    const regions = await Region.find().sort({ name: 1 });
    
    console.log(`[GET /api/regions] 📡 Sending ${regions.length} regions to Mobile App`);

    // Map 'type' to 'section' and '_id' to 'id' for Mobile App compatibility
    const mappedRegions = regions.map(r => ({
      id: r._id,
      name: r.name,
      image: r.image,
      section: r.type || 'country', // App expects 'section'
      countryCode: r.countryCode
    }));

    res.status(200).json({ success: true, data: mappedRegions });
  } catch (err) {
    console.error('[GET /api/regions] ❌ Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
