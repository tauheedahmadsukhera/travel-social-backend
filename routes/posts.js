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

/**
 * GET /feed - Optimized personalized feed
 * Uses a single database query with visibility filtering logic.
 */
router.get('/feed', async (req, res, next) => {
  try {
    const currentUserId = req.headers.userid || req.query.viewerId || req.query.requesterUserId || null;
    let viewerVariants = [];
    
    if (currentUserId) {
      const { candidates } = await resolveUserIdentifiers(currentUserId);
      viewerVariants = candidates.map(id => String(id));
    }

    const limit = Math.min(parseInt(req.query.limit || '20'), 100);
    const skip = parseInt(req.query.skip || '0');

    const Post = mongoose.model('Post');
    const Group = mongoose.model('Group');

    // 1. If viewer is logged in, find which groups they belong to
    let viewerGroups = [];
    if (viewerVariants.length > 0) {
      // Find groups where the viewer is a member
      viewerGroups = await Group.find({ members: { $in: viewerVariants } }).lean();
    }

    // Map author IDs to group types for this viewer
    const authorGroupTypes = {};
    viewerGroups.forEach(g => {
      const authorId = String(g.userId);
      if (!authorGroupTypes[authorId]) authorGroupTypes[authorId] = new Set();
      authorGroupTypes[authorId].add(g.type); // 'friends' or 'family'
    });

    const authorsWithFriendsGroup = Object.keys(authorGroupTypes).filter(id => authorGroupTypes[id].has('friends'));
    const authorsWithFamilyGroup = Object.keys(authorGroupTypes).filter(id => authorGroupTypes[id].has('family'));

    // 2. Construct optimized query
    const visibilityQuery = {
      $or: [
        { isPrivate: { $ne: true } }, // Public posts
        { visibility: 'Everyone' },   // Explicitly public
        { userId: { $in: viewerVariants } }, // Owner
        { allowedFollowers: { $in: viewerVariants } } // Explicitly allowed
      ]
    };

    if (viewerVariants.length > 0) {
      if (authorsWithFriendsGroup.length > 0) {
        visibilityQuery.$or.push({ 
          userId: { $in: authorsWithFriendsGroup }, 
          visibility: { $in: ['Friends', 'friends'] } 
        });
      }
      if (authorsWithFamilyGroup.length > 0) {
        visibilityQuery.$or.push({ 
          userId: { $in: authorsWithFamilyGroup }, 
          visibility: { $in: ['Family', 'family'] } 
        });
      }
    }

    // 3. Execute query with pagination
    const posts = await Post.find(visibilityQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'displayName name avatar profilePicture photoURL isPrivate followers')
      .lean();

    const finalPosts = await enrichPostsWithUserData(posts);
    res.json({ success: true, data: finalPosts });
  } catch (err) {
    next(err); // Pass to central error handler instead of swallowing
  }
});

// GET /recommended - Randomized discovery feed
router.get('/recommended', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20'), 50);
    const Post = mongoose.model('Post');
    
    // Aggregation for random public posts
    const posts = await Post.aggregate([
      { 
        $match: { 
          $or: [
            { isPrivate: { $ne: true } },
            { visibility: 'Everyone' }
          ]
        } 
      },
      { $sample: { size: limit } },
      { $sort: { createdAt: -1 } }
    ]);

    const finalPosts = await enrichPostsWithUserData(posts);
    res.json({ success: true, data: finalPosts });
  } catch (err) {
    next(err);
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
