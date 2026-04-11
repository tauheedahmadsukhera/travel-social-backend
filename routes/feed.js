const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

console.log('📰 Loading feed route...');

// Get personalized feed for user
router.get('/', async (req, res) => {
  try {
    const { userId, limit = 20, offset = 0 } = req.query;
    
    const db = mongoose.connection.db;
    const postsCollection = db.collection('posts');
    const followsCollection = db.collection('follows');
    const usersCollection = db.collection('users');
    
    let followingIds = [];
    
    const { resolveUserIdentifiers } = require('../src/utils/userUtils');
    let viewerVariants = [];
    if (userId) {
      try {
        const viewerObj = await resolveUserIdentifiers(userId);
        viewerVariants = [...viewerObj.candidates];
        viewerVariants.push(String(viewerObj.canonicalId));
      } catch (e) {
        viewerVariants = [String(userId)];
      }
    }
    
    // Get users that current user follows
    if (userId) {
      const follows = await followsCollection.find({ followerId: userId }).toArray();
      followingIds = follows.map(f => f.followingId);
      followingIds.push(userId); // Include own posts
    }
    
    // Build query
    let query = {};
    if (viewerVariants.length > 0) {
      query = {
        $or: [
          { userId: { $in: followingIds } },
          { allowedFollowers: { $in: viewerVariants } }
        ]
      };
    }
    
    // Get posts
    let posts = await postsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit) * 2) // Get extra posts to account for filtering
      .toArray();
    
    // Normalize posts initially if no viewer variants (anonymous explore)
    if (viewerVariants.length === 0) {
      posts = posts.map(p => {
        const id = p._id ? String(p._id) : (p.id ? String(p.id) : undefined);
        return { ...p, id, _id: p._id };
      });
    }
    
    // Filter out posts from private users that requester doesn't follow
    if (userId) {
      posts = await Promise.all(posts.map(async (post) => {
        // Check if post author is private
        const postAuthor = await usersCollection.findOne({ 
          $or: [
            { firebaseUid: post.userId },
            { uid: post.userId },
            { _id: mongoose.Types.ObjectId.isValid(post.userId) ? new mongoose.Types.ObjectId(post.userId) : null }
          ]
        });
        
        // Show if:
        // 1. Viewer is the owner (Check all variants)
        // 2. Viewer is in allowedFollowers (specific group/friends/family)
        const visibility = post.visibility || 'Everyone';
        const isEveryone = visibility === 'Everyone';
        const isOwner = viewerVariants.includes(String(post.userId));
        const allowed = Array.isArray(post.allowedFollowers) ? post.allowedFollowers.map(String) : [];
        const isAllowed = allowed.some(id => viewerVariants.includes(String(id)));

        if (isOwner || isAllowed) {
          return post;
        }

        // 3. Author privacy check (Only if not already allowed above)
        if (postAuthor?.isPrivate && !followingIds.includes(String(post.userId))) {
          return null;
        }

        // If everyone is allowed and author is public (or followed), show it
        if (isEveryone) {
          return post;
        }

        // Default: hide targeted posts for non-allowed users
        return null;
      }));
      
      // Remove null values
      posts = posts.filter(p => p !== null).map(p => {
        const id = p._id ? String(p._id) : (p.id ? String(p.id) : undefined);
        return { ...p, id, _id: p._id };
      });
    }
    
    // Limit to requested count after filtering
    posts = posts.slice(0, parseInt(limit));
    
    res.json({ success: true, data: posts, posts });
  } catch (err) {
    console.error('[Feed] Error:', err.message);
    res.status(500).json({ success: false, error: err.message, data: [], posts: [] });
  }
});

module.exports = router;
