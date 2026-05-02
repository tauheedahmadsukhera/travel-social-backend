// Delete all documents in top-level notifications collection
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function deleteTopLevelNotifications() {
  const notifSnap = await db.collection('notifications').get();
  for (const notifDoc of notifSnap.docs) {
    await notifDoc.ref.delete();
    console.log(`Deleted top-level notification ${notifDoc.id}`);
  }
  console.log('All top-level notifications deleted!');
}

deleteTopLevelNotifications();
