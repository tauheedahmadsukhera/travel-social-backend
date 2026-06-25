require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

// Auto-register models
require('../src/models/User');
require('../src/models/Post');
require('../src/models/Story');
require('../src/models/Highlight');

const Highlight = mongoose.model('Highlight');
const Story = mongoose.model('Story');

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

mongoose.connect(mongoUri)
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas');
    
    // Find all highlights
    const highlights = await Highlight.find().limit(10).lean();
    console.log(`Found ${highlights.length} highlights.`);
    
    if (highlights.length === 0) {
      console.log('No highlights found in the database. Please create one to test.');
      process.exit(0);
    }
    
    for (const highlight of highlights) {
      console.log(`\n--------------------------------------------`);
      console.log(`Testing Highlight: "${highlight.title}" (ID: ${highlight._id})`);
      console.log(`userId: ${highlight.userId}`);
      console.log(`stories length: ${highlight.stories?.length || 0}`);
      console.log(`items length: ${highlight.items?.length || 0}`);
      console.log(`stories:`, highlight.stories);
      console.log(`items:`, highlight.items);
      
      try {
        // Run getHighlightStories logic
        const items = Array.isArray(highlight.items) ? highlight.items : [];
        const hasSnapshots = items.some((it) => it && typeof it === 'object' && (it.mediaUrl || it.imageUrl || it.videoUrl));
        
        console.log(`hasSnapshots: ${hasSnapshots}`);
        
        if (hasSnapshots) {
          const normalized = items
            .map((it) => {
              if (!it) return null;
              if (typeof it === 'string') return null;
              const storyId = String(it.storyId || it.id || '').trim();
              if (!storyId) return null;
              return {
                ...it,
                id: storyId,
                _id: storyId,
                imageUrl: it.imageUrl || null,
                videoUrl: it.videoUrl || null,
                mediaUrl: it.mediaUrl || it.imageUrl || it.videoUrl || null,
                mediaType: it.mediaType || (it.videoUrl ? 'video' : 'image'),
              };
            })
            .filter(Boolean);
          console.log(`✅ Normalized snapshots count: ${normalized.length}`);
        } else {
          const storyIds = highlight.stories || [];
          console.log(`Querying Story model for IDs:`, storyIds);
          
          if (storyIds.length > 0) {
            const validIds = storyIds.filter(sid => mongoose.Types.ObjectId.isValid(sid));
            console.log(`Valid ObjectIds:`, validIds);
            
            const storiesArray = await Story.find({
              _id: { $in: validIds }
            }).lean();
            
            console.log(`Fetched stories array length: ${storiesArray.length}`);
            
            const enrichedStories = storiesArray.map(story => ({
              ...story,
              id: String(story._id),
              imageUrl: story.image || null,
              videoUrl: story.video || null,
              mediaUrl: story.image || story.video || null,
              mediaType: story.video ? 'video' : 'image',
            }));
            
            enrichedStories.sort((a, b) => {
              const idxA = storyIds.indexOf(a.id);
              const idxB = storyIds.indexOf(b.id);
              return idxA - idxB;
            });
            
            console.log(`✅ Success! Enriched stories count: ${enrichedStories.length}`);
          } else {
            console.log(`No story IDs, empty result returned.`);
          }
        }
      } catch (err) {
        console.error(`❌ ERROR for highlight ${highlight._id}:`, err);
      }
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Connection failed:', err);
    process.exit(1);
  });
