const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { resolveUserIdentifiers } = require('../src/utils/userUtils');
const { verifyToken } = require('../src/middleware/authMiddleware');
const { sendPushNotification, sendEventNotification } = require('../services/pushNotificationService');

const Notification = require('../src/models/Notification');

// Add a notification (Requires Auth - usually system internal)
router.post('/', verifyToken, async (req, res, next) => {
  try {
    const userId = req.userId;
    // Basic protection: can only add notifications for yourself unless admin
    if (req.body.recipientId && String(req.body.recipientId) !== String(userId)) {
        // Check for admin role
        const User = mongoose.model('User');
        const user = await User.findById(userId);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }
    }
    const notification = new Notification(req.body);
    await notification.save();
    res.json({ success: true, id: notification._id });
  } catch (err) {
    next(err);
  }
});

// Get notifications for a user (multiple route patterns supported)
const getNotificationsHandler = async (req, res, next) => {
  try {
    const user = await resolveUserIdentifiers(req.params.userId);
    console.log(`🔍 [Notifications] Fetching for ${req.params.userId}, resolved candidates:`, user.candidates);
    
    const notifications = await Notification.find({ 
      recipientId: { $in: user.candidates } 
    }).sort({ createdAt: -1 }).lean();

    console.log(`✅ [Notifications] Found ${notifications.length} records in DB`);

    // Normalize notifications for frontend (ensure lowercase types and sender details)
    const normalized = notifications.map(n => ({
      ...n,
      type: (n.type || 'generic').toLowerCase(),
      senderName: n.senderName || 'Someone',
      senderAvatar: n.senderAvatar || null
    }));

    res.json({ success: true, data: normalized });
  } catch (err) {
    console.error('❌ [Notifications] Fetch Error:', err.message);
    next(err);
  }
};

router.get('/:userId', verifyToken, getNotificationsHandler);


// Mark all notifications as read for a user
router.patch('/read-all', verifyToken, async (req, res, next) => {
  try {
    const userId = req.userId;
    const user = await resolveUserIdentifiers(userId);
    
    await Notification.updateMany(
      { recipientId: { $in: user.candidates }, read: false },
      { $set: { read: true } }
    );
    
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
});

// Delete a notification (Requires Auth)
router.delete('/:notificationId', verifyToken, async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.notificationId);
    if (!notification) return res.status(404).json({ success: false, error: 'Not found' });
    
    // Ownership check
    const userId = req.userId;
    const resolved = await resolveUserIdentifiers(userId);
    if (!resolved.candidates.includes(String(notification.recipientId))) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    await Notification.findByIdAndDelete(req.params.notificationId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Mark notification as read (Requires Auth)
router.put('/:notificationId/read', verifyToken, async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.notificationId);
    if (!notification) return res.status(404).json({ success: false, error: 'Not found' });

    // Ownership check
    const userId = req.userId;
    const resolved = await resolveUserIdentifiers(userId);
    if (!resolved.candidates.includes(String(notification.recipientId))) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    notification.read = true;
    await notification.save();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Alias for mark as read (some clients use PATCH)
router.patch('/:notificationId/read', async (req, res, next) => {
  try {
    await Notification.findByIdAndUpdate(req.params.notificationId, { read: true });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Notification routes are now focused on individual notification management.
// User-specific notification listings and token management have been moved to routes/users.js.


// Send push notification directly (ADMIN ONLY)
router.post('/send-push', verifyToken, async (req, res, next) => {
  try {
    const adminId = req.userId;
    const User = mongoose.model('User');
    const adminUser = await User.findById(adminId);
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden: Admin only' });
    }
    const { userId, title, body, data } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({
        success: false,
        error: 'userId, title, and body are required'
      });
    }

    // Get user's push token
    const resolved = await resolveUserIdentifiers(userId);
    const user = await User.findOne({ 
      $or: [
        { _id: { $in: resolved.candidates.filter(c => mongoose.Types.ObjectId.isValid(c)) } },
        { firebaseUid: { $in: resolved.candidates } },
        { uid: { $in: resolved.candidates } }
      ]
    });

    if (!user || !user.pushToken) {
      return res.status(404).json({
        success: false,
        error: 'User not found or no push token registered'
      });
    }

    const result = await sendPushNotification(user.pushToken, title, body, data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Trigger notification for events (Requires Auth)
router.post('/trigger', verifyToken, async (req, res, next) => {
  try {
    // Only allow users to trigger notifications for actions THEY performed
    const { type, recipientId, senderId, data = {} } = req.body;
    const authenticatedUserId = req.userId;

    const senderResolved = await resolveUserIdentifiers(senderId);
    const authResolved = await resolveUserIdentifiers(authenticatedUserId);
    const isSelf = senderResolved.candidates.some(c => authResolved.candidates.map(String).includes(String(c)));

    if (!isSelf) {
       return res.status(403).json({ success: false, error: 'Forbidden: Cannot trigger as someone else' });
    }

    if (!type || !recipientId || !senderId) {
      return res.status(400).json({
        success: false,
        error: 'type, recipientId, and senderId are required'
      });
    }

    // Resolve users to handle all ID variants
    const [recipientRes, senderRes] = await Promise.all([
      resolveUserIdentifiers(recipientId),
      resolveUserIdentifiers(senderId)
    ]);

    // Get recipient and sender info
    const [recipient, sender] = await Promise.all([
      User.findOne({ 
        $or: [
          { _id: { $in: recipientRes.candidates.filter(c => mongoose.Types.ObjectId.isValid(c)) } },
          { firebaseUid: { $in: recipientRes.candidates } },
          { uid: { $in: recipientRes.candidates } }
        ]
      }),
      User.findOne({ 
        $or: [
          { _id: { $in: senderRes.candidates.filter(c => mongoose.Types.ObjectId.isValid(c)) } },
          { firebaseUid: { $in: senderRes.candidates } },
          { uid: { $in: senderRes.candidates } }
        ]
      })
    ]);

    if (!recipient) {
      return res.status(404).json({ success: false, error: 'Recipient not found' });
    }

    if (!sender) {
      return res.status(404).json({ success: false, error: 'Sender not found' });
    }

    const senderName = sender.displayName || sender.name || 'Someone';
    const senderAvatar = sender.avatar || sender.photoURL || sender.profilePicture;

    // Save notification to database
    let message;
    switch (type) {
      case 'like':
        message = `${senderName} liked your post`;
        break;
      case 'comment':
        message = `${senderName} commented: ${data.comment || ''}`.substring(0, 100);
        break;
      case 'follow':
        message = `${senderName} started following you`;
        break;
      case 'message':
        message = data.message || 'New message';
        break;
      case 'story':
        message = `${senderName} posted a new story`;
        break;
      case 'live':
        message = `${senderName} is live!`;
        break;
      case 'mention':
        message = `${senderName} mentioned you`;
        break;
      default:
        message = `${senderName} interacted with you`;
    }

    const notification = new Notification({
      recipientId: recipientRes.canonicalId,
      senderId: senderRes.canonicalId,
      type,
      message,
      senderName,
      senderAvatar,
    });
    await notification.save();

    // Send push notification if user has token
    let pushResult = { success: false, message: 'No push token' };
    if (recipient.pushToken) {
      pushResult = await sendEventNotification({
        type,
        recipientToken: recipient.pushToken,
        senderName,
        data
      });
    }

    res.json({
      success: true,
      notificationId: notification._id,
      pushSent: pushResult.success,
      pushResult
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
