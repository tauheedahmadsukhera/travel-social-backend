const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { buildLocationKeysFromPayload } = require('../utils/postHelpers');

// Connect to MongoDB
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/travel-social';
console.log('Connecting to MongoDB...', mongoURI);

mongoose.connect(mongoURI)
  .then(async () => {
    console.log('Connected to MongoDB.');
    
    // Define a minimal Post schema for migration
    const postSchema = new mongoose.Schema({
      location: String,
      locationName: String,
      locationData: Object,
      locationKeys: [String]
    }, { strict: false });

    const Post = mongoose.model('Post', postSchema);

    const posts = await Post.find({});
    console.log(`Found ${posts.length} posts to check.`);

    let updatedCount = 0;

    for (const post of posts) {
      const oldKeys = post.locationKeys || [];
      const newKeys = buildLocationKeysFromPayload(
        post.location || post.locationName || '',
        post.locationData || {},
        []
      );

      // Check if keys actually changed
      if (JSON.stringify(oldKeys.sort()) !== JSON.stringify(newKeys.sort())) {
        post.locationKeys = newKeys;
        await post.save();
        updatedCount++;
        if (updatedCount % 10 === 0) console.log(`Updated ${updatedCount} posts...`);
      }
    }

    console.log(`Migration complete! Updated ${updatedCount} posts.`);
    process.exit(0);
  })
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
