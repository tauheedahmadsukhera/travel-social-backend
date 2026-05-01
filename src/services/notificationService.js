const mongoose = require('mongoose');
const { Expo } = require('expo-server-sdk');
const expo = new Expo();

async function sendExpoPushToUser(recipientId, message) {
  try {
    if (!recipientId) return { success: false, error: 'missing recipientId' };
    const User = mongoose.model('User');

    const rid = String(recipientId);
    const query = {
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(rid) ? new mongoose.Types.ObjectId(rid) : null },
        { firebaseUid: rid },
        { uid: rid },
      ],
    };
    const user = await User.findOne(query);
    const pushToken = user?.pushToken;
    if (!pushToken || typeof pushToken !== 'string') return { success: false, error: 'no pushToken' };
    if (!Expo.isExpoPushToken(pushToken)) return { success: false, error: 'invalid Expo pushToken' };

    const msg = {
      to: pushToken,
      sound: 'default',
      priority: 'high',
      ...message,
    };

    const chunks = expo.chunkPushNotifications([msg]);
    for (const chunk of chunks) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await expo.sendPushNotificationsAsync(chunk);
      } catch (e) {
        console.warn('[push] Expo send error:', e?.message || e);
      }
    }
    return { success: true };
  } catch (e) {
    console.warn('[push] sendExpoPushToUser failed:', e?.message || e);
    return { success: false, error: e?.message || String(e) };
  }
}

module.exports = {
  sendExpoPushToUser
};
