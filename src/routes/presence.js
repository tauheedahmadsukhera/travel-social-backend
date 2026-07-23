const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/authMiddleware');
const { resolveUserIdentifiers } = require('../utils/userUtils');

async function assertSelfOrAdmin(req, userId) {
  const resolved = await resolveUserIdentifiers(req.userId);
  const target = await resolveUserIdentifiers(userId);
  const isSelf = resolved.candidates.some(c => target.candidates.map(String).includes(String(c)));
  if (!isSelf && req.user?.role !== 'admin') {
    return false;
  }
  return true;
}

router.post('/online', verifyToken, async (req, res) => {
  try {
    const userId = req.body.userId || req.userId;
    if (!(await assertSelfOrAdmin(req, userId))) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const User = mongoose.model('User');
    await User.updateOne(
      {
        $or: [
          { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null },
          { firebaseUid: userId },
          { uid: userId }
        ]
      },
      { isOnline: true, lastSeen: new Date() }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update presence' });
  }
});

router.post('/offline', verifyToken, async (req, res) => {
  try {
    const userId = req.body.userId || req.userId;
    if (!(await assertSelfOrAdmin(req, userId))) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const User = mongoose.model('User');
    await User.updateOne(
      {
        $or: [
          { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null },
          { firebaseUid: userId },
          { uid: userId }
        ]
      },
      { isOnline: false, lastSeen: new Date() }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update presence' });
  }
});

// GET /api/presence/:userId - Read presence (authenticated)
router.get('/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const User = mongoose.model('User');
    const user = await User.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null },
        { firebaseUid: userId },
        { uid: userId }
      ]
    }).select('isOnline lastSeen').lean();

    res.json(user || { isOnline: false, lastSeen: null });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch presence' });
  }
});

module.exports = router;
