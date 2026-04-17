const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Post = require('../models/Post');
const { resolveUserIdentifiers } = require('../src/utils/userUtils');

function resolvePostQuery(postId) {
  const or = [{ id: String(postId) }];
  if (mongoose.Types.ObjectId.isValid(postId)) {
    or.unshift({ _id: new mongoose.Types.ObjectId(postId) });
  }
  return { $or: or };
}

// GET /api/posts - basic fallback list route
router.get('/', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query?.limit || 50), 100));
    const posts = await Post.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ success: true, data: posts || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

// POST /api/posts/:postId/like
router.post('/:postId/like', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    const post = await Post.findOne(resolvePostQuery(postId));
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const normalizedUserId = String(userId);
    const likes = Array.isArray(post.likes) ? post.likes.map((id) => String(id)) : [];
    if (!likes.includes(normalizedUserId)) {
      likes.push(normalizedUserId);
    }

    post.likes = likes;
    post.likesCount = likes.length;
    await post.save();

    return res.json({ success: true, data: post });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/posts/:postId/like
router.delete('/:postId/like', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    const post = await Post.findOne(resolvePostQuery(postId));
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const normalizedUserId = String(userId);
    const likes = Array.isArray(post.likes) ? post.likes.map((id) => String(id)) : [];
    const nextLikes = likes.filter((id) => id !== normalizedUserId);

    post.likes = nextLikes;
    post.likesCount = nextLikes.length;
    await post.save();

    return res.json({ success: true, data: post });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts/:postId/react
router.post('/:postId/react', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId, emoji, userName, userAvatar } = req.body || {};
    if (!userId || !emoji) {
      return res.status(400).json({ success: false, error: 'userId and emoji required' });
    }

    const post = await Post.findOne(resolvePostQuery(postId));
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    if (!Array.isArray(post.reactions)) {
      post.reactions = [];
    }

    const existingIndex = post.reactions.findIndex((r) => String(r.userId) === String(userId));
    if (existingIndex >= 0) {
      if (post.reactions[existingIndex].emoji === emoji) {
        post.reactions.splice(existingIndex, 1);
      } else {
        post.reactions[existingIndex].emoji = emoji;
        post.reactions[existingIndex].userName = userName || post.reactions[existingIndex].userName;
        post.reactions[existingIndex].userAvatar = userAvatar || post.reactions[existingIndex].userAvatar;
        post.reactions[existingIndex].createdAt = new Date();
      }
    } else {
      post.reactions.push({
        userId,
        emoji,
        userName: userName || 'User',
        userAvatar: userAvatar || '',
        createdAt: new Date(),
      });
    }

    post.markModified('reactions');
    await post.save();
    return res.json({ success: true, data: post });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/posts/:postId - Edit caption/content (owner-only)
router.patch('/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const { currentUserId, caption, content } = req.body || {};

    if (!postId) return res.status(400).json({ success: false, error: 'Post ID required' });
    if (!currentUserId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const post = await Post.findOne(resolvePostQuery(postId));
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    // Ownership check with id resolution
    try {
      const ownerResolved = await resolveUserIdentifiers(String(post.userId));
      const actorResolved = await resolveUserIdentifiers(String(currentUserId));
      const ownerSet = new Set((ownerResolved?.candidates || []).map(String));
      const isOwner = (actorResolved?.candidates || []).map(String).some((id) => ownerSet.has(id));
      if (!isOwner) {
        return res.status(403).json({ success: false, error: 'Unauthorized: You can only edit your own posts' });
      }
    } catch {
      if (String(post.userId) !== String(currentUserId)) {
        return res.status(403).json({ success: false, error: 'Unauthorized: You can only edit your own posts' });
      }
    }

    if (caption !== undefined) post.caption = typeof caption === 'string' ? caption : String(caption || '');
    if (content !== undefined) post.content = typeof content === 'string' ? content : String(content || '');
    post.updatedAt = new Date();

    await post.save();
    return res.json({ success: true, data: post });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
