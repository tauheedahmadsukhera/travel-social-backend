const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

require('../src/models/User');
require('../src/models/Story');
require('../src/models/Highlight');

const User = mongoose.model('User');
const Highlight = mongoose.model('Highlight');

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

async function main() {
  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const user = await User.findOne();
    if (!user) {
      console.error('No user found in DB');
      process.exit(1);
    }

    const token = jwt.sign(
      { userId: String(user._id), email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const api = axios.create({
      baseURL: 'http://localhost:5002/api',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const hl = await Highlight.findOne({ userId: String(user._id) });
    if (!hl) {
      console.log('No highlight to test');
      process.exit(0);
    }

    console.log('\n--- Test: Add "story-0" to Highlight ---');
    try {
      const res = await api.post(`/highlights/${hl._id}/stories`, {
        storyId: 'story-0',
        storySnapshot: {
          storyId: 'story-0',
          imageUrl: 'https://example.com/story-0.jpg'
        }
      });
      console.log('Result status:', res.status);
      console.log('Result data:', res.data);
    } catch (err) {
      console.error('Test failed:', err.response ? err.response.data : err.message);
    }

  } catch (err) {
    console.error('Main error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
