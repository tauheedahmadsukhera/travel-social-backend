const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'travel-app-3da72'
});

const db = admin.firestore();

async function updateAvatars() {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();

  if (snapshot.empty) {
    console.log('No users found.');
    return;
  }

  let updatedCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const avatar = data.avatar || '';
    if (avatar) {
      await doc.ref.update({ photoURL: avatar });
      updatedCount++;
      console.log(`Updated user ${doc.id}: photoURL set to avatar`);
    } else {
      console.log(`Skipped user ${doc.id}: no avatar field`);
    }
  }

  console.log(`Done. Updated ${updatedCount} users.`);
}

updateAvatars().catch(console.error);