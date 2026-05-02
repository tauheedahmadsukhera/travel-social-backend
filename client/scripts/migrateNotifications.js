// Migrate notifications from top-level collection to user subcollections
// Usage: node migrateNotifications.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id // Uses project_id from key file
});

const db = getFirestore();

async function migrateNotifications() {
  const notificationsRef = db.collection('notifications');
  const snapshot = await notificationsRef.get();
  console.log(`Found ${snapshot.size} notifications to migrate.`);

  let migrated = 0;
  const { Timestamp } = require('firebase-admin/firestore');
  for (const doc of snapshot.docs) {
    const notif = doc.data();
    const recipientId = notif.recipientId;
    if (!recipientId) continue;
    // Fix createdAt field
    let createdAt = notif.createdAt;
    if (!createdAt || typeof createdAt !== 'object' || !createdAt.seconds) {
      createdAt = Timestamp.now();
    } else if (createdAt._seconds) {
      // If using _seconds (from Firestore export), convert
      createdAt = new Timestamp(createdAt._seconds, createdAt._nanoseconds || 0);
    }
    notif.createdAt = createdAt;
    const userNotifRef = db.collection('users').doc(recipientId).collection('notifications').doc(doc.id);
    await userNotifRef.set(notif);
    migrated++;
    // Optionally delete from top-level collection:
    // await doc.ref.delete();
  }
  console.log(`Migrated ${migrated} notifications.`);
}

migrateNotifications().catch(console.error);
