const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const mongoose = require('mongoose');


// GET /api/posts - Get all posts (supports taggedUserId filter, privacy-aware)
router.get('/', async (req, res) => {
  try {
    const { userId, requesterUserId, taggedUserId, limit = 50 } = req.query;
    const viewerId = requesterUserId || userId; // backward compatibility with older clients
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const followsCollection = db.collection('follows');
    // Resolve viewer variants to handle _id, uid, and firebaseUid interchangeably
    const { resolveUserIdentifiers } = require('../src/utils/userUtils');
    let viewerVariants = [];
    if (viewerId) {
      try {
        const viewerObj = await resolveUserIdentifiers(viewerId);
        viewerVariants = [...viewerObj.candidates];
        viewerVariants.push(String(viewerObj.canonicalId));
      } catch (e) {
        viewerVariants = [String(viewerId)];
      }
    }

    // Build query (optionally filter by tagged user)
    const query = taggedUserId ? { taggedUserIds: taggedUserId } : {};

    // Get posts (over-fetch a bit then privacy filter)
    let posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit) * 2, 100));

    // Get following list for private account check
    const followingIds = viewerId
      ? (await followsCollection.find({ followerId: viewerId }).toArray()).map(f => f.followingId)
      : [];

    // Get current user's groups for semantic visibility check (Friends/Family)
    let viewerGroups = { friendIds: [], familyMemberIds: [] };
    if (viewerId) {
      const Group = mongoose.model('Group');
      const groups = await Group.find({ userId: viewerId });
      for (const g of groups) {
        if (g.type === 'friends') viewerGroups.friendIds = [...viewerGroups.friendIds, ...g.members];
        if (g.type === 'family') viewerGroups.familyMemberIds = [...viewerGroups.familyMemberIds, ...g.members];
      }
    }

    posts = await Promise.all(posts.map(async (post) => {
      const pObj = post.toObject ? post.toObject() : post;
      
      // Post-Level Visibility Data
      const visibility = pObj.visibility || 'Everyone';
      const allowed = Array.isArray(pObj.allowedFollowers) ? pObj.allowedFollowers.map(String) : [];
      
      // 1. Ownership & Targeted Access check
      const authorId = String(pObj.userId);
      const isOwner = viewerVariants.includes(authorId);
      const isAllowedPostLevel = allowed.some(id => viewerVariants.includes(String(id)));

      if (isOwner || isAllowedPostLevel) {
        return { ...pObj, id: String(pObj._id) };
      }

      // 2. Author Privacy Check (Only for non-targeted posts)
      const postAuthor = await usersCollection.findOne({
        $or: [
          { firebaseUid: authorId },
          { uid: authorId },
          { _id: mongoose.Types.ObjectId.isValid(authorId) ? new mongoose.Types.ObjectId(authorId) : null }
        ]
      });

      // If user is private, only show if followed
      if (postAuthor?.isPrivate) {
        if (!followingIds.includes(authorId)) {
          return null;
        }
      }

      // If everyone is allowed (and author not private/not followed), return it
      if (visibility === 'Everyone') {
        return { ...pObj, id: String(pObj._id) };
      }

      // Default skip (e.g. targeted to a group window but viewer wasn't in list)
      return null;
    }));

    posts = posts.filter(Boolean).slice(0, parseInt(limit));

    res.status(200).json({ success: true, data: Array.isArray(posts) ? posts : [] });
  } catch (err) {
    console.error('[GET /posts] Error:', err.message);
    res.status(200).json({ success: true, data: [] });
  }
});

// GET /api/posts/feed - Get feed posts
router.get('/feed', async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 }).limit(50).lean();
    const normalized = posts.map(p => {
      const id = p._id ? String(p._id) : (p.id ? String(p.id) : undefined);
      return { ...p, id, _id: p._id };
    });
    res.status(200).json({ success: true, data: normalized });
  } catch (err) {
    res.status(200).json({ success: true, data: [] });
  }
});

// GET /api/posts/:postId - Get a post by ID (with privacy check)
router.get('/:postId', async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    // Check privacy of post author
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const followsCollection = db.collection('follows');
    const { requesterUserId } = req.query;

    const postAuthor = await usersCollection.findOne({
      $or: [
        { firebaseUid: post.userId },
        { uid: post.userId },
        { _id: mongoose.Types.ObjectId.isValid(post.userId) ? new mongoose.Types.ObjectId(post.userId) : null }
      ]
    });

    // If author is private, check requester permission
    if (postAuthor?.isPrivate) {
      // Allow if requester is the post author
      if (post.userId === requesterUserId) {
        return res.json({ success: true, data: post });
      }

      // Allow if requester follows the post author
      if (requesterUserId) {
        const follows = await followsCollection.findOne({
          followerId: requesterUserId,
          followingId: post.userId
        });

        if (follows) {
          return res.json({ success: true, data: post });
        }
      }

      // Deny access
      return res.status(403).json({ success: false, error: 'User account is private' });
    }

    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts - Create a new post
router.post('/', async (req, res) => {
  try {
    // Accept both 'content' and 'caption' for compatibility
    const { userId, content, caption, imageUrl, mediaUrls, location, locationData, mediaType, category, hashtags, mentions, taggedUserIds, visibility, allowedFollowers } = req.body;

    // Validate and prepare content
    const finalContent = content || caption;

    console.log('[POST /posts] Received:', { userId, content, caption, finalContent, category });

    if (!userId || !finalContent) {
      console.error('[POST /posts] Validation failed:', { userId, finalContent });
      return res.status(400).json({ success: false, error: 'userId and caption required' });
    }

    // Handle both single imageUrl and mediaUrls array
    const images = mediaUrls && mediaUrls.length > 0 ? mediaUrls : (imageUrl ? [imageUrl] : []);

    const postData = {
      userId,
      content: finalContent,
      caption: finalContent,
      imageUrl: images[0] || null,
      mediaUrls: images || [],
      location: location || '',
      locationData: locationData || {},
      mediaType: mediaType || 'image',
      category: category || '',
      hashtags: (hashtags && Array.isArray(hashtags)) ? hashtags : [],
      mentions: (mentions && Array.isArray(mentions)) ? mentions : [],
      taggedUserIds: (taggedUserIds && Array.isArray(taggedUserIds)) ? taggedUserIds : [],
      likes: [],
      likesCount: 0,
      comments: 0,
      commentsCount: 0,
      visibility: visibility || 'Everyone',
      allowedFollowers: (allowedFollowers && Array.isArray(allowedFollowers)) ? allowedFollowers : [],
      isPrivate: (visibility && visibility !== 'Everyone')
    };

    console.log('[POST /posts] Creating post with:', postData);

    const post = new Post(postData);
    await post.save();

    console.log('[POST /posts] ✅ Post created:', post._id);
    res.json({ success: true, data: post });
  } catch (err) {
    console.error('[POST /posts] Error:', err.message, err.stack);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/posts/:postId - Delete a post
router.delete('/:postId', async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.postId);
    res.json({ success: true, message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts/:postId/like - Like a post
router.post('/:postId/like', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }
    const post = await Post.findByIdAndUpdate(
      postId,
      {
        $addToSet: { likes: userId },
        $inc: { likesCount: 1 }
      },
      { new: true }
    );
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts/:postId/react - React to a post with an emoji
router.post('/:postId/react', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId, emoji, userName, userAvatar } = req.body;

    if (!userId || !emoji) {
      return res.status(400).json({ success: false, error: 'userId and emoji required' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    if (!post.reactions) {
      post.reactions = [];
    }

    // Single reaction per user constraint
    const existingIndex = post.reactions.findIndex(r => r.userId === userId);

    if (existingIndex >= 0) {
      if (post.reactions[existingIndex].emoji === emoji) {
        // Remove reaction if clicking the same one again (toggle off)
        post.reactions.splice(existingIndex, 1);
      } else {
        // Change reaction to the new emoji
        post.reactions[existingIndex].emoji = emoji;
        post.reactions[existingIndex].userName = userName || post.reactions[existingIndex].userName;
        post.reactions[existingIndex].userAvatar = userAvatar || post.reactions[existingIndex].userAvatar;
        post.reactions[existingIndex].createdAt = new Date();
      }
    } else {
      // Add new reaction
      post.reactions.push({
        userId,
        emoji,
        userName: userName || 'User',
        userAvatar: userAvatar || '',
        createdAt: new Date()
      });
    }

    post.markModified('reactions');
    await post.save();

    res.json({ success: true, data: post });
  } catch (err) {
    console.error('[POST /posts/:postId/react] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/posts/:postId/like - Unlike a post
router.delete('/:postId/like', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }
    const post = await Post.findByIdAndUpdate(
      postId,
      {
        $pull: { likes: userId },
        $inc: { likesCount: -1 }
      },
      { new: true }
    );
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
