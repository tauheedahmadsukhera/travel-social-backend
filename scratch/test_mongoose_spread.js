require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

// Auto-register models
require('../src/models/User');
require('../src/models/Post');
require('../src/models/Story');
require('../src/models/Highlight');

const Highlight = mongoose.model('Highlight');

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

mongoose.connect(mongoUri)
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas');
    
    // Find highlight without .lean()
    const highlight = await Highlight.findOne({ items: { $exists: true, $not: { $size: 0 } } });
    if (!highlight) {
      console.log('No highlights with items found.');
      process.exit(0);
    }
    
    console.log(`Testing with Mongoose Document: ${highlight._id}`);
    
    try {
      const items = Array.isArray(highlight.items) ? highlight.items : [];
      const normalized = items
        .map((it) => {
          if (!it) return null;
          if (typeof it === 'string') return null;
          const storyId = String(it.storyId || it.id || '').trim();
          if (!storyId) return null;
          
          // Mimic the spread operator on the Mongoose document/object
          const spreadObj = {
            ...it,
            id: storyId,
            _id: storyId,
            imageUrl: it.imageUrl || null,
            videoUrl: it.videoUrl || null,
            mediaUrl: it.mediaUrl || it.imageUrl || it.videoUrl || null,
            mediaType: it.mediaType || (it.videoUrl ? 'video' : 'image'),
          };
          return spreadObj;
        })
        .filter(Boolean);
        
      console.log('Attempting to serialize normalized items to JSON...');
      const jsonStr = JSON.stringify(normalized);
      console.log('✅ Serialization succeeded! String length:', jsonStr.length);
      console.log('First normalized item:', normalized[0]);
    } catch (err) {
      console.error('❌ Serialization failed:', err);
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Connection failed:', err);
    process.exit(1);
  });
