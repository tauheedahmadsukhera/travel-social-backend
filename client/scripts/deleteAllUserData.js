// This script will delete all user data, posts, likes, messages, and storage except for default user images and category images.
// Run this with admin privileges and proper Firebase credentials.

require('./ensureSafeExecution');

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

const serviceAccount = require('../serviceAccountKey.json');
initializeApp({ credential: cert(serviceAccount), storageBucket: 'travel-app-3da72.appspot.com' });
const db = getFirestore();
const bucket = getStorage().bucket();

async function deleteCollection(collName) {
  const snapshot = await db.collection(collName).get();
  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  console.log(`Deleted all documents from ${collName}`);
}

async function deleteUserData() {
  // Delete all users except default
  const users = await db.collection('users').get();
  for (const doc of users.docs) {
    const data = doc.data();
    if (!data.avatar || !data.avatar.includes('default-pic')) {
      await doc.ref.delete();
    }
  }
  console.log('Deleted all user documents except default');
}

async function deletePostsLikesMessages() {
  await deleteCollection('posts');
  await deleteCollection('likes');
  await deleteCollection('messages');
  await deleteCollection('categories'); // Only if you want to clear categories
  console.log('Deleted posts, likes, messages, categories');
}

async function deleteStorageFiles() {
  // List all files in storage
  const [files] = await bucket.getFiles();
  for (const file of files) {
    if (!file.name.includes('default-pic') && !file.name.includes('category')) {
      await file.delete();
      console.log(`Deleted storage file: ${file.name}`);
    }
  }
  console.log('Deleted all storage files except default and category images');
}

async function main() {
  await deleteUserData();
  await deletePostsLikesMessages();
  await deleteStorageFiles();
  console.log('All data deleted except default user and category images.');
}

main().catch(console.error);
