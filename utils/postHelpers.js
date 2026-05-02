const mongoose = require('mongoose');

async function enrichPostsWithUserData(posts) {
  if (!Array.isArray(posts) || posts.length === 0) return posts;

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
    
    // Collect all unique user IDs from reactions and inline comments
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
      const name = u.displayName || u.name || 'User';
      const profile = {
        avatar,
        photoURL: u.photoURL || avatar || null,
        profilePicture: u.profilePicture || avatar || null,
        name,
        displayName: u.displayName || name
      };
      
      if (id) userMap[id] = profile;
      if (fuid) userMap[fuid] = profile;
    });

    return posts.map(post => {
      const p = post.toObject ? post.toObject() : post;
      const authorRef = String(p.userId?._id || p.userId || '');
      const author = userMap[authorRef];

      if (author) {
        // If userId was a string, transform it into an object to match frontend expectations
        if (typeof p.userId === 'string' || !p.userId) {
          p.userId = {
            _id: authorRef,
            id: authorRef,
            displayName: author.displayName || author.name || 'User',
            name: author.name || author.displayName || 'User',
            avatar: author.avatar || author.photoURL || author.profilePicture || null,
            photoURL: author.photoURL || author.avatar || author.profilePicture || null,
            profilePicture: author.profilePicture || author.avatar || author.photoURL || null
          };
        } else if (typeof p.userId === 'object') {
          p.userId = {
            ...p.userId,
            avatar: author.avatar || p.userId.avatar || p.userId.photoURL || p.userId.profilePicture || null,
            photoURL: author.photoURL || p.userId.photoURL || p.userId.avatar || p.userId.profilePicture || null,
            profilePicture: author.profilePicture || p.userId.profilePicture || p.userId.avatar || p.userId.photoURL || null,
            displayName: p.userId.displayName || author.displayName || author.name,
            name: p.userId.name || author.name || author.displayName
          };
        }

        // Maintain top-level userName/userAvatar for components that expect them flat
        p.userName = author.displayName || author.name || p.userName || 'User';
        if (isBadAvatar(p.userAvatar)) {
          p.userAvatar = author.avatar || author.photoURL || author.profilePicture || p.userAvatar || null;
        }
      }

      
      // Enrich reactions
      if (Array.isArray(p.reactions)) {
        p.reactions = p.reactions.map(r => ({
          ...r,
          userName: userMap[String(r.userId)]?.name || r.userName || 'User',
          userAvatar: userMap[String(r.userId)]?.avatar || userMap[String(r.userId)]?.photoURL || userMap[String(r.userId)]?.profilePicture || r.userAvatar || null
        }));
      }

      // Enrich inline comments (if any)
      if (Array.isArray(p.comments)) {
        p.comments = p.comments.map(c => ({
          ...c,
          userName: userMap[String(c.userId)]?.name || c.userName || 'User',
          userAvatar: userMap[String(c.userId)]?.avatar || userMap[String(c.userId)]?.photoURL || userMap[String(c.userId)]?.profilePicture || c.userAvatar || null
        }));
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
    keys.push(locationData.country);
    keys.push(locationData.countryCode);

    const addr = typeof locationData.address === 'string' ? locationData.address : '';
    if (addr) {
      const parts = addr.split(',').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 1) keys.push(parts[0]);
      if (parts.length >= 2) keys.push(parts[1]);
      if (parts.length >= 1) keys.push(parts[parts.length - 1]);
    }
  }

  keys.push(location);

  const normalized = uniqueLocationKeys(keys);

  const countryCode = normalizeLocationKey(locationData && locationData.countryCode);
  const country = normalizeLocationKey(locationData && locationData.country);
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
