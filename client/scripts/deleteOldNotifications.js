// deleteOldNotifications.js
// Deletes all notifications for all users that do NOT have a postId or commentId field

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function deleteOldNotifications() {
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    const notifSnap = await db.collection('users').doc(userId).collection('notifications').get();
    for (const notifDoc of notifSnap.docs) {
      const data = notifDoc.data();
      // If notification is missing postId/commentId for like/comment types, delete it
      if ((data.type === 'like' || data.type === 'comment') && (!data.postId || data.postId === undefined)) {
        console.log(`Deleting notification ${notifDoc.id} for user ${userId} (type: ${data.type})`);
        await notifDoc.ref.delete();
      }
    }
  }
  console.log('Old notifications deleted.');
}

deleteOldNotifications();
