const mongoose = require('mongoose');

async function archiveOldNotifications() {
  console.log('🧹 [Archive] Running notifications archive task...');
  try {
    const Notification = mongoose.model('Notification');
    const ArchivedNotification = mongoose.model('ArchivedNotification');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30); // 30 days ago

    // Find read notifications older than 30 days
    const oldNotifications = await Notification.find({
      createdAt: { $lt: cutoffDate },
      read: true
    }).lean();

    if (oldNotifications.length > 0) {
      const mapped = oldNotifications.map(n => ({
        ...n,
        archivedAt: new Date()
      }));

      // Insert into archive, ignore duplicates if retry occurs
      await ArchivedNotification.insertMany(mapped, { ordered: false }).catch(err => {
        if (!err.message.includes('E11000')) {
          throw err;
        }
      });

      // Delete from active collection
      const deleteIds = oldNotifications.map(n => n._id);
      const deleteResult = await Notification.deleteMany({ _id: { $in: deleteIds } });
      console.log(`✅ [Archive] Successfully archived & deleted ${deleteResult.deletedCount} notifications.`);
    } else {
      console.log('🧹 [Archive] No notifications to archive.');
    }
  } catch (err) {
    console.error('❌ [Archive] Notifications archiving failed:', err.message);
  }
}

function startArchiveScheduler() {
  // Run once on startup after 15 seconds, then every 24 hours
  setTimeout(() => {
    archiveOldNotifications();
  }, 15000);

  setInterval(() => {
    archiveOldNotifications();
  }, 24 * 60 * 60 * 1000); // 24 hours
}

module.exports = {
  archiveOldNotifications,
  startArchiveScheduler
};
