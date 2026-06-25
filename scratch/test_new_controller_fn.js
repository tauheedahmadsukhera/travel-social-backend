require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

// Auto-register models
require('../src/models/User');
require('../src/models/Post');
require('../src/models/Story');
require('../src/models/Highlight');

const highlightController = require('../src/controllers/highlightController');

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

mongoose.connect(mongoUri)
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas');
    
    // Test with all 3 highlight IDs
    const ids = [
      '69d41546a882d52722d90dfd',
      '69df4d06b8c5b9bf2da39446',
      '69df4f1eb8c5b9bf2da39767'
    ];
    
    for (const id of ids) {
      console.log(`\nTesting getHighlightStories for ID: ${id}`);
      
      const req = {
        params: { id }
      };
      
      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          console.log(`Response Status: ${this.statusCode}`);
          if (payload.success) {
            console.log(`✅ Success! Returned ${payload.data?.length || 0} stories.`);
            if (payload.data?.length > 0) {
              console.log('First story ID:', payload.data[0].id);
              console.log('First story mediaUrl:', payload.data[0].mediaUrl);
            }
          } else {
            console.error('❌ Failed:', payload.error);
          }
        }
      };
      
      try {
        await highlightController.getHighlightStories(req, res);
      } catch (err) {
        console.error(`❌ CRITICAL: Unhandled crash for ID ${id}:`, err);
      }
    }
    
    // Also test invalid ID format
    console.log(`\nTesting getHighlightStories with invalid ID: "unknown"`);
    const invalidReq = { params: { id: 'unknown' } };
    const invalidRes = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        console.log(`Response Status: ${this.statusCode}`);
        console.log('Response payload:', payload);
        process.exit(0);
      }
    };
    
    await highlightController.getHighlightStories(invalidReq, invalidRes);
  })
  .catch(err => {
    console.error('❌ Connection failed:', err);
    process.exit(1);
  });
