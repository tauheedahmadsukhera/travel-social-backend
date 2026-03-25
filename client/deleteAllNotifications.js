// Delete all notifications for all users
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function deleteAllNotifications() {
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const notifSnap = await db.collection('users').doc(userDoc.id).collection('notifications').get();
    for (const notifDoc of notifSnap.docs) {
      await notifDoc.ref.delete();
      console.log(`Deleted notification ${notifDoc.id} for user ${userDoc.id}`);
    }
  }
  console.log('All notifications deleted for all users!');
}

deleteAllNotifications();
