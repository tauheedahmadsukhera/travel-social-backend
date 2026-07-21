const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Unified presence store using User model directly (resolves data conflicts and allows scaling)

router.post('/online', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
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
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/offline', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
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
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:userId', async (req, res) => {
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
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
