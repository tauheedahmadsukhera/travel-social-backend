// This script initializes the database with default categories and required collections
// Run this after clearing the database to restore default data

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../serviceAccountKey.json');
initializeApp({ 
  credential: cert(serviceAccount), 
  storageBucket: 'travel-app-3da72.appspot.com' 
});

const db = getFirestore();

// Default categories
const DEFAULT_CATEGORIES = [
  { name: 'Travel', image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb' },
  { name: 'Food', image: 'https://images.unsplash.com/photo-1519864600265-abb23847ef2c' },
  { name: 'Adventure', image: 'https://images.unsplash.com/photo-1465101178521-c1a4c8a0f8f5' },
  { name: 'Nature', image: 'https://images.unsplash.com/photo-1465101046530-73398c7f28ca' },
  { name: 'Culture', image: 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b' },
  { name: 'Events', image: 'https://images.unsplash.com/photo-1519125323398-675f0ddb6308' },
  { name: 'Winter holidays', image: 'https://images.unsplash.com/photo-1519125323398-675f0ddb6308' },
  { name: 'Beach', image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e' },
  { name: 'City life', image: 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b' },
  { name: 'London', image: 'https://images.unsplash.com/photo-1465101046530-73398c7f28ca' },
  { name: 'Christmas', image: 'https://images.unsplash.com/photo-1519125323398-675f0ddb6308' },
  { name: 'Other', image: 'https://via.placeholder.com/40x40.png?text=Other' }
];

async function initializeCategories() {
  console.log('Initializing categories...');
  
  const categoriesRef = db.collection('categories');
  const snapshot = await categoriesRef.get();
  
  if (snapshot.empty) {
    console.log('No categories found. Creating default categories...');
    
    const batch = db.batch();
    DEFAULT_CATEGORIES.forEach(category => {
      const docRef = categoriesRef.doc(category.name);
      batch.set(docRef, category);
    });
    
    await batch.commit();
    console.log(`✅ Created ${DEFAULT_CATEGORIES.length} default categories`);
  } else {
    console.log(`✅ Categories already exist (${snapshot.size} categories found)`);
  }
}

async function ensureCollections() {
  console.log('Ensuring required collections exist...');
  
  const collections = [
    'users',
    'posts',
    'stories',
    'liveStreams',
    'categories',
    'notifications',
    'conversations',
    'messages'
  ];
  
  for (const collectionName of collections) {
    const collRef = db.collection(collectionName);
    const snapshot = await collRef.limit(1).get();
    
    if (snapshot.empty) {
      console.log(`⚠️  Collection '${collectionName}' is empty`);
    } else {
      console.log(`✅ Collection '${collectionName}' exists with data`);
    }
  }
}

async function main() {
  console.log('🚀 Starting database initialization...\n');
  
  try {
    await initializeCategories();
    console.log('');
    await ensureCollections();
    
    console.log('\n✅ Database initialization complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Create a new user account via the app');
    console.log('   2. User profile will be automatically created with default avatar');
    console.log('   3. Categories are now available for posts');
    console.log('   4. All collections are ready to use\n');
  } catch (error) {
    console.error('❌ Error during initialization:', error);
  }
  
  process.exit(0);
}

main();

