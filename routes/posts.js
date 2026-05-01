const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { resolveUserIdentifiers } = require('../src/utils/userUtils');
const { 
  enrichPostsWithUserData, 
  isPostVisibleToViewer, 
  escapeRegExp, 
  uniqueLocationKeys, 
  normalizePostLocation,
  formatLocationLabel 
} = require('../utils/postHelpers');
const { notificationQueue } = require('../services/queue');

// Helper to resolve post by both ObjectId and custom String ID
function resolvePostQuery(postId) {
  const or = [{ id: String(postId) }];
  if (mongoose.Types.ObjectId.isValid(postId)) {
    or.unshift({ _id: new mongoose.Types.ObjectId(postId) });
  }
  return { $or: or };
}

// --- Feed & Discovery Routes ---

// GET /feed - Optimized personalized feed
router.get('/feed', async (req, res) => {
  try {
    const currentUserId = req.headers.userid || req.query.viewerId || req.query.requesterUserId || null;
    const { candidates: viewerVariants } = currentUserId ? await resolveUserIdentifiers(currentUserId) : { candidates: [] };

    const limit = Math.min(parseInt(req.query.limit || '20'), 100);
    const skip = parseInt(req.query.skip || '0');

    const Post = mongoose.model('Post');
    const Group = mongoose.model('Group');

    // Fetch posts with a base query (Public OR Owner OR Directly Allowed)
    const baseQuery = (viewerVariants.length > 0)
      ? { $or: [{ isPrivate: { $ne: true } }, { userId: { $in: viewerVariants } }, { allowedFollowers: { $in: viewerVariants } }] }
      : { isPrivate: { $ne: true } };

    const posts = await Post.find(baseQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit * 2) // Over-fetch for visibility filtering
      .populate('userId', 'displayName name avatar profilePicture photoURL isPrivate followers')
      .lean();

    // Batch fetch author groups to avoid N+1 visibility checks
    const authorIds = [...new Set(posts.map(p => String(p.userId?._id || p.userId || '')))].filter(Boolean);
    const authorGroupsMap = {};
    if (authorIds.length > 0) {
      const authorGroups = await Group.find({ userId: { $in: authorIds } }).lean();
      for (const g of authorGroups) {
        const uid = String(g.userId);
        if (!authorGroupsMap[uid]) authorGroupsMap[uid] = { friendIds: [], familyMemberIds: [] };
        if (g.type === 'friends') authorGroupsMap[uid].friendIds = [...authorGroupsMap[uid].friendIds, ...g.members];
        if (g.type === 'family') authorGroupsMap[uid].familyMemberIds = [...authorGroupsMap[uid].familyMemberIds, ...g.members];
      }
    }

    const visiblePosts = posts.filter(post => {
      const authorId = String(post.userId?._id || post.userId || '');
      const groups = authorGroupsMap[authorId] || { friendIds: [], familyMemberIds: [] };
      return isPostVisibleToViewer(post, viewerVariants, groups.friendIds, groups.familyMemberIds);
    }).slice(0, limit);

    const finalPosts = await enrichPostsWithUserData(visiblePosts);
    res.json({ success: true, data: finalPosts });
  } catch (err) {
    res.status(200).json({ success: true, data: [] });
  }
});

// GET /recommended - Randomized discovery feed
router.get('/recommended', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20'), 50);
    const Post = mongoose.model('Post');
    
    // Simple random sampling for public posts
    const posts = await Post.aggregate([
      { $match: { isPrivate: { $ne: true } } },
      { $sample: { size: limit } }
    ]);

    const finalPosts = await enrichPostsWithUserData(posts);
    res.json({ success: true, data: finalPosts });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
});

// --- Location Routes ---

// GET /locations/suggest - Autocomplete for locations
router.get('/locations/suggest', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ success: true, data: [] });

    const limit = Math.min(parseInt(req.query.limit || '10'), 25);
    const Post = mongoose.model('Post');
    const regex = new RegExp(escapeRegExp(q), 'i');

    const results = await Post.aggregate([
      { $match: { $or: [{ location: regex }, { 'locationData.name': regex }] } },
      { $group: { _id: { $ifNull: ['$locationData.name', '$location'] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]);

    const data = results.map(r => ({
      name: formatLocationLabel(r._id),
      count: r.count
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
});

// --- Post CRUD & Actions ---

// POST / - Create post
router.post('/', async (req, res) => {
  try {
    const Post = mongoose.model('Post');
    const post = new Post(req.body);
    await post.save();
    res.status(201).json({ success: true, data: post });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /:postId - Detail
router.get('/:postId', async (req, res) => {
  try {
    const Post = mongoose.model('Post');
    const post = await Post.findOne(resolvePostQuery(req.params.postId))
      .populate('userId', 'displayName name avatar profilePicture photoURL isPrivate')
      .lean();

    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    const enriched = await enrichPostsWithUserData([post]);
    res.json({ success: true, data: enriched[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /:postId - Edit
router.patch('/:postId', async (req, res) => {
  try {
    const Post = mongoose.model('Post');
    const post = await Post.findOneAndUpdate(
      resolvePostQuery(req.params.postId),
      { $set: { ...req.body, updatedAt: new Date() } },
      { new: true }
    );
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /:postId - Delete
router.delete('/:postId', async (req, res) => {
  try {
    const Post = mongoose.model('Post');
    const result = await Post.deleteOne(resolvePostQuery(req.params.postId));
    if (result.deletedCount === 0) return res.status(404).json({ success: false, error: 'Post not found' });
    res.json({ success: true, message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /:postId/like - Like
router.post('/:postId/like', async (req, res) => {
  try {
    const { userId, userName } = req.body;
    const Post = mongoose.model('Post');
    const post = await Post.findOneAndUpdate(
      resolvePostQuery(req.params.postId),
      { $addToSet: { likes: userId }, $inc: { likesCount: 1 } },
      { new: true }
    );
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    if (post.userId !== userId) {
      notificationQueue.add('postLike', {
        userId: post.userId,
        title: 'New Like!',
        body: `${userName || 'Someone'} liked your post`,
        data: { postId: post._id, type: 'LIKE' }
      }).catch(() => {});
    }

    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /:postId/like - Unlike
router.delete('/:postId/like', async (req, res) => {
  try {
    const { userId } = req.body;
    const Post = mongoose.model('Post');
    const post = await Post.findOneAndUpdate(
      resolvePostQuery(req.params.postId),
      { $pull: { likes: userId }, $inc: { likesCount: -1 } },
      { new: true }
    );
    if (post && post.likesCount < 0) {
      post.likesCount = 0;
      await post.save();
    }
    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /:postId/react - React
router.post('/:postId/react', async (req, res) => {
  try {
    const { userId, emoji, userName, userAvatar } = req.body;
    const Post = mongoose.model('Post');
    const post = await Post.findOne(resolvePostQuery(req.params.postId));
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    if (!post.reactions) post.reactions = [];
    const idx = post.reactions.findIndex(r => String(r.userId) === String(userId));
    
    if (idx >= 0) {
      if (post.reactions[idx].emoji === emoji) post.reactions.splice(idx, 1);
      else post.reactions[idx] = { userId, emoji, userName, userAvatar, createdAt: new Date() };
    } else {
      post.reactions.push({ userId, emoji, userName, userAvatar, createdAt: new Date() });
    }

    post.markModified('reactions');
    await post.save();
    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
