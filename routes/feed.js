const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const cache = require('../utils/cache');


// Get personalized feed for user
router.get('/', async (req, res) => {
  try {
    const { userId, limit = 20, offset = 0 } = req.query;
    
    if (userId) {
      const cacheKey = `feed:${userId}:o${offset}:l${limit}`;
      const cachedFeed = await cache.get(cacheKey);
      if (cachedFeed) {
        console.log(`⚡ Serving cached feed for user ${userId}`);
        return res.json(JSON.parse(cachedFeed));
      }
    }
    
    const Post = mongoose.model('Post');
    const Follow = mongoose.model('Follow');
    const User = mongoose.model('User');
    const Group = mongoose.model('Group');
    const { resolveUserIdentifiers } = require('../src/utils/userUtils');
    const { enrichPostsWithUserData, isPostVisibleToViewer } = require('../utils/postHelpers');

    let viewerVariants = [];
    if (userId) {
      try {
        const viewerObj = await resolveUserIdentifiers(userId);
        viewerVariants = [...viewerObj.candidates];
        if (viewerObj.canonicalId) viewerVariants.push(String(viewerObj.canonicalId));
      } catch (e) {
        viewerVariants = [String(userId)];
      }
    }
    
    // Get users that current user follows
    let followingIds = [];
    if (userId) {
      const follows = await Follow.find({ followerId: userId }).lean();
      followingIds = follows.map(f => String(f.followingId));
      followingIds.push(String(userId)); // Include own posts
    }
    
    // Get viewer's own groups for visibility filtering
    let viewerFriendIds = [];
    let viewerFamilyMemberIds = [];
    if (viewerVariants.length > 0) {
      const viewerGroups = await Group.find({ userId: { $in: viewerVariants } }).lean();
      for (const g of viewerGroups) {
        if (g.type === 'friends') viewerFriendIds = [...viewerFriendIds, ...g.members];
        if (g.type === 'family') viewerFamilyMemberIds = [...viewerFamilyMemberIds, ...g.members];
      }
    }

    // Build query: show posts from following, OR posts explicitly allowed for viewer
    let query = {};
    if (viewerVariants.length > 0) {
      query = {
        $or: [
          { userId: { $in: followingIds } },
          { allowedFollowers: { $in: viewerVariants } },
          { isPrivate: { $ne: true } } // Show public posts too
        ]
      };
    } else {
      query = { isPrivate: { $ne: true } };
    }
    
    const limitN = parseInt(limit);
    const skipN = parseInt(offset);

    // Get posts
    let posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .skip(skipN)
      .limit(limitN * 2) // Over-fetch to allow for visibility filtering
      .populate('userId', 'displayName name avatar profilePicture photoURL isPrivate followers')
      .lean();
    
    // BATCH FETCH: Author groups for all posts to avoid N+1 visibility checks
    const authorIds = [...new Set(posts.map(p => String(p.userId?._id || p.userId || ''))).filter(Boolean)];
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

    // Filter by visibility
    const visiblePosts = posts.filter(post => {
      const authorId = String(post.userId?._id || post.userId || '');
      const authorGroups = authorGroupsMap[authorId] || { friendIds: [], familyMemberIds: [] };
      
      // If author is private and not followed, hide (unless explicitly allowed)
      const isOwner = viewerVariants.includes(authorId);
      const isFollowed = followingIds.includes(authorId);
      const allowed = Array.isArray(post.allowedFollowers) ? post.allowedFollowers.map(String) : [];
      const isExplicitlyAllowed = allowed.some(id => viewerVariants.includes(String(id)));

      if (isOwner || isExplicitlyAllowed) return true;
      
      const postAuthor = post.userId; // Populated
      if (postAuthor?.isPrivate && !isFollowed) return false;

      // Final semantic visibility check
      return isPostVisibleToViewer(post, viewerVariants, authorGroups.friendIds, authorGroups.familyMemberIds);
    });
    
    // Enrich with user data (reactions, comments, metadata)
    const enrichedPosts = await enrichPostsWithUserData(visiblePosts.slice(0, limitN));
    
    const responseData = { 
      success: true, 
      data: enrichedPosts,
      count: enrichedPosts.length
    };

    if (userId) {
      const cacheKey = `feed:${userId}:o${offset}:l${limit}`;
      await cache.set(cacheKey, JSON.stringify(responseData), 120); // Cache for 2 minutes
    }
    
    res.json(responseData);
  } catch (err) {
    console.error('[Feed] Error:', err.message);
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

module.exports = router;
