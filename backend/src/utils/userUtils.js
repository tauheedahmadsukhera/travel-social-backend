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

const toObjectId = (id) => {
  if (typeof id === 'object' && (id instanceof mongoose.Types.ObjectId || id?._bsontype === 'ObjectId')) return id;
  try {
    return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
  } catch (err) {
    return null;
  }
};

module.exports = {
  resolveUserIdentifiers,
  toObjectId
};
