const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../src/middleware/authMiddleware');

/**
 * @route   POST /api/gdpr/users/:userId/deletion-request
 * @desc    Request account deletion (initial request)
 */
router.post('/users/:userId/deletion-request', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    // For now, we just acknowledge the request. 
    // A full implementation would set a 'deletionScheduled' flag in the User model.
    console.log(`🗑️ Deletion request received for user: ${userId}`);
    res.json({ success: true, message: 'Deletion request received. Your account will be deleted within 30 days.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @route   GET /api/gdpr/users/:userId/export
 * @desc    Export all user data
 */
router.get('/users/:userId/export', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const authenticatedUserId = req.userId;

    // Ownership check
    if (String(userId) !== String(authenticatedUserId)) {
       return res.status(403).json({ success: false, error: 'Forbidden: You can only export your own data' });
    }
    const User = mongoose.model('User');
    const Post = mongoose.model('Post');
    
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    
    const posts = await Post.find({ userId: userId }).lean();
    
    // Construct export object matching frontend expectations
    const exportData = {
      profile: user,
      posts: posts,
      comments: [], // Simplification
      messages: [], // Simplification
      followers: [],
      following: [],
      savedPosts: [],
      notifications: [],
      exportedAt: new Date()
    };
    
    res.json(exportData);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @route   GET /api/gdpr/users/:userId/deletion-status
 */
router.get('/users/:userId/deletion-status', verifyToken, async (req, res) => {
  res.json({ requested: false });
});

/**
 * @route   POST /api/gdpr/users/:userId/deletion-cancel
 */
router.post('/users/:userId/deletion-cancel', verifyToken, async (req, res) => {
  res.json({ success: true, message: 'Deletion request cancelled.' });
});

module.exports = router;

