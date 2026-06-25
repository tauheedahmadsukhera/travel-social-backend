const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const cache = require('../utils/cache');


// Get personalized feed for user
router.get('/', async (req, res) => {
  try {
    const { resolveUserIdentifiers } = require('../src/utils/userUtils');
    const postService = require('../services/postService');
    const Group = mongoose.model('Group');
    const { userId, limit, offset } = req.query;
    let viewerVariants = [];
    if (userId) {
      try {
        const viewerObj = await resolveUserIdentifiers(userId);
        viewerVariants = [...viewerObj.candidates];
      } catch (e) {
        viewerVariants = [String(userId)];
      }
    }
    
    // 1. Get visibility context (groups)
    let viewerGroups = [];
    if (viewerVariants.length > 0) {
      viewerGroups = await Group.find({ members: { $in: viewerVariants } }).lean();
    }

    const authorGroupTypes = {};
    const viewerGroupIds = [];
    viewerGroups.forEach(g => {
      viewerGroupIds.push(String(g._id));
      const authorId = String(g.userId);
      if (!authorGroupTypes[authorId]) authorGroupTypes[authorId] = new Set();
      authorGroupTypes[authorId].add(g.type);
    });

    const authorsWithFriendsGroup = Object.keys(authorGroupTypes).filter(id => authorGroupTypes[id].has('friends'));
    const authorsWithFamilyGroup = Object.keys(authorGroupTypes).filter(id => authorGroupTypes[id].has('family'));

    // 2. Build optimized visibility query
    const visibilityQuery = {
      $or: [
        { isPrivate: { $ne: true } }, 
        { visibility: 'Everyone' },   
        { userId: { $in: viewerVariants } }, 
        { allowedFollowers: { $in: [...viewerVariants, ...viewerGroupIds] } } 
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

    // 3. Execute optimized fetch
    const limitN = parseInt(limit || '20');
    const skipN = parseInt(offset || '0');

    const enrichedPosts = await postService.getEnrichedPosts(visibilityQuery, { 
      skip: skipN, 
      limit: limitN, 
      viewerId: userId 
    });
    
    res.json({ 
      success: true, 
      data: enrichedPosts,
      count: enrichedPosts.length
    });
  } catch (err) {
    console.error('[Feed] Error:', err.message);
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
});
;

module.exports = router;
