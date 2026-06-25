const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const { sendExpoPushToUser } = require('../src/services/notificationService');

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: 1, // Minimize retry spam
  enableOfflineQueue: false // Don't queue commands if offline
};

let redisAvailable = false;
let realNotificationQueue = null;
let notificationWorker = null;

/**
 * 10/10 Resilience:
 * We don't even TRY to initialize BullMQ if we're in a local environment
 * and Redis isn't explicitly requested or already running.
 * This prevents the annoying ECONNREFUSED spam.
 */

const redisClient = new Redis({
  ...connection,
  lazyConnect: true
});

// SILENCE: Add error listener before connecting to handle the "Unhandled error event"
redisClient.on('error', () => {});

// Try to connect once to see if it's there
console.log('🔍 Checking Redis availability for background jobs...');
redisClient.connect().then(() => {
  redisAvailable = true;
  console.log('✅ Redis connected - Background queues enabled');
  
  // Initialize BullMQ only after successful connection
  realNotificationQueue = new Queue('notifications', { connection });
  realNotificationQueue.on('error', () => {}); // Silence internal errors
  
  notificationWorker = new Worker('notifications', async job => {
    const { userId, title, body, data, senderId } = job.data;
    console.log(`[Queue] Processing background notification for ${userId}`);
    
    // 1. Save to Database for in-app history
    try {
      const mongoose = require('mongoose');
      const Notification = mongoose.model('Notification');
      const User = mongoose.model('User');

      let senderName = 'Someone';
      let senderAvatar = null;
      if (senderId) {
        const sender = await User.findOne({
          $or: [
            { _id: mongoose.Types.ObjectId.isValid(senderId) ? new mongoose.Types.ObjectId(senderId) : null },
            { firebaseUid: senderId },
            { uid: senderId }
          ]
        }).select('displayName name avatar photoURL profilePicture').lean();
        
        if (sender) {
          senderName = sender.displayName || sender.name || 'Someone';
          senderAvatar = sender.avatar || sender.photoURL || sender.profilePicture || null;
        }
      }

      const notification = new Notification({
        recipientId: userId,
        senderId: senderId || null,
        senderName,
        senderAvatar,
        type: data?.type || 'generic',
        message: body,
        data: data || {},
        postId: data?.postId || null,
        storyId: data?.storyId || null,
        read: false,
        createdAt: new Date()
      });
      await notification.save();
    } catch (dbErr) {
      console.warn('[Queue] Failed to save notification to DB:', dbErr.message);
    }

    // 2. Send Push Alert
    return await sendExpoPushToUser(userId, { title, body, data });
  }, { connection });
  
  notificationWorker.on('error', () => {}); // Silence internal errors
  notificationWorker.on('failed', (job, err) => {
    console.warn(`[Queue] Job ${job?.id} failed: ${err.message}`);
  });
}).catch(err => {
  // Silence connection errors - we'll just stay in inline mode
  redisAvailable = false;
  redisClient.disconnect();
});

const notificationQueue = {
  add: async (type, payload) => {
    if (redisAvailable && realNotificationQueue) {
      try {
        return await realNotificationQueue.add(type, payload);
      } catch (err) {
        return await processInline(payload);
      }
    } else {
      return await processInline(payload);
    }
  }
};

async function processInline(payload) {
  const { userId, title, body, data, senderId } = payload;
  
  // 1. Save to Database for in-app history (Fire and forget)
  (async () => {
    try {
      const mongoose = require('mongoose');
      const Notification = mongoose.model('Notification');
      const User = mongoose.model('User');
      
      // Resolve real sender details for the database record
      let senderName = 'Someone';
      let senderAvatar = null;
      if (senderId) {
        const sender = await User.findOne({
          $or: [
            { _id: mongoose.Types.ObjectId.isValid(senderId) ? new mongoose.Types.ObjectId(senderId) : null },
            { firebaseUid: senderId },
            { uid: senderId }
          ]
        }).select('displayName name avatar photoURL profilePicture').lean();
        
        if (sender) {
          senderName = sender.displayName || sender.name || 'Someone';
          senderAvatar = sender.avatar || sender.photoURL || sender.profilePicture || null;
        }
      }

      const notification = new Notification({
        recipientId: userId,
        senderId: senderId || null,
        senderName,
        senderAvatar,
        type: data?.type || 'generic',
        message: body,
        data: data || {},
        postId: data?.postId || null,
        storyId: data?.storyId || null,
        read: false,
        createdAt: new Date()
      });
      await notification.save();
      console.log(`[Queue] Saved DB notification for ${userId} from ${senderName}`);
    } catch (dbErr) {
      console.warn('[Queue] Failed to save notification to DB:', dbErr.message);
    }
  })();

  // 2. Send Push Alert (Fire and forget)
  sendExpoPushToUser(userId, { title, body, data })
    .catch(err => {
      // Only log if it's a real logic error, not just a missing token
      if (err.message && !err.message.includes('no pushToken')) {
        console.warn('[Inline-Notification] Warning:', err.message);
      }
    });
  return { status: 'processed_inline' };
}

module.exports = {
  notificationQueue
};
