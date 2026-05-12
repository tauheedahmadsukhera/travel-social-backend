const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { resolveUserIdentifiers } = require('../src/utils/userUtils');
const { 
  enrichPostsWithUserData, 
  escapeRegExp, 
  formatLocationLabel 
} = require('../utils/postHelpers');
const { notificationQueue } = require('../services/queue');
const { verifyToken, optionalAuth } = require('../src/middleware/authMiddleware');
const postService = require('../services/postService');
const logger = require('../src/utils/logger');
const cacheMiddleware = require('../src/middleware/cacheMiddleware');
const validate = require('../src/middleware/validateMiddleware');
const { logEvent } = require('../src/services/analyticsService');
const { createPostSchema, updatePostSchema } = require('../src/validations/postValidation');

// Helper to resolve post by both ObjectId and custom String ID
function resolvePostQuery(postId) {
  const cleanId = String(postId).split('-loop')[0];
  const or = [{ id: cleanId }];
  if (mongoose.Types.ObjectId.isValid(cleanId)) {
    or.unshift({ _id: new mongoose.Types.ObjectId(cleanId) });
  }
  return { $or: or };
}

// --- Basic CRUD ---

/**
 * GET / - Get all posts (generic list) (Requires Auth & Cached)
 */
router.get('/', verifyToken, cacheMiddleware(300), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20'), 100);
    const skip = parseInt(req.query.skip || '0');
    const viewerId = req.userId; // Use authenticated userId

    const enriched = await postService.getEnrichedPosts({}, { skip, limit, viewerId });
    
    // Log feed view for analytics
    logEvent('FEED_VIEWED', { count: enriched.length, skip, limit }, viewerId);
    
    res.json({ success: true, data: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Feed & Discovery Routes ---


/**
 * GET /feed - Optimized personalized feed
 * Uses a single database query with visibility filtering logic.
 */
router.get('/feed', optionalAuth, async (req, res, next) => {
  try {
    // SECURITY FIX: Never trust client-provided user IDs for feed personalization.
    // Use the verified token's userId if authenticated.
    const currentUserId = req.userId || null;
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

    // 2. Construct optimized query
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
    const finalPosts = await postService.getEnrichedPosts(visibilityQuery, { 
      skip, 
      limit, 
      viewerId: currentUserId 
    });

    res.json({ success: true, data: finalPosts });
  } catch (err) {
    next(err);
  }
});

// GET /recommended - Randomized discovery feed
router.get('/recommended', optionalAuth, async (req, res, next) => {
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

    const viewerId = req.userId || null;
    const finalPosts = await enrichPostsWithUserData(posts, viewerId);
    res.json({ success: true, data: finalPosts });
  } catch (err) {
    next(err);
  }
});

// --- Location Routes ---

// GET /hashtags - Search for unique hashtags
router.get('/hashtags', async (req, res) => {
  try {
    const q = (req.query.q || '').trim().replace(/^#/, ''); // Remove leading # if present
    const limit = Math.min(parseInt(req.query.limit || '20'), 50);
    const Post = mongoose.model('Post');

    // Use aggregation to find unique hashtags and their counts
    const results = await Post.aggregate([
      { $unwind: '$hashtags' }, // Split hashtags array into individual rows
      { 
        $match: { 
          hashtags: new RegExp('^' + escapeRegExp(q), 'i'), // Match starts with query
          $or: [{ isPrivate: { $ne: true } }, { visibility: 'Everyone' }] // Only public
        } 
      },
      { $group: { _id: { $toLower: '$hashtags' }, count: { $sum: 1 }, original: { $first: '$hashtags' } } },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]);

    const data = results.map(r => ({
      name: r.original || r._id,
      count: r.count
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error('[GET /hashtags] Error:', err);
    res.json({ success: false, error: err.message, data: [] });
  }
});

// GET /hashtags/posts - Get all posts for a specific hashtag (No looping)
router.get('/hashtags/posts', async (req, res) => {
  try {
    const tag = (req.query.hashtag || '').trim().replace(/^#/, '');
    if (!tag) return res.json({ success: true, data: [] });

    const limit = Math.min(parseInt(req.query.limit || '50'), 100);
    const skip = parseInt(req.query.skip || '0');
    const Post = mongoose.model('Post');

    const query = {
      hashtags: new RegExp('^' + escapeRegExp(tag) + '$', 'i'), // Match exact hashtag
      $or: [{ isPrivate: { $ne: true } }, { visibility: 'Everyone' }]
    };

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'displayName name avatar profilePicture photoURL isPrivate')
      .lean();

    const viewerId = req.query.viewerId || null;
    const enriched = await enrichPostsWithUserData(posts, viewerId);
    res.json({ success: true, data: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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

// GET /by-location - Get posts filtered by location name or keys
router.get('/by-location', optionalAuth, async (req, res) => {
  try {
    const location = (req.query.location || '').trim();
    const limit = Math.min(parseInt(req.query.limit || '20'), 100);
    const skip = parseInt(req.query.skip || '0');
    // SECURITY FIX: Use verified token ID
    const viewerId = req.userId || null;

    if (!location) {
      return res.json({ success: true, data: [] });
    }

    const Post = mongoose.model('Post');
    
    // PRODUCTION-GRADE ISO REGION MAPPING
    const regionISO = {
      europe: ['FR', 'DE', 'IT', 'ES', 'GB', 'UK', 'PT', 'GR', 'CH', 'NL', 'BE', 'AT', 'TR', 'SE', 'NO', 'DK', 'FI', 'IE', 'PL', 'CZ', 'HU', 'RO', 'BG', 'HR', 'UA', 'RU', 'ME', 'AL', 'RS', 'BA', 'SI', 'IS', 'MC', 'MT', 'LU', 'LI', 'AD', 'SM', 'VA', 'EE', 'LV', 'LT'],
      americas: ['US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'EC', 'BO', 'PY', 'UY', 'CU', 'JM', 'CR', 'PA', 'GT', 'HN', 'SV', 'NI', 'DO', 'HT', 'PR'],
      asia: ['CN', 'JP', 'TH', 'VN', 'SG', 'HK', 'IN', 'PK', 'AE', 'SA', 'KR', 'ID', 'MY', 'PH', 'TW', 'IL', 'QA', 'KW', 'OM', 'JO', 'LB', 'KH', 'LA', 'MM', 'NP', 'LK', 'BD'],
      africa: ['EG', 'MA', 'ZA', 'KE', 'NG', 'DZ', 'TN', 'ET', 'GH', 'TZ', 'UG', 'SN', 'CI', 'AO', 'CM', 'ET', 'ZW'],
      oceania: ['AU', 'NZ', 'FJ', 'PG', 'SB', 'VU', 'NC', 'PF']
    };

    // Split search query into parts (e.g. "Paris, France" -> ["paris", "france"])
    const parts = location.split(',').map(p => p.trim()).filter(p => p.length > 2);
    const normalizedLocs = parts.map(p => p.toLowerCase());
    if (location.length > 2 && !normalizedLocs.includes(location.toLowerCase())) {
      normalizedLocs.push(location.toLowerCase());
    }

    const conditions = [];
    
    // PRODUCTION-GRADE COUNTRY-TO-ISO MAPPING
    const countryToISO = {
      'france': 'FR', 'germany': 'DE', 'italy': 'IT', 'spain': 'ES', 'united kingdom': 'GB', 'uk': 'GB', 'usa': 'US', 'united states': 'US',
      'pakistan': 'PK', 'india': 'IN', 'uae': 'AE', 'dubai': 'AE'
    };

    const countryAliases = {
      'united states': ['usa', 'us', 'america', 'united states of america'],
      'usa': ['united states', 'us', 'america'],
      'united kingdom': ['uk', 'gb', 'great britain'],
      'uk': ['united kingdom', 'gb', 'great britain'],
      'uae': ['united arab emirates', 'dubai', 'abu dhabi'],
      'pakistan': ['pk', 'islamabad', 'karachi', 'lahore']
    };

    const famousPlacesMap = {
      'europe': ['eiffel tower', 'louvre', 'colosseum', 'big ben', 'arc de triomphe', 'pisa', 'sagrada familia'],
      'france': ['eiffel tower', 'louvre', 'arc de triomphe', 'notre dame', 'versailles'],
      'uk': ['big ben', 'london eye', 'stonehenge', 'buckingham palace']
    };

    // Process each search term
    normalizedLocs.forEach(loc => {
      const regex = new RegExp(escapeRegExp(loc), 'i');
      
      // 1. Direct matches (String based)
      conditions.push({ locationKeys: { $in: [loc] } });
      conditions.push({ location: regex });
      conditions.push({ 'locationData.name': regex });
      conditions.push({ 'locationData.address': regex });
      conditions.push({ 'locationData.city': regex });
      conditions.push({ 'locationData.country': regex });

      // 2. Alias Support: If searching 'United States', also search 'USA', 'US'
      const aliases = countryAliases[loc] || [];
      aliases.forEach(alias => {
        const aRegex = new RegExp(escapeRegExp(alias), 'i');
        conditions.push({ location: aRegex });
        conditions.push({ 'locationData.address': aRegex });
        conditions.push({ locationKeys: { $in: [alias.toLowerCase()] } });
      });

      // 3. Famous Places Fallback: e.g. Eiffel Tower -> France/Europe
      const places = famousPlacesMap[loc] || [];
      places.forEach(place => {
        const pRegex = new RegExp(escapeRegExp(place), 'i');
        conditions.push({ location: pRegex });
        conditions.push({ 'locationData.name': pRegex });
        conditions.push({ 'locationData.address': pRegex });
      });

      // 4. ISO Hierarchy (If searching a region like 'europe')
      if (regionISO[loc]) {
        const codes = regionISO[loc];
        const allCases = [...codes, ...codes.map(c => c.toLowerCase())];
        conditions.push({ 'locationData.countryCode': { $in: allCases } });
        
        // IMPORTANT: Also search for country names AND major cities across ALL fields
        const regionCountryNames = {
          europe: [
            'france', 'germany', 'italy', 'spain', 'uk', 'united kingdom', 'portugal', 'greece', 'turkey', 'croatia', 'montenegro', 'switzerland', 'netherlands', 'belgium', 'austria', 'russia', 'poland',
            'paris', 'berlin', 'rome', 'madrid', 'london', 'lisbon', 'athens', 'istanbul', 'amsterdam', 'vienna', 'warsaw', 'prague', 'budapest',
            'marseille', 'lyon', 'nice', 'toulouse', 'milan', 'barcelona', 'munich', 'hamburg', 'manchester', 'birmingham'
          ],
          americas: [
            'usa', 'united states', 'canada', 'mexico', 'brazil', 'argentina', 'chile', 'colombia',
            'new york', 'los angeles', 'miami', 'toronto', 'vancouver', 'mexico city', 'sao paulo', 'rio de janeiro'
          ],
          asia: [
            'china', 'japan', 'thailand', 'india', 'pakistan', 'uae', 'saudi arabia', 'vietnam', 'singapore',
            'tokyo', 'beijing', 'shanghai', 'bangkok', 'delhi', 'mumbai', 'karachi', 'lahore', 'islamabad', 'dubai', 'abu dhabi', 'seoul'
          ]
        };
        const names = regionCountryNames[loc] || [];
        names.forEach(n => {
          const nRegex = new RegExp(escapeRegExp(n), 'i');
          // Deep scan every field for each country in the region
          conditions.push({ location: nRegex });
          conditions.push({ 'locationData.name': nRegex });
          conditions.push({ 'locationData.address': nRegex });
          conditions.push({ 'locationData.city': nRegex });
          conditions.push({ 'locationData.country': nRegex });
          conditions.push({ locationKeys: { $in: [n.toLowerCase()] } });
        });
      }

      // 3. Country-to-ISO: If searching a country (e.g. 'france')
      if (countryToISO[loc]) {
        const code = countryToISO[loc];
        conditions.push({ 'locationData.countryCode': { $in: [code, code.toLowerCase()] } });
      }
    });

    const query = {
      $and: [
        { $or: conditions.length > 0 ? conditions : [{ location: new RegExp(escapeRegExp(location), 'i') }] },
        { 
          $or: [
            { isPrivate: { $ne: true } },
            { visibility: 'Everyone' },
            { visibility: { $exists: false } },
            { visibility: null }
          ] 
        }
      ]
    };

    logger.info(`[Search] Location: "${location}", Query Conditions: ${conditions.length}`);

    // PERFORMANCE UPGRADE: Use Aggregation Pipeline to handle Search + Author + Stats + SavedStatus in ONE DB Roundtrip
    const viewerVariants = viewerId ? [String(viewerId)] : [];
    if (viewerId) {
      try {
        const { candidates } = await require('../src/utils/userUtils').resolveUserIdentifiers(viewerId);
        candidates.forEach(id => { if (!viewerVariants.includes(String(id))) viewerVariants.push(String(id)); });
      } catch (e) {}
    }
    const viewerStrings = viewerVariants.map(String);

    const aggregatePipeline = [
      { $match: query },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      
      // Lookup Comment count
      {
        $lookup: {
          from: 'comments',
          let: { pId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$postId', '$$pId'] } } },
            { $count: 'count' }
          ],
          as: 'commentData'
        }
      },

      // Lookup Saved Status
      {
        $lookup: {
          from: 'savedposts',
          let: { pId: '$_id' },
          pipeline: [
            { 
              $match: { 
                $expr: { 
                  $and: [
                    { $eq: ['$postId', '$$pId'] },
                    { $in: ['$userId', viewerStrings] }
                  ]
                } 
              } 
            },
            { $limit: 1 }
          ],
          as: 'savedStatus'
        }
      },

      // Project final fields to match enrichPostsWithUserData output
      {
        $addFields: {
          commentCount: { 
            $add: [
              { $ifNull: [{ $arrayElemAt: ['$commentData.count', 0] }, 0] },
              { $size: { $ifNull: ['$comments', []] } } // Legacy inline
            ]
          },
          isSaved: { $gt: [{ $size: '$savedStatus' }, 0] },
          likeCount: { 
            $cond: { 
              if: { $isArray: '$likes' }, 
              then: { $size: '$likes' }, 
              else: { $ifNull: ['$likesCount', 0] } 
            }
          },
          isLiked: {
            $cond: {
              if: { $isArray: '$likes' },
              then: { $anyElementTrue: { $map: { input: '$likes', as: 'l', in: { $in: [{ $toString: '$$l' }, viewerStrings] } } } },
              else: false
            }
          }
        }
      }
    ];

    const posts = await Post.aggregate(aggregatePipeline);
    const enriched = await enrichPostsWithUserData(posts, viewerId);

    logger.info(`[Search] Found ${enriched.length} posts for "${location}" (Optimized & Enriched)`);
    res.json({ success: true, data: enriched });
  } catch (err) {
    logger.error('[GET /by-location] Error: %s', err.message);
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

// GET /location-count - Get total number of unique locations
router.get('/location-count', async (req, res) => {
  try {
    const Post = mongoose.model('Post');
    const count = await Post.distinct('locationData.name').then(arr => arr.length);
    res.json({ success: true, data: { count } });
  } catch (err) {
    res.json({ success: true, data: { count: 0 } });
  }
});

// GET /locations/meta - Get metadata for a location (visit counts, etc.)
router.get('/locations/meta', async (req, res) => {
  try {
    const location = (req.query.location || '').trim();
    if (!location) return res.status(400).json({ success: false, error: 'location required' });

    const Post = mongoose.model('Post');
    const regex = new RegExp(escapeRegExp(location), 'i');

    const query = {
      $or: [
        { locationKeys: { $in: [location.toLowerCase(), location] } },
        { location: regex },
        { 'locationData.name': regex }
      ]
    };

    const count = await Post.countDocuments(query);
    const verifiedCount = await Post.countDocuments({ ...query, 'locationData.verified': true });

    res.json({
      success: true,
      data: {
        location,
        visits: count,
        postCount: count,
        verifiedVisits: verifiedCount
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Post CRUD & Actions ---

// POST / - Create post
router.post('/', verifyToken, validate(createPostSchema), async (req, res) => {
  try {
    const Post = mongoose.model('Post');
    // Whitelist fields to prevent mass assignment vulnerability
    const allowed = [
      'content', 'caption', 'imageUrl', 'mediaUrls', 'mediaType', 'thumbnailUrl',
      'aspectRatio', 'location', 'locationData', 'locationKeys', 'category',
      'hashtags', 'mentions', 'taggedUserIds', 'isPrivate', 'visibility', 'allowedFollowers'
    ];
    const postData = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) postData[f] = req.body[f]; });
    // Always use authenticated userId from token, NEVER trust body.userId
    postData.userId = req.userId;
    const post = new Post(postData);
    await post.save();
    res.status(201).json({ success: true, data: post });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /:postId - Detail
router.get('/:postId', optionalAuth, async (req, res) => {
  try {
    // SECURITY FIX: Never trust client-provided headers/queries for user identity
    const viewerId = req.userId || null;
    const query = resolvePostQuery(req.params.postId);

    const enriched = await postService.getEnrichedPosts(query, { limit: 1, viewerId });

    if (!enriched || enriched.length === 0) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    res.json({ success: true, data: enriched[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH / :postId - Edit (requires auth + ownership)
router.patch('/:postId', verifyToken, validate(updatePostSchema), async (req, res) => {
  try {
    const Post = mongoose.model('Post');
    const post = await Post.findOne(resolvePostQuery(req.params.postId));
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    // Ownership check: allow if userId matches any known variant
    const { candidates } = await resolveUserIdentifiers(req.userId);
    const postOwner = String(post.userId || '');
    const isOwner = candidates.map(String).includes(postOwner);
    if (!isOwner) return res.status(403).json({ success: false, error: 'Forbidden: not your post' });

    // Whitelist editable fields
    const editable = ['content', 'caption', 'mediaUrls', 'mediaType', 'location', 'locationData', 'locationKeys',
      'category', 'hashtags', 'mentions', 'taggedUserIds', 'isPrivate', 'visibility',
      'allowedFollowers', 'thumbnailUrl', 'aspectRatio'];
    const updateData = { updatedAt: new Date() };
    editable.forEach(f => { if (req.body[f] !== undefined) updateData[f] = req.body[f]; });

    const updated = await Post.findOneAndUpdate(
      resolvePostQuery(req.params.postId),
      { $set: updateData },
      { new: true }
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /:postId - Delete (requires auth + ownership)
router.delete('/:postId', verifyToken, async (req, res) => {
  try {
    const Post = mongoose.model('Post');
    const post = await Post.findOne(resolvePostQuery(req.params.postId));
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    // Ownership check
    const { candidates } = await resolveUserIdentifiers(req.userId);
    const postOwner = String(post.userId || '');
    const isOwner = candidates.map(String).includes(postOwner);
    if (!isOwner) return res.status(403).json({ success: false, error: 'Forbidden: not your post' });

    await Post.deleteOne(resolvePostQuery(req.params.postId));
    res.json({ success: true, message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /:postId/react - Add/Update Emoji Reaction
router.post('/:postId/react', verifyToken, async (req, res) => {
  try {
    const { userName, userAvatar, emoji } = req.body;
    const userId = req.userId;
    const Post = mongoose.model('Post');
    await Post.updateOne(
      resolvePostQuery(req.params.postId),
      { $pull: { reactions: { userId: String(userId) } } }
    );
    const post = await Post.findOneAndUpdate(
      resolvePostQuery(req.params.postId),
      { 
        $push: { 
          reactions: { 
            userId: String(userId), 
            userName: userName || 'User', 
            userAvatar: userAvatar || '', 
            emoji: emoji || '❤️', 
            createdAt: new Date() 
          } 
        } 
      },
      { new: true }
    );
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:postId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { userName } = req.body;
    const Post = mongoose.model('Post');
    
    // 1. Resolve all user ID variants
    const { canonicalId, candidates } = await resolveUserIdentifiers(userId);
    
    // 2. Check if already liked using any known variant
    const existingPost = await Post.findOne(resolvePostQuery(req.params.postId));
    if (!existingPost) return res.status(404).json({ success: false, error: 'Post not found' });

    // Use candidates to check if ANY of the user's IDs are in the likes array
    const alreadyLiked = Array.isArray(existingPost.likes) && existingPost.likes.some(l => {
      const lid = String(l?._id || l?.id || l || '');
      return candidates.includes(lid);
    });
    
    if (alreadyLiked) {
      // If already liked, just return success without incrementing
      return res.json({ success: true, data: existingPost, message: 'Already liked' });
    }

    // 3. Add canonicalId to ensure consistency in the database
    const post = await Post.findOneAndUpdate(
      resolvePostQuery(req.params.postId),
      { $addToSet: { likes: canonicalId }, $inc: { likesCount: 1 } },
      { new: true }
    );

    if (post && String(post.userId) !== String(canonicalId)) {
      const User = mongoose.model('User');
      const sender = await User.findById(canonicalId).select('displayName name').lean();
      const senderName = sender?.displayName || sender?.name || 'Someone';

      notificationQueue.add('postLike', {
        userId: post.userId,
        senderId: canonicalId,
        title: 'New Like! ❤️',
        body: `${senderName} liked your post`,
        data: { postId: post._id, type: 'LIKE', screen: 'home' }
      }).catch(() => {});
    }

    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /:postId/like - Unlike
router.delete('/:postId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { candidates } = await resolveUserIdentifiers(userId);
    const Post = mongoose.model('Post');
    
    // Pull any known ID variant from the likes array
    const post = await Post.findOneAndUpdate(
      resolvePostQuery(req.params.postId),
      { $pull: { likes: { $in: candidates } }, $inc: { likesCount: -1 } },
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

// GET /:postId/comments - Get comments for a specific post
router.get('/:postId/comments', optionalAuth, async (req, res) => {
  try {
    const { postId } = req.params;
    const viewerId = req.userId || null;
    
    const Post = mongoose.model('Post');
    const Comment = mongoose.model('Comment');
    
    // Resolve post
    const post = await Post.findOne(resolvePostQuery(postId)).lean();

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
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

module.exports = router;

