// Fix migrated notifications: convert string createdAt to Firestore Timestamp
const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function fixNotifications() {
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const notifSnap = await db.collection('users').doc(userDoc.id).collection('notifications').get();
    for (const notifDoc of notifSnap.docs) {
      const notif = notifDoc.data();
      if (notif.createdAt && typeof notif.createdAt === 'string') {
        // Try to parse the string to Date
        const date = new Date(notif.createdAt);
        if (!isNaN(date.getTime())) {
          await notifDoc.ref.update({ createdAt: Timestamp.fromDate(date) });
          console.log(`Fixed notification ${notifDoc.id} for user ${userDoc.id}`);
        } else {
          console.log(`Could not parse createdAt for notification ${notifDoc.id} (user ${userDoc.id})`);
        }
      }
    }
  }
  console.log('Done fixing notifications!');
}

fixNotifications();
