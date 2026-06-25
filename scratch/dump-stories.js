const mongoose = require('mongoose');
require('dotenv').config();

const mongoUri = process.env.MONGO_URI;

mongoose.connect(mongoUri)
.then(async () => {
  console.log('✅ Connected successfully!');
  
  // Load Story model
  const Story = require('../src/models/Story');
  
  const stories = await Story.find().sort({ createdAt: -1 }).limit(10).lean();
  console.log('Found stories:', stories.length);
  for (const s of stories) {
    console.log('ID:', s._id);
    console.log('User:', s.userName);
    console.log('ExpiresAt:', s.expiresAt);
    console.log('postMetadata:', JSON.stringify(s.postMetadata, null, 2));
    console.log('-----------------------------------');
  }
  
  process.exit(0);
})
.catch(err => {
  console.error('❌ Connection failed:', err);
  process.exit(1);
});
