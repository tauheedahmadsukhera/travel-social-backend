const mongoose = require('mongoose');

async function enrichPostsWithUserData(posts, viewerId = null) {
  if (!Array.isArray(posts) || posts.length === 0) return posts;

  let viewerVariants = viewerId ? [String(viewerId)] : [];
  if (viewerId) {
    try {
      const { candidates } = await require('../src/utils/userUtils').resolveUserIdentifiers(viewerId);
      candidates.forEach(id => { if (!viewerVariants.includes(String(id))) viewerVariants.push(String(id)); });
      console.log(`🔍 [enrich] viewerId: ${viewerId}, variants: ${viewerVariants.join(', ')}`);
    } catch (e) {
      console.error(`❌ [enrich] variant resolution failed:`, e.message);
    }
  } else {
    console.log(`🔍 [enrich] NO viewerId provided!`);
  }

  try {
    const User = mongoose.model('User');
    const isBadAvatar = (value) => {
      if (typeof value !== 'string') return true;
      const v = value.trim().toLowerCase();
      if (!v || v === 'null' || v === 'undefined' || v === 'n/a' || v === 'na') return true;
      if (v.includes('via.placeholder.com/200x200.png?text=profile')) return true;
      if (v.includes('/default%2fdefault-pic.jpg') || v.includes('/default/default-pic.jpg')) return true;
      if (v.includes('avatardefault.webp')) return true;
      return false;
    };
    
    // Collect all unique user IDs from reactions, inline comments, and tags
    const userIds = new Set();
    posts.forEach(post => {
      const p = post.toObject ? post.toObject() : post;
      const authorRef = String(p.userId?._id || p.userId || '');
      if (authorRef) userIds.add(authorRef);
      if (Array.isArray(p.reactions)) {
        p.reactions.forEach(r => { if (r.userId) userIds.add(String(r.userId)); });
      }
      if (Array.isArray(p.comments)) {
        p.comments.forEach(c => { if (c.userId) userIds.add(String(c.userId)); });
      }
      if (Array.isArray(p.taggedUserIds)) {
        p.taggedUserIds.forEach(id => { if (id) userIds.add(String(id)); });
      }
    });

    if (userIds.size === 0) return posts;

    const userIdsArray = Array.from(userIds);
    const users = await User.find({
      $or: [
        { _id: { $in: userIdsArray.filter(id => mongoose.Types.ObjectId.isValid(id)) } },
        { firebaseUid: { $in: userIdsArray } },
        { uid: { $in: userIdsArray } }
      ]
    }).lean();

    const userMap = {};
    users.forEach(u => {
      const id = u._id.toString();
      const fuid = u.firebaseUid || u.uid;
      const avatar = u.avatar || u.photoURL || u.profilePicture || null;
      const name = u.displayName || u.name || (u.email ? u.email.split('@')[0] : 'User');
      const profile = {
        avatar,
        photoURL: u.photoURL || avatar || null,
        profilePicture: u.profilePicture || avatar || null,
        name,
        displayName: u.displayName || name,
        username: u.username || u.displayName || name
      };
      
      if (id) userMap[id] = profile;
      if (fuid) userMap[fuid] = profile;
    });

    // BATCH FETCH: Comment counts for all posts (Optimized - removed slow regex scans)
    const Comment = mongoose.model('Comment');
    const postIds = posts.map(p => String(p._id || p.id));
    
    const commentCounts = await Comment.aggregate([
      { 
        $match: { 
          postId: { $in: postIds }
        } 
      },
      { 
        $group: { 
          _id: "$postId", 
          commentCount: { $sum: 1 }, 
          replyCount: { $sum: { $size: { $ifNull: ["$replies", []] } } }
        } 
      }
    ]);

    const countMap = {};
    commentCounts.forEach(c => {
      countMap[String(c._id)] = (c.commentCount || 0) + (c.replyCount || 0);
    });
    
    // BATCH FETCH: Likes, Saves, and Reactions status for viewer (Optimized for Scaling)
    const likedPostIds = new Set();
    const savedPostIds = new Set();
    const reactionsMap = {}; // postId -> Array of Reactions
    try {
      const Like = mongoose.model('Like');
      const Save = mongoose.model('Save');
      const Reaction = mongoose.model('Reaction');

      const promises = [
        Reaction.find({
          postId: { $in: postIds }
        }).sort({ createdAt: -1 }).lean()
      ];

      if (viewerVariants.length > 0) {
        promises.push(
          Like.find({ 
            userId: { $in: viewerVariants },
            postId: { $in: postIds }
          }).select('postId').lean(),
          Save.find({ 
            userId: { $in: viewerVariants },
            postId: { $in: postIds }
          }).select('postId').lean()
        );
      }

      const results = await Promise.all(promises);
      const reactions = results[0] || [];
      const likes = results[1] || [];
      const saves = results[2] || [];

      likes.forEach(l => likedPostIds.add(String(l.postId)));
      saves.forEach(s => savedPostIds.add(String(s.postId)));

      // Group reactions by postId (limit to 5 per post)
      reactions.forEach(r => {
        const pidKey = String(r.postId);
        if (!reactionsMap[pidKey]) {
          reactionsMap[pidKey] = [];
        }
        if (reactionsMap[pidKey].length < 5) {
          reactionsMap[pidKey].push({
            userId: String(r.userId),
            userName: r.userName || 'User',
            userAvatar: r.userAvatar || null,
            emoji: r.emoji || '❤️',
            createdAt: r.createdAt
          });
        }
      });
    } catch (e) {
      console.warn('[enrich] Likes/Saves/Reactions batch fetch failed:', e.message);
    }


    const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
    const baseUrl = BACKEND_URL.endsWith('/') ? BACKEND_URL : `${BACKEND_URL}/`;

    return posts.map(post => {
      const p = post.toObject ? post.toObject() : post;
      const pid = String(p._id || p.id);
      const cleanPid = pid.split('-loop')[0];

      // --- NEW UNIFIED MEDIA LOGIC ---
      const mediaList = [];
      const seenUrls = new Set();

      const processMediaItem = (item, fieldName) => {
        if (!item) return;
        const arr = Array.isArray(item) ? item : [item];
        arr.forEach(m => {
          let rawUrl = typeof m === 'string' ? m : (m.url || m.uri || m.secure_url);
          if (!rawUrl) return;
          
          let url = rawUrl.trim();
          // If it's a relative path, ensure it starts with / but DON'T add host here
          if (!url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('file:')) {
            if (!url.startsWith('/')) url = '/' + url;
          }

          if (!seenUrls.has(url)) {
            seenUrls.add(url);
            const isVideo = url.toLowerCase().includes('.mp4') || url.toLowerCase().includes('.mov') || url.toLowerCase().includes('video/upload') || m.type === 'video' || m.mediaType === 'video';
            
            mediaList.push({
              url,
              type: isVideo ? 'video' : 'image',
              aspectRatio: m.aspectRatio || p.aspectRatio || 1,
              width: m.width || undefined,
              height: m.height || undefined
            });
          }
        });
      };

      processMediaItem(p.mediaUrls, 'mediaUrls');
      processMediaItem(p.media, 'media');
      processMediaItem(p.imageUrl, 'imageUrl');
      processMediaItem(p.imageUrls, 'imageUrls');
      processMediaItem(p.videoUrl, 'videoUrl');
      processMediaItem(p.url, 'url');

      // Unified media array for modern frontend
      p.media = mediaList;
      
      // Preserve original imageUrl for legacy frontend compatibility
      if (!p.imageUrl && mediaList.length > 0 && mediaList[0].type === 'image') {
        p.imageUrl = mediaList[0].url;
      }
      // -------------------------------
      
      const authorRef = String(p.userId?._id || p.userId || p.authorData?._id || '');
      const author = userMap[authorRef] || p.authorData; // Use batch map or pre-enriched data

      if (author) {
        // Construct the structured user object the frontend expects
        const enrichedUser = {
          _id: author._id || authorRef,
          id: authorRef,
          displayName: author.displayName || author.name || 'User',
          name: author.name || author.displayName || 'User',
          username: author.username || undefined,
          avatar: author.avatar || author.photoURL || author.profilePicture || null,
          photoURL: author.photoURL || author.avatar || author.profilePicture || null,
          profilePicture: author.profilePicture || author.avatar || author.photoURL || null
        };

        // Standardize naming
        p.userId = enrichedUser;
        p.userName = enrichedUser.displayName;
        p.userAvatar = enrichedUser.avatar;
      } else {
        // Fallback for missing authors
        p.userName = p.userName || 'User';
      }

      p.reactions = reactionsMap[cleanPid] || [];

      // Enrich taggedUsers array
      if (Array.isArray(p.taggedUserIds) && p.taggedUserIds.length > 0) {
        p.taggedUsers = p.taggedUserIds.map(id => {
          const u = userMap[String(id)];
          return u ? {
            _id: String(id),
            id: String(id),
            uid: String(id),
            displayName: u.displayName || u.name || 'User',
            username: u.username || u.displayName || 'user',
            avatar: u.avatar || u.photoURL || null
          } : {
            _id: String(id),
            id: String(id),
            uid: String(id),
            displayName: 'User',
            username: 'user'
          };
        });
      } else {
        p.taggedUsers = [];
      }

      p.likeCount = Math.max(p.likesCount || 0, Array.isArray(p.likes) ? p.likes.length : 0);
      
      // REAL LIVE COUNT: Collection comments + Inline legacy comments
      const collectionCount = countMap[pid] || 0;
      
      // Filter legacy inline comments for empty text
      let inlineCount = 0;
      if (Array.isArray(p.comments)) {
        inlineCount = p.comments.filter(c => {
          const t = String(c.text || c.content || c.message || c.comment || "").trim();
          return t.length > 0;
        }).length;
      }
      
      p.commentCount = collectionCount + inlineCount;


      p.reactionCount = p.reactionsCount || 0;
      
      const viewerStrings = viewerVariants.map(v => String(v));

      // Determine if viewer liked the post
      p.isLiked = false;
      if (viewerStrings.length > 0) {
        p.isLiked = likedPostIds.has(cleanPid);
      }
      
      // Mock likes array so frontend doesn't break expecting post.likes
      p.likes = p.isLiked ? viewerStrings : [];

      // Determine if viewer saved the post
      p.isSaved = false;
      if (viewerStrings.length > 0) {
        p.isSaved = savedPostIds.has(cleanPid);
        
        if (p.isSaved) {
          p.saved = true; // Extra flag for safety
          p.savedBy = viewerStrings;
        } else {
          p.saved = false;
          p.savedBy = [];
        }
      } else {
        p.savedBy = [];
      }

      return p;
    });

  } catch (err) {
    console.warn('[enrichPostsWithUserData] Warning:', err.message);
    return posts;
  }
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePostLocation(postObj) {
  const loc = (postObj && postObj.locationData && postObj.locationData.name) ? postObj.locationData.name : postObj.location;
  return (typeof loc === 'string') ? loc.trim() : '';
}

function normalizeLocationKey(val) {
  return String(val || '').trim().toLowerCase();
}

function uniqueLocationKeys(keys) {
  const out = [];
  const seen = new Set();
  for (const k of Array.isArray(keys) ? keys : []) {
    const n = normalizeLocationKey(k);
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function buildLocationKeysFromPayload(location, locationData, explicitKeys) {
  const keys = [];

  if (Array.isArray(explicitKeys)) {
    keys.push(...explicitKeys);
  }

  if (locationData && typeof locationData === 'object') {
    keys.push(locationData.name);
    keys.push(locationData.neighborhood);
    keys.push(locationData.city);
    keys.push(locationData.state);
    keys.push(locationData.country);
    keys.push(locationData.countryCode);
    if (locationData.region) keys.push(locationData.region);

    const addr = typeof locationData.address === 'string' ? locationData.address : '';
    if (addr) {
      const parts = addr.split(',').map(p => p.trim()).filter(Boolean);
      parts.forEach(p => keys.push(p));
    }
  }

  keys.push(location);

  const normalized = uniqueLocationKeys(keys);

  // --- SMART REGION MAPPING ---
  const addr = (locationData?.address || '').toLowerCase();
  let country = normalizeLocationKey(locationData?.country || '');
  let countryCode = (locationData?.countryCode || '').toUpperCase();

  // If country is missing, try to extract from address string (Production Grade Fallback)
  if (!country && addr) {
    const parts = addr.split(',').map(p => p.trim());
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1];
      if (lastPart.length > 2) country = normalizeLocationKey(lastPart);
    }
  }

  // --- PRODUCTION-GRADE ISO REGION MAPPING ---
  // Using ISO 3166-1 alpha-2 codes for 100% accuracy
  const regionISO = {
    europe: ['FR', 'DE', 'IT', 'ES', 'GB', 'UK', 'PT', 'GR', 'CH', 'NL', 'BE', 'AT', 'TR', 'SE', 'NO', 'DK', 'FI', 'IE', 'PL', 'CZ', 'HU', 'RO', 'BG', 'HR', 'UA', 'RU', 'ME', 'AL', 'RS', 'BA', 'SI', 'IS', 'MC', 'MT', 'LU', 'LI', 'AD', 'SM', 'VA', 'EE', 'LV', 'LT'],
    americas: ['US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'EC', 'BO', 'PY', 'UY', 'CU', 'JM', 'CR', 'PA', 'GT', 'HN', 'SV', 'NI', 'DO', 'HT', 'PR'],
    asia: ['CN', 'JP', 'TH', 'VN', 'SG', 'HK', 'IN', 'PK', 'AE', 'SA', 'KR', 'ID', 'MY', 'PH', 'TW', 'IL', 'QA', 'KW', 'OM', 'JO', 'LB', 'KH', 'LA', 'MM', 'NP', 'LK', 'BD'],
    africa: ['EG', 'MA', 'ZA', 'KE', 'NG', 'DZ', 'TN', 'ET', 'GH', 'TZ', 'UG', 'SN', 'CI', 'AO', 'CM', 'ET', 'ZW'],
    oceania: ['AU', 'NZ', 'FJ', 'PG', 'SB', 'VU', 'NC', 'PF']
  };

  const currentCountryCode = (locationData?.countryCode || '').toUpperCase();
  const currentCountry = normalizeLocationKey(locationData?.country || '');

  for (const [region, codes] of Object.entries(regionISO)) {
    if (codes.includes(currentCountryCode)) {
      if (!normalized.includes(region)) normalized.push(region);
    }
  }

  // Legacy fallback for string names
  const legacyRegionMap = {
    europe: ['france', 'germany', 'italy', 'spain', 'uk', 'united kingdom', 'portugal', 'greece', 'switzerland', 'netherlands', 'belgium', 'austria', 'turkey'],
    americas: ['usa', 'united states', 'canada', 'mexico', 'brazil', 'argentina', 'chile', 'colombia'],
    asia: ['china', 'japan', 'thailand', 'vietnam', 'singapore', 'india', 'pakistan', 'uae', 'dubai']
  };

  for (const [region, countries] of Object.entries(legacyRegionMap)) {
    if (countries.includes(currentCountry)) {
      if (!normalized.includes(region)) normalized.push(region);
    }
  }

  if (countryCode === 'gb' || country === 'uk' || country === 'united kingdom') {
    if (!normalized.includes('uk')) normalized.push('uk');
    if (!normalized.includes('united kingdom')) normalized.push('united kingdom');
  }

  return uniqueLocationKeys(normalized);
}

function formatLocationLabel(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'uk') return 'UK';
  if (lower === 'united kingdom') return 'United Kingdom';
  if (/[A-Z]/.test(raw)) return raw;
  return lower
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function isPostVisibleToViewer(postObj, viewerIdOrVariants, friendIds, familyMemberIds) {
  if (!postObj) return false;

  // 1. Resolve Identities
  const authorId = String(postObj.userId?._id || postObj.userId || '');
  const viewerVariants = Array.isArray(viewerIdOrVariants) ? viewerIdOrVariants : (viewerIdOrVariants ? [String(viewerIdOrVariants)] : []);
  const isOwner = (authorId && viewerVariants.includes(authorId));

  // Author always sees their own post
  if (isOwner) return true;

  // 2. Resolve Visibility Data
  const visibility = postObj.visibility || (postObj.audience === 'everyone' ? 'Everyone' : (postObj.isPrivate ? 'Friends' : 'Everyone'));
  const allowed = Array.isArray(postObj.allowedFollowers) ? postObj.allowedFollowers.map(String) : [];
  const isTargeted = allowed.some(id => viewerVariants.includes(String(id)));

  // If explicitly allowed (e.g. via group membership during creation), show it immediately
  if (isTargeted) return true;

  // 3. Public/Private Account Logic
  if (visibility === 'Everyone') {
    return true; 
  }

  // From here on, viewer must be logged in for non-public posts
  if (viewerVariants.length === 0) return false;

  // 4. Semantic checks for Friends/Family groups
  const visLower = visibility.toLowerCase();
  const viewerInFriends = Array.isArray(friendIds) && friendIds.some(id => viewerVariants.includes(String(id)));
  const viewerInFamily = Array.isArray(familyMemberIds) && familyMemberIds.some(id => viewerVariants.includes(String(id)));
  
  if (visLower === 'friends' && viewerInFriends) return true;
  if (visLower === 'family' && viewerInFamily) return true;

  return false;
}

module.exports = {
  enrichPostsWithUserData,
  escapeRegExp,
  normalizePostLocation,
  normalizeLocationKey,
  uniqueLocationKeys,
  buildLocationKeysFromPayload,
  formatLocationLabel,
  isPostVisibleToViewer
};
