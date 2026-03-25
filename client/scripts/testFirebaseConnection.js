// Test Firebase connection and permissions
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../serviceAccountKey.json');
initializeApp({ 
  credential: cert(serviceAccount), 
  storageBucket: 'travel-app-3da72.appspot.com' 
});

const db = getFirestore();

async function testConnection() {
  console.log('🔍 Testing Firebase connection...\n');
  
  try {
    // Test 1: Check users collection
    console.log('1️⃣ Testing users collection...');
    const usersSnapshot = await db.collection('users').limit(1).get();
    console.log(`   ✅ Users collection accessible (${usersSnapshot.size} docs found)`);
    
    // Test 2: Check posts collection
    console.log('\n2️⃣ Testing posts collection...');
    const postsSnapshot = await db.collection('posts').limit(1).get();
    console.log(`   ✅ Posts collection accessible (${postsSnapshot.size} docs found)`);
    
    // Test 3: Check stories collection
    console.log('\n3️⃣ Testing stories collection...');
    const storiesSnapshot = await db.collection('stories').limit(1).get();
    console.log(`   ✅ Stories collection accessible (${storiesSnapshot.size} docs found)`);
    
    // Test 4: Try to write a test document
    console.log('\n4️⃣ Testing write permissions...');
    const testRef = db.collection('_test').doc('connection-test');
    await testRef.set({
      test: true,
      timestamp: new Date(),
      message: 'Connection test successful'
    });
    console.log('   ✅ Write permission successful');
    
    // Clean up test document
    await testRef.delete();
    console.log('   ✅ Test document cleaned up');
    
    // Test 5: Check if any user exists
    console.log('\n5️⃣ Checking user data...');
    const allUsers = await db.collection('users').get();
    console.log(`   📊 Total users in database: ${allUsers.size}`);
    
    if (allUsers.size > 0) {
      const firstUser = allUsers.docs[0];
      const userData = firstUser.data();
      console.log(`   👤 Sample user:`, {
        uid: userData.uid,
        email: userData.email,
        displayName: userData.displayName,
        hasAvatar: !!userData.avatar,
        hasPhotoURL: !!userData.photoURL
      });
    }
    
    // Test 6: Check posts
    console.log('\n6️⃣ Checking posts data...');
    const allPosts = await db.collection('posts').get();
    console.log(`   📊 Total posts in database: ${allPosts.size}`);
    
    // Test 7: Check stories
    console.log('\n7️⃣ Checking stories data...');
    const allStories = await db.collection('stories').get();
    console.log(`   📊 Total stories in database: ${allStories.size}`);
    
    console.log('\n✅ All tests passed! Firebase connection is working properly.\n');
    
  } catch (error) {
    console.error('\n❌ Error during testing:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code
    });
  }
  
  process.exit(0);
}

testConnection();

