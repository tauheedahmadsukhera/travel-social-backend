console.log('📌 Loading categories routes...');
const express = require('express');
const router = express.Router();

const Category = require('../../models/Category');
const cacheMiddleware = require('../../middleware/cacheMiddleware');
const { verifyToken, isAdmin } = require('../../middleware/authMiddleware');

// GET /api/categories - Return all categories from DB (Cached for 1 hour)
router.get('/', cacheMiddleware(3600), async (req, res) => {
  try {
    const categories = await Category.find();
    res.status(200).json({ success: true, data: Array.isArray(categories) ? categories : [] });
  } catch (err) {
    res.status(200).json({ success: true, data: [] });
  }
});

// POST /api/categories - Admin only
router.post('/', verifyToken, isAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    const category = new Category({ name: name.trim() });
    await category.save();
    res.json({ success: true, data: category });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create category' });
  }
});

module.exports = router;
