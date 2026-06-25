const mongoose = require('mongoose');
require('dotenv').config();

const mongoUri = process.env.MONGO_URI;

mongoose.connect(mongoUri)
.then(async () => {
  console.log('✅ Connected successfully!');
  
  const Story = require('../src/models/Story');
  
  // Create a test story
  const testStoryData = {
    userId: 'test_user_123',
    userName: 'Test User',
    userAvatar: 'https://example.com/avatar.jpg',
    image: 'https://example.com/image.jpg',
    caption: 'Test Story Caption',
    postMetadata: {
      textOverlays: [
        {
          id: '1',
          text: 'Hello World',
          color: '#ffffff',
          fontStyle: 'classic',
          x: 0.5,
          y: 0.5
        }
      ]
    },
    isPostShare: false,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
  };
  
  const newStory = new Story(testStoryData);
  const saved = await newStory.save();
  console.log('Saved Story ID:', saved._id);
  console.log('Saved postMetadata:', JSON.stringify(saved.postMetadata, null, 2));
  
  // Retrieve it
  const retrieved = await Story.findById(saved._id).lean();
  console.log('Retrieved postMetadata:', JSON.stringify(retrieved.postMetadata, null, 2));
  
  // Clean up
  await Story.findByIdAndDelete(saved._id);
  console.log('Test story cleaned up.');
  
  process.exit(0);
})
.catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
