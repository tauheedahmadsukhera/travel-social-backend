// Script to update 'createdAt' field to Firestore serverTimestamp for all posts and stories
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin').firestore;

// Load your service account key
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function updateCollectionCreatedAt(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  let updated = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    // If createdAt is missing or is a string, update to serverTimestamp
    if (!data.createdAt || typeof data.createdAt === 'string') {
      await doc.ref.update({ createdAt: FieldValue.serverTimestamp() });
      updated++;
      console.log(`[${collectionName}] Updated doc ${doc.id}`);
    }
  }
  console.log(`[${collectionName}] Total updated: ${updated}`);
}

(async () => {
  await updateCollectionCreatedAt('posts');
  await updateCollectionCreatedAt('stories');
  console.log('Update complete.');
  process.exit(0);
})();
