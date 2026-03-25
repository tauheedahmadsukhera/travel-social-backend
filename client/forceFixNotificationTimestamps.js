// Force update all notifications: set createdAt to Firestore Timestamp if it's a string or missing
const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function fixAllNotifications() {
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const notifSnap = await db.collection('users').doc(userDoc.id).collection('notifications').get();
    for (const notifDoc of notifSnap.docs) {
      const notif = notifDoc.data();
      let newTimestamp = null;
      if (notif.createdAt && typeof notif.createdAt === 'string') {
        const date = new Date(notif.createdAt);
        if (!isNaN(date.getTime())) {
          newTimestamp = Timestamp.fromDate(date);
        }
      }
      // If createdAt is missing, set to now
      if (!notif.createdAt) {
        newTimestamp = Timestamp.now();
      }
      if (newTimestamp) {
        await notifDoc.ref.update({ createdAt: newTimestamp });
        console.log(`Updated notification ${notifDoc.id} for user ${userDoc.id}`);
      }
    }
  }
  console.log('All notifications checked and updated!');
}

fixAllNotifications();
