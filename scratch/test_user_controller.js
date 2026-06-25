require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

// Auto-register models
require('../src/models/User');
require('../src/models/Post');
require('../src/models/Story');
require('../src/models/Highlight');

const userController = require('../src/controllers/userController');

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

mongoose.connect(mongoUri)
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas');
    
    const req = {
      params: {
        uid: '6956afd36d2fa5db6bdb2909'
      }
    };
    
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        console.log('Response status:', this.statusCode || 200);
        console.log('Response data:', data);
        process.exit(0);
      }
    };
    
    await userController.getUserHighlights(req, res);
  })
  .catch(err => {
    console.error('❌ Connection failed:', err);
    process.exit(1);
  });
