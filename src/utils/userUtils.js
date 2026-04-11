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

  try {
    let user = null;
    // Try as MongoDB ID
    if (mongoose.Types.ObjectId.isValid(raw)) {
      user = await User.findById(raw).select('_id firebaseUid uid').lean();
    }
    
    // Try as Firebase UID if not found as MongoDB ID
    if (!user) {
      user = await User.findOne({ 
        $or: [{ firebaseUid: raw }, { uid: raw }] 
      }).select('_id firebaseUid uid').lean();
    }

    const canonicalId = user?._id ? String(user._id) : raw;
    const firebaseUid = user?.firebaseUid || user?.uid || null;
    const candidates = uniqStrings([raw, canonicalId, firebaseUid ? String(firebaseUid) : null]);

    return { 
      raw, 
      canonicalId, 
      firebaseUid: firebaseUid ? String(firebaseUid) : null, 
      candidates 
    };
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

module.exports = {
  resolveUserIdentifiers
};
