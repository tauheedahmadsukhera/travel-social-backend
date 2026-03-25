// Test post creation directly with Firebase Admin
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const serviceAccount = require('../serviceAccountKey.json');
initializeApp({ 
  credential: cert(serviceAccount), 
  storageBucket: 'travel-app-3da72.appspot.com' 
});

const db = getFirestore();

async function testPostCreation() {
  console.log('🧪 Testing post creation...\n');
  
  try {
    // Get first user
    const usersSnapshot = await db.collection('users').limit(1).get();
    
    if (usersSnapshot.empty) {
      console.error('❌ No users found in database!');
      console.log('   Please create a user first through the app.');
      process.exit(1);
    }
    
    const userDoc = usersSnapshot.docs[0];
    const userData = userDoc.data();
    
    console.log('👤 Using test user:', {
      uid: userData.uid,
      email: userData.email,
      displayName: userData.displayName
    });
    
    // Create test post
    console.log('\n📝 Creating test post...');
    
    const postData = {
      userId: userData.uid,
      userName: userData.displayName || userData.name || 'Test User',
      userAvatar: userData.avatar || userData.photoURL || '',
      caption: 'Test post created from script',
      imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb',
      imageUrls: ['https://images.unsplash.com/photo-1506744038136-46273834b3fb'],
      mediaType: 'image',
      location: 'Test Location',
      locationName: 'Test Location',
      category: 'Travel',
      likes: [],
      likesCount: 0,
      commentsCount: 0,
      createdAt: FieldValue.serverTimestamp()
    };
    
    console.log('   Post data:', JSON.stringify(postData, null, 2));
    
    const postRef = await db.collection('posts').add(postData);
    console.log('   ✅ Post created with ID:', postRef.id);
    
    // Update user's post count
    console.log('\n📊 Updating user post count...');
    await db.collection('users').doc(userData.uid).update({
      postsCount: FieldValue.increment(1)
    });
    console.log('   ✅ User post count updated');
    
    // Verify post exists
    console.log('\n🔍 Verifying post in database...');
    const postDoc = await postRef.get();
    
    if (postDoc.exists) {
      console.log('   ✅ Post verified in database!');
      console.log('   Post data:', postDoc.data());
    } else {
      console.log('   ❌ Post not found in database!');
    }
    
    // Check total posts
    console.log('\n📊 Checking total posts...');
    const allPosts = await db.collection('posts').get();
    console.log(`   Total posts in database: ${allPosts.size}`);
    
    console.log('\n✅ Test completed successfully!\n');
    console.log('📝 Summary:');
    console.log(`   - Test post ID: ${postRef.id}`);
    console.log(`   - Total posts: ${allPosts.size}`);
    console.log(`   - User: ${userData.email}`);
    
    console.log('\n💡 Now try creating a post from the app and check if it appears in Firebase Console.');
    
  } catch (error) {
    console.error('\n❌ Error during test:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
  }
  
  process.exit(0);
}

testPostCreation();

