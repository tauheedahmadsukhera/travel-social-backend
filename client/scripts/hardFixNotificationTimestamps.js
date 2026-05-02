// Delete and reset createdAt as Firestore Timestamp for all notifications
const admin = require('firebase-admin');
const { Timestamp, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function hardFixNotificationTimestamps() {
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
      if (!notif.createdAt) {
        newTimestamp = Timestamp.now();
      }
      if (newTimestamp) {
        // First delete the old field
        await notifDoc.ref.update({ createdAt: FieldValue.delete() });
        // Then set it as Timestamp
        await notifDoc.ref.update({ createdAt: newTimestamp });
        console.log(`Hard fixed notification ${notifDoc.id} for user ${userDoc.id}`);
      }
    }
  }
  console.log('All notifications hard fixed!');
}

hardFixNotificationTimestamps();
