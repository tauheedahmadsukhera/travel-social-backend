const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { get: cacheGet, set: cacheSet } = require('../utils/redis');

// GET /api/public/categories
router.get('/categories', async (req, res, next) => {
  try {
    const cacheKey = 'public:categories';
    const cachedData = await cacheGet(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData });
    }

    const Category = mongoose.model('Category');
    const categories = await Category.find().sort({ name: 1 });
    
    await cacheSet(cacheKey, categories, 86400); // 24 hours
    res.json({ success: true, data: categories });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/regions
router.get('/regions', async (req, res, next) => {
  try {
    const cacheKey = 'public:regions';
    const cachedData = await cacheGet(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData });
    }

    const Region = mongoose.model('Region');
    const regions = await Region.find().sort({ name: 1 });
    
    await cacheSet(cacheKey, regions, 86400); // 24 hours
    res.json({ success: true, data: regions });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
