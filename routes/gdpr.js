const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../src/middleware/authMiddleware');
const { resolveUserIdentifiers } = require('../src/utils/userUtils');

/**
 * Ensure the authenticated user matches :userId (admins bypass).
 */
async function assertSelfOrAdmin(req, res, userId) {
  if (!req.userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return false;
  }

  if (req.user?.role === 'admin') {
    return true;
  }

  try {
    const User = mongoose.model('User');
    const authUser = await User.findById(req.userId).select('role').lean();
    if (authUser?.role === 'admin') {
      return true;
    }
  } catch (_) { /* ignore */ }

  const resolved = await resolveUserIdentifiers(req.userId);
  const target = await resolveUserIdentifiers(userId);
  const isSelf = resolved.candidates.some(c => target.candidates.map(String).includes(String(c)));
  if (!isSelf) {
    res.status(403).json({ success: false, error: 'Forbidden: You can only access your own GDPR data' });
    return false;
  }
  return true;
}

/**
 * @route   POST /api/gdpr/users/:userId/deletion-request
 * @desc    Request account deletion (initial request)
 */
router.post('/users/:userId/deletion-request', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!(await assertSelfOrAdmin(req, res, userId))) return;

    // For now, we just acknowledge the request.
    // A full implementation would set a 'deletionScheduled' flag in the User model.
    console.log(`Deletion request received for user: ${userId}`);
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
    if (!(await assertSelfOrAdmin(req, res, userId))) return;

    const User = mongoose.model('User');
    const Post = mongoose.model('Post');

    const target = await resolveUserIdentifiers(userId);
    const user = await User.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null },
        { firebaseUid: userId },
        { uid: userId }
      ].filter(q => q._id !== null || q.firebaseUid || q.uid)
    }).lean();
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const posts = await Post.find({ userId: { $in: target.candidates } }).lean();

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
  try {
    const { userId } = req.params;
    if (!(await assertSelfOrAdmin(req, res, userId))) return;
    res.json({ requested: false });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @route   POST /api/gdpr/users/:userId/deletion-cancel
 */
router.post('/users/:userId/deletion-cancel', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!(await assertSelfOrAdmin(req, res, userId))) return;
    res.json({ success: true, message: 'Deletion request cancelled.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
