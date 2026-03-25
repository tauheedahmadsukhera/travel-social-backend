// Script to update old posts with userAvatar and locationName for instant feed display
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function updatePosts() {
  const snapshot = await db.collection('posts').get();
  let updated = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    let needsUpdate = false;
    let updateObj = {};
    // If userAvatar missing, fetch from users collection
    if (!data.userAvatar) {
      const userDoc = await db.collection('users').doc(data.userId).get();
      const user = userDoc.exists ? userDoc.data() : {};
      updateObj.userAvatar = user.avatar || user.photoURL || 'https://firebasestorage.googleapis.com/v0/b/travel-app-3da72.firebasestorage.app/o/default%2Fdefault-pic.jpg?alt=media&token=7177f487-a345-4e45-9a56-732f03dbf65d';
      needsUpdate = true;
    }
    // If locationName missing, use locationData.name or location
    if (!data.locationName) {
      updateObj.locationName = (data.locationData && data.locationData.name) || data.location || '';
      needsUpdate = true;
    }
    if (needsUpdate) {
      await doc.ref.update(updateObj);
      updated++;
      console.log(`Updated post ${doc.id}`);
    }
  }
  console.log(`Total posts updated: ${updated}`);
}

updatePosts().then(() => {
  console.log('Update complete.');
  process.exit(0);
});
