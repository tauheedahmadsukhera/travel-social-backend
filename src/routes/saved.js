const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
const { verifyToken } = require('../middleware/authMiddleware');
const { resolveUserIdentifiers } = require('../utils/userUtils');

// Helper: assert caller is acting on their own userId (IDOR guard)
const assertSelf = async (callerJwtId, paramUserId, res) => {
  const { candidates } = await resolveUserIdentifiers(callerJwtId);
  const paramCandidates = await resolveUserIdentifiers(paramUserId).then(r => r.candidates);
  // Check for any intersection
  const isSelf = candidates.some(c => paramCandidates.includes(c));
  if (!isSelf) {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return false;
  }
  return true;
};

// POST - Save a post (JWT required, self-only)
router.post('/:userId/saved', verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;

        if (!(await assertSelf(req.userId, userId, res))) return;

        const { postId } = req.body;
        if (!postId) {
            return res.status(400).json({ success: false, error: 'Missing postId' });
        }

        let user = await User.findById(userId) || await User.findOne({ uid: userId });
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        if (user.savedPosts && user.savedPosts.includes(postId)) {
            return res.json({ success: true, message: 'Post already saved' });
        }

        if (!user.savedPosts) user.savedPosts = [];
        user.savedPosts.push(postId);
        await user.save();

        try {
            const post = await Post.findById(postId);
            if (post) {
                if (!post.savedBy) post.savedBy = [];
                if (!post.savedBy.includes(userId)) {
                    post.savedBy.push(userId);
                    post.savesCount = (post.savesCount || 0) + 1;
                    await post.save();
                }
            }
        } catch (postErr) {
            console.warn('[SAVED] Could not update post.savedBy:', postErr.message);
        }

        return res.json({ success: true, message: 'Post saved successfully' });
    } catch (err) {
        console.error('[SAVED] POST error:', err.message);
        return res.status(500).json({ success: false, error: 'Operation failed' });
    }
});

// DELETE - Unsave a post (JWT required, self-only)
router.delete('/:userId/saved/:postId', verifyToken, async (req, res) => {
    try {
        const { userId, postId } = req.params;

        if (!(await assertSelf(req.userId, userId, res))) return;

        let user = await User.findById(userId) || await User.findOne({ uid: userId });
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        if (user.savedPosts) {
            user.savedPosts = user.savedPosts.filter(id => id !== postId && id.toString() !== postId);
            await user.save();
        }

        try {
            const post = await Post.findById(postId);
            if (post && post.savedBy) {
                post.savedBy = post.savedBy.filter(id => id !== userId && id.toString() !== userId);
                post.savesCount = Math.max((post.savesCount || 1) - 1, 0);
                await post.save();
            }
        } catch (postErr) {
            console.warn('[SAVED] Could not update post.savedBy:', postErr.message);
        }

        return res.json({ success: true, message: 'Post unsaved successfully' });
    } catch (err) {
        console.error('[SAVED] DELETE error:', err.message);
        return res.status(500).json({ success: false, error: 'Operation failed' });
    }
});

// GET - Get user's saved posts (JWT required, self-only)
router.get('/:userId/saved', verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;

        if (!(await assertSelf(req.userId, userId, res))) return;

        const { limit = 50 } = req.query;

        let user = await User.findById(userId) || await User.findOne({ uid: userId });
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found', data: [] });
        }

        const savedPostIds = user.savedPosts || [];
        if (savedPostIds.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const posts = await Post.find({
            _id: {
                $in: savedPostIds.map(id => {
                    try { return new mongoose.Types.ObjectId(id); } catch { return id; }
                })
            }
        }).sort({ createdAt: -1 }).limit(parseInt(limit));

        return res.json({ success: true, data: posts });
    } catch (err) {
        console.error('[SAVED] GET error:', err.message);
        return res.status(500).json({ success: false, error: err.message, data: [] });
    }
});

module.exports = router;
