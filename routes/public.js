const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// GET /api/public/categories
router.get('/categories', async (req, res, next) => {
  try {
    const Category = mongoose.model('Category');
    const categories = await Category.find().sort({ name: 1 });
    res.json({ success: true, data: categories });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/regions
router.get('/regions', async (req, res, next) => {
  try {
    const Region = mongoose.model('Region');
    const regions = await Region.find().sort({ name: 1 });
    res.json({ success: true, data: regions });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
