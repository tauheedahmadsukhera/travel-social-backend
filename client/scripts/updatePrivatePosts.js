/**
 * One-time script to update all posts for a specific user with privacy settings
 * Run this with: node scripts/updatePrivatePosts.js <userId>
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function updateUserPosts(userId) {
  try {
    console.log(`🔄 Updating posts for user: ${userId}`);
    
    // Get user profile to check if private
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      console.error('❌ User not found:', userId);
      return;
    }
    
    const userData = userDoc.data();
    const isPrivate = userData.isPrivate || false;
    const followers = userData.followers || [];
    
    console.log(`📊 User isPrivate: ${isPrivate}`);
    console.log(`📊 User followers count: ${followers.length}`);
    
    // Get all posts for this user
    const postsQuery = await db.collection('posts')
      .where('userId', '==', userId)
      .get();
    
    console.log(`📝 Found ${postsQuery.size} posts to update`);
    
    // Update each post
    const batch = db.batch();
    let updateCount = 0;
    
    postsQuery.docs.forEach(doc => {
      const postRef = db.collection('posts').doc(doc.id);
      batch.update(postRef, {
        isPrivate: isPrivate,
        allowedFollowers: isPrivate ? followers : []
      });
      updateCount++;
    });
    
    // Commit batch update
    await batch.commit();
    
    console.log(`✅ Successfully updated ${updateCount} posts!`);
    console.log(`🔒 isPrivate: ${isPrivate}`);
    console.log(`👥 allowedFollowers: ${isPrivate ? followers.length : 0} users`);
    
  } catch (error) {
    console.error('❌ Error updating posts:', error);
  }
}

// Get userId from command line argument
const userId = process.argv[2];

if (!userId) {
  console.error('❌ Please provide userId as argument');
  console.log('Usage: node scripts/updatePrivatePosts.js <userId>');
  process.exit(1);
}

updateUserPosts(userId).then(() => {
  console.log('✅ Done!');
  process.exit(0);
}).catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
