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

        const { canonicalId, candidates } = await resolveUserIdentifiers(userId);

        const Save = mongoose.model('Save');

        const alreadySaved = await Save.findOne({
            postId: String(postId),
            userId: { $in: candidates }
        });

        if (alreadySaved) {
            return res.json({ success: true, message: 'Post already saved' });
        }

        // Create Save entry
        await Save.create({
            postId: String(postId),
            userId: canonicalId
        });

        // Increment counter on post
        try {
            await Post.updateOne(
                { _id: mongoose.Types.ObjectId.isValid(postId) ? new mongoose.Types.ObjectId(postId) : postId },
                { $inc: { savesCount: 1 } }
            );
        } catch (postErr) {
            console.warn('[SAVED] Could not update post savesCount:', postErr.message);
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

        const { candidates } = await resolveUserIdentifiers(userId);

        const Save = mongoose.model('Save');

        const deleteRes = await Save.deleteMany({
            postId: String(postId),
            userId: { $in: candidates }
        });

        if (deleteRes.deletedCount > 0) {
            try {
                const cleanPostId = mongoose.Types.ObjectId.isValid(postId) ? new mongoose.Types.ObjectId(postId) : postId;
                const post = await Post.findOneAndUpdate(
                    { _id: cleanPostId },
                    { $inc: { savesCount: -1 } },
                    { new: true }
                );
                if (post && post.savesCount < 0) {
                    post.savesCount = 0;
                    await post.save();
                }
            } catch (postErr) {
                console.warn('[SAVED] Could not update post savesCount:', postErr.message);
            }
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
        const { candidates } = await resolveUserIdentifiers(userId);

        const Save = mongoose.model('Save');

        const savedRecords = await Save.find({
            userId: { $in: candidates }
        }).sort({ createdAt: -1 }).limit(parseInt(limit)).lean();

        if (savedRecords.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const savedPostIds = savedRecords.map(r => r.postId);

        const posts = await Post.find({
            _id: {
                $in: savedPostIds.map(id => {
                    try { return new mongoose.Types.ObjectId(id); } catch { return id; }
                })
            }
        }).sort({ createdAt: -1 });

        return res.json({ success: true, data: posts });
    } catch (err) {
        console.error('[SAVED] GET error:', err.message);
        return res.status(500).json({ success: false, error: err.message, data: [] });
    }
});

module.exports = router;
