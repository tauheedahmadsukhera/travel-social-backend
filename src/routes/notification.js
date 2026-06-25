const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/authMiddleware');
const notificationController = require('../controllers/notificationController');

// Create notification (JWT required — server-to-server calls must use service auth)
router.post('/', verifyToken, notificationController.createNotification);

// Get notifications for user (JWT required + self-only)
router.get('/:userId', verifyToken, async (req, res, next) => {
  // Ensure a user can only fetch their own notifications
  if (req.userId !== req.params.userId) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  return notificationController.getUserNotifications(req, res, next);
});

// Mark notification as read (JWT required)
router.post('/:notificationId/read', verifyToken, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const objectId = mongoose.Types.ObjectId.isValid(notificationId)
      ? new mongoose.Types.ObjectId(notificationId)
      : notificationId;

    const Notification = mongoose.model('Notification');

    // Only allow marking your own notification as read
    const notif = await Notification.findOne({ _id: objectId });
    if (!notif) return res.status(404).json({ success: false, error: 'Not found' });
    if (String(notif.userId) !== req.userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    await Notification.updateOne(
      { _id: objectId },
      { $set: { read: true, readAt: new Date() } }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// Mark all notifications as read for user (JWT required, self-only)
router.post('/user/:userId/read-all', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const Notification = mongoose.model('Notification');
    await Notification.updateMany(
      { userId, read: { $ne: true } },
      { $set: { read: true, readAt: new Date() } }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// Delete notification (JWT required, ownership enforced)
router.delete('/:notificationId', verifyToken, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const objectId = mongoose.Types.ObjectId.isValid(notificationId)
      ? new mongoose.Types.ObjectId(notificationId)
      : notificationId;

    const Notification = mongoose.model('Notification');
    const notif = await Notification.findOne({ _id: objectId });

    if (!notif) return res.status(404).json({ success: false, error: 'Not found' });
    if (String(notif.userId) !== req.userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    await Notification.deleteOne({ _id: objectId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

module.exports = router;
