// Script to add regions to Firebase Firestore
// Run with: node scripts/addRegions.js

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Regions to add - you can update these images with your own Firebase Storage URLs
const regions = [
  { 
    id: 'world', 
    name: 'World', 
    image: 'https://firebasestorage.googleapis.com/v0/b/travel-app-3da72.firebasestorage.app/o/regions%2Fworld.png?alt=media',
    order: 1 
  },
  { 
    id: 'us', 
    name: 'United States', 
    image: 'https://firebasestorage.googleapis.com/v0/b/travel-app-3da72.firebasestorage.app/o/regions%2Fusa.png?alt=media',
    order: 2 
  },
  { 
    id: 'eastasia', 
    name: 'East Asia', 
    image: 'https://firebasestorage.googleapis.com/v0/b/travel-app-3da72.firebasestorage.app/o/regions%2Feastasia.png?alt=media',
    order: 3 
  },
  { 
    id: 'me', 
    name: 'Middle East', 
    image: 'https://firebasestorage.googleapis.com/v0/b/travel-app-3da72.firebasestorage.app/o/regions%2Fmiddleeast.png?alt=media',
    order: 4 
  },
  { 
    id: 'sea', 
    name: 'Southeast Asia', 
    image: 'https://firebasestorage.googleapis.com/v0/b/travel-app-3da72.firebasestorage.app/o/regions%2Fsoutheastasia.png?alt=media',
    order: 5 
  },
  { 
    id: 'japan', 
    name: 'Japan', 
    image: 'https://firebasestorage.googleapis.com/v0/b/travel-app-3da72.firebasestorage.app/o/regions%2Fjapan.png?alt=media',
    order: 6 
  },
];

async function addRegions() {
  console.log('Adding regions to Firestore...');
  
  for (const region of regions) {
    try {
      await db.collection('regions').doc(region.id).set({
        name: region.name,
        image: region.image,
        order: region.order,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`✓ Added region: ${region.name}`);
    } catch (error) {
      console.error(`✗ Error adding region ${region.name}:`, error);
    }
  }
  
  console.log('\nDone! Regions added to Firestore.');
  console.log('\nNOTE: Upload map images to Firebase Storage at:');
  console.log('  regions/world.png');
  console.log('  regions/usa.png');
  console.log('  regions/eastasia.png');
  console.log('  regions/middleeast.png');
  console.log('  regions/southeastasia.png');
  console.log('  regions/japan.png');
  console.log('\nThen update the URLs in Firestore if needed.');
  
  process.exit(0);
}

addRegions();
