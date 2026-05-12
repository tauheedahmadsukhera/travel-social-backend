const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken, optionalAuth } = require('../middleware/authMiddleware');
const { get, set } = require('../utils/redis');

const postController = require('../controllers/postController');

// Helper: escape user input for use in MongoDB $regex to prevent ReDoS
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Create post (POST /api/posts) — must be authenticated
router.post('/', verifyToken, postController.createPost);

router.get('/feed', optionalAuth, async (req, res) => {
  try {
    const skip = Math.max(0, parseInt(req.query.skip) || 0);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20)); // cap at 50

    // Redis caching
    const cacheKey = `feed:skip_${skip}:limit_${limit}`;
    const cachedFeed = await get(cacheKey);
    if (cachedFeed) {
      return res.json({ success: true, data: cachedFeed, source: 'cache' });
    }

    const db = mongoose.connection.db;
    const postsCollection = db.collection('posts');
    const userId = req.userId ? String(req.userId) : null;

    // Use aggregation for high-performance field selection and computed values
    const pipeline = [
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $addFields: {
          isLiked: userId ? { $in: [userId, { $ifNull: ["$likes", []] }] } : false,
          id: "$_id"
        }
      },
      {
        $project: {
          likes: 0,
          comments: 0
        }
      }
    ];

    const posts = await postsCollection.aggregate(pipeline).toArray();

    await set(cacheKey, posts || [], 120);
    res.json({ success: true, data: posts || [], source: 'db' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch feed', data: [] });
  }
});

// Get recommended posts (GET /api/posts/recommended) — optionalAuth
router.get('/recommended', optionalAuth, async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const postsCollection = db.collection('posts');
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const excludeIdsStr = req.query.excludeIds || '';
    const excludeIds = excludeIdsStr ? excludeIdsStr.split(',').filter(Boolean) : [];

    const filter = {};
    if (excludeIds.length > 0) {
      const objectIds = excludeIds
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));
      if (objectIds.length > 0) {
        filter._id = { $nin: objectIds };
      }
    }

    // Use aggregation with $sample for random recommendations
    const posts = await postsCollection.aggregate([
      { $match: filter },
      { $sample: { size: limit } }
    ]).toArray();

    res.json({ success: true, data: posts || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch recommendations', data: [] });
  }
});

// Get posts by location (GET /api/posts/by-location) — optionalAuth
// FIX: Escape location input to prevent ReDoS regex injection
router.get('/by-location', optionalAuth, async (req, res) => {
  try {
    const { location, skip: skipStr, limit: limitStr } = req.query;
    if (!location) {
      return res.status(400).json({ success: false, error: 'location query required' });
    }

    // Sanitize: max 100 chars, escape for regex
    const safeLocation = escapeRegex(String(location).slice(0, 100));

    const db = mongoose.connection.db;
    const postsCollection = db.collection('posts');
    const skip = Math.max(0, parseInt(skipStr) || 0);
    const limit = Math.min(50, Math.max(1, parseInt(limitStr) || 20));

    // Priority: Try Text Search first for industrial-grade speed
    // Fallback: If no results, use regex for partial matches
    let posts = await postsCollection.find({
      $text: { $search: safeLocation }
    }).sort({ score: { $meta: "textScore" }, createdAt: -1 }).skip(skip).limit(limit).toArray();

    if (!posts || posts.length === 0) {
      posts = await postsCollection.find({
        $or: [
          { location: { $regex: safeLocation, $options: 'i' } },
          { 'locationData.name': { $regex: safeLocation, $options: 'i' } }
        ]
      }).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
    }

    res.json({ success: true, data: posts || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Location search failed', data: [] });
  }
});

// Get all posts (GET /api/posts) — verifyToken (enforced for security)
router.get('/', verifyToken, postController.getAllPosts);

// Get location count (GET /api/posts/location-count?location=...)
// MUST be before /:id route!
router.get('/location-count', optionalAuth, async (req, res) => {
  try {
    const { location } = req.query;

    if (!location) {
      return res.status(400).json({ success: false, error: 'location query parameter required' });
    }

    const safeLocation = escapeRegex(String(location).slice(0, 100));
    const Post = require('../models/Post');

    const count = await Post.countDocuments({
      $or: [
        { location: { $regex: safeLocation, $options: 'i' } },
        { locationName: { $regex: safeLocation, $options: 'i' } }
      ]
    });

    res.json({ success: true, count, location });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Count failed' });
  }
});

// Get post by ID (GET /api/posts/:id) — optionalAuth
router.get('/:id', optionalAuth, postController.getPostById);

// Get comments for a post (GET /api/posts/:postId/comments)
router.get('/:postId/comments', optionalAuth, async (req, res) => {
  try {
    const { postId } = req.params;
    const viewerId = req.userId || null;
    
    const Post = mongoose.model('Post');
    const Comment = mongoose.model('Comment');
    
    // Resolve post
    const post = await Post.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(postId) ? new mongoose.Types.ObjectId(postId) : null },
        { id: postId }
      ].filter(q => q._id !== null || q.id)
    }).lean();

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Security: Check visibility (Basic implementation)
    if (post.isPrivate && (!viewerId || String(post.userId) !== String(viewerId))) {
       // Check for follow status if needed, for now just allow owner
       if (String(post.userId) !== String(viewerId)) {
         return res.status(403).json({ success: false, error: 'Private content' });
       }
    }

    // Fetch comments
    const comments = await Comment.find({ 
      postId: { $in: [String(post._id), String(post.id)].filter(Boolean) } 
    }).sort({ createdAt: -1 }).lean();

    // Enrich comments with author data
    const User = mongoose.model('User');
    const enriched = await Promise.all(comments.map(async (c) => {
      const author = await User.findOne({
        $or: [
          { _id: mongoose.Types.ObjectId.isValid(c.userId) ? new mongoose.Types.ObjectId(c.userId) : null },
          { firebaseUid: c.userId },
          { uid: c.userId }
        ].filter(q => q._id !== null || q.firebaseUid || q.uid)
      }).select('displayName name avatar photoURL profilePicture').lean();

      return {
        ...c,
        userName: author?.displayName || author?.name || 'Anonymous',
        userAvatar: author?.avatar || author?.photoURL || author?.profilePicture || null
      };
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Like post (POST /api/posts/:postId/like) — must be authenticated
router.post('/:postId/like', verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    // Use the authenticated user's ID from JWT — not from request body (prevents spoofing)
    const userId = String(req.userId);

    const Post = mongoose.model('Post');

    let result = null;
    if (mongoose.Types.ObjectId.isValid(postId)) {
      const objectId = new mongoose.Types.ObjectId(postId);
      result = await Post.findByIdAndUpdate(
        objectId,
        { $addToSet: { likes: userId } },
        { new: true }
      );
    }

    if (!result) {
      result = await Post.findOneAndUpdate(
        { id: postId },
        { $addToSet: { likes: userId } },
        { new: true }
      );
    }

    if (!result) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Like failed' });
  }
});

// Unlike post (DELETE /api/posts/:postId/like) — must be authenticated
router.delete('/:postId/like', verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = String(req.userId);

    const Post = mongoose.model('Post');

    let result = null;
    if (mongoose.Types.ObjectId.isValid(postId)) {
      const objectId = new mongoose.Types.ObjectId(postId);
      result = await Post.findByIdAndUpdate(
        objectId,
        { $pull: { likes: userId } },
        { new: true }
      );
    }

    if (!result) {
      result = await Post.findOneAndUpdate(
        { id: postId },
        { $pull: { likes: userId } },
        { new: true }
      );
    }

    if (!result) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Unlike failed' });
  }
});

// Delete post (DELETE /api/posts/:id) — must be authenticated
// Note: The controller should additionally verify the post belongs to req.userId
router.delete('/:id', verifyToken, postController.deletePost);

module.exports = router;
