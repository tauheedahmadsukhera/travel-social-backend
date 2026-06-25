const mongoose = require('mongoose');
const admin = require('firebase-admin');
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
    
    if (process.env.NODE_ENV !== 'production' || __DEV__) {
      console.log(`[push] Resolving token for ${rid}:`, {
        foundUser: !!user,
        hasToken: !!pushToken,
        tokenPrefix: pushToken ? pushToken.substring(0, 15) : 'none'
      });
    }

    if (!pushToken || typeof pushToken !== 'string') {
      console.warn(`[push] No pushToken for user ${rid}`);
      return { success: false, error: 'no pushToken' };
    }
    
    // Check if it's an Expo token
    if (Expo.isExpoPushToken(pushToken)) {
      const msg = {
        to: pushToken,
        sound: 'default',
        priority: 'high',
        ...message,
      };

      console.log(`[push] Sending via Expo to ${rid} (${pushToken.substring(0, 10)}...): ${message.title}`);

      const chunks = expo.chunkPushNotifications([msg]);
      for (const chunk of chunks) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const tickets = await expo.sendPushNotificationsAsync(chunk);
          console.log('[push] Expo tickets received:', tickets);
        } catch (e) {
          console.warn('[push] Expo send error:', e?.message || e);
        }
      }
      return { success: true };
    } else {
      // Try sending via FCM (Firebase Cloud Messaging)
      console.log(`[push] Sending via FCM to ${rid} (${pushToken.substring(0, 10)}...): ${message.title}`);
      
      try {
        const fcmMessage = {
          token: pushToken,
          notification: {
            title: message.title,
            body: message.body,
          },
          data: message.data ? Object.keys(message.data).reduce((acc, key) => {
            acc[key] = String(message.data[key]);
            return acc;
          }, {}) : {},
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
              },
            },
          },
        };

        const response = await admin.messaging().send(fcmMessage);
        console.log('[push] FCM message sent successfully:', response);
        return { success: true };
      } catch (fcmError) {
        console.warn('[push] FCM send error:', fcmError?.message || fcmError);
        return { success: false, error: `FCM error: ${fcmError.message}` };
      }
    }
  } catch (e) {
    console.warn('[push] push service failed:', e?.message || e);
    return { success: false, error: e?.message || String(e) };
  }
}

module.exports = {
  sendExpoPushToUser
};

