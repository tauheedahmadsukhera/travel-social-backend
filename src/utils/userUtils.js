const mongoose = require('mongoose');

/**
 * Resolves different user ID variants (MongoDB _id, Firebase UID, etc.)
 * @param {string} inputId The ID string provided in the request
 * @returns {Promise<{raw: string, canonicalId: string, firebaseUid: string|null, candidates: string[]}>}
 */
async function resolveUserIdentifiers(inputId) {
  const raw = String(inputId);
  const User = mongoose.model('User');

  const uniqStrings = (arr) => Array.from(new Set((arr || []).filter(Boolean).map(v => String(v))));

  // Dynamic require to prevent circular references on startup
  let redisClient, isRedisAvailable;
  try {
    const queueService = require('../../services/queue');
    redisClient = queueService.redisClient;
    isRedisAvailable = queueService.isRedisAvailable;
  } catch (e) {}

  const cacheKey = `user:resolve:${raw}`;
  if (isRedisAvailable && isRedisAvailable()) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (cacheErr) {
      // Non-blocking warning
    }
  }

  try {
    // Aggressive lookup: search all possible ID fields for the input string
    let user = await User.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(raw) ? new mongoose.Types.ObjectId(raw) : null },
        { firebaseUid: raw },
        { uid: raw }
      ].filter(q => q._id !== null || q.firebaseUid || q.uid)
    }).select('_id firebaseUid uid').lean();
    
    if (!user && mongoose.Types.ObjectId.isValid(raw)) {
       // fallback for direct ID if for some reason findOne with $or is finicky on some Mongo versions
       user = await User.findById(raw).select('_id firebaseUid uid').lean();
    }

    const canonicalId = user?._id ? String(user._id) : raw;
    const firebaseUid = user?.firebaseUid || user?.uid || null;
    const candidates = uniqStrings([raw, canonicalId, firebaseUid ? String(firebaseUid) : null]);

    const result = { 
      raw, 
      canonicalId, 
      firebaseUid: firebaseUid ? String(firebaseUid) : null, 
      candidates 
    };

    if (isRedisAvailable && isRedisAvailable() && user) {
      try {
        await redisClient.setex(cacheKey, 3600, JSON.stringify(result)); // Cache for 1 hour
      } catch (cacheErr) {
        // Non-blocking write error
      }
    }

    return result;
  } catch (err) {
    console.error('[resolveUserIdentifiers] Error:', err.message);
    return { 
      raw, 
      canonicalId: raw, 
      firebaseUid: null, 
      candidates: uniqStrings([raw]) 
    };
  }
}

const toObjectId = (id) => {
  if (typeof id === 'object' && (id instanceof mongoose.Types.ObjectId || id?._bsontype === 'ObjectId')) return id;
  try {
    return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
  } catch (err) {
    return null;
  }
};

/**
 * Gets all user IDs involved in blocking with the current user (either blocked by or blocking the current user).
 * @param {string} userId - The current user's ID
 * @returns {Promise<string[]>} - Array of unique string IDs
 */
async function getBlockedUserBoundaries(userId) {
  if (!userId) return [];
  const User = mongoose.model('User');
  const resolved = await resolveUserIdentifiers(userId);
  const userCandidates = resolved.candidates.map(String);

  // Find the user to get their blockedUsers list
  const user = await User.findOne({
    $or: [
      { _id: { $in: userCandidates.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id)) } },
      { firebaseUid: { $in: userCandidates } },
      { uid: { $in: userCandidates } }
    ]
  }).select('blockedUsers').lean();

  const blockedByMe = user?.blockedUsers || [];

  // Find users who blocked me
  const blockedMeUsers = await User.find({
    blockedUsers: { $in: userCandidates }
  }).select('_id firebaseUid uid').lean();

  const blockedMe = blockedMeUsers.flatMap(u => [
    String(u._id),
    u.firebaseUid,
    u.uid
  ]).filter(Boolean);

  // Return unique string identifiers
  return [...new Set([...blockedByMe, ...blockedMe])].map(String);
}

module.exports = {
  resolveUserIdentifiers,
  toObjectId,
  getBlockedUserBoundaries
};
