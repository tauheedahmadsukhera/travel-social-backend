const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// GET /api/regions - Public route with mapping for Mobile App
router.get('/', async (req, res) => {
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

    // Explicitly set JSON content type and no-cache
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).send(JSON.stringify({ success: true, data: mappedRegions }));
  } catch (err) {
    console.error('[GET /api/regions] ❌ Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
