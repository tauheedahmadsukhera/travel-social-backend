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

    // 1. Find a user
    const user = await User.findOne();
    if (!user) {
      console.error('No user found in DB');
      process.exit(1);
    }
    console.log(`Using user: ${user.email} (ID: ${user._id})`);

    // 2. Generate JWT
    const token = jwt.sign(
      { userId: String(user._id), email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    console.log('Generated token:', token);

    const api = axios.create({
      baseURL: 'http://localhost:5002/api',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    // Test 1: Create highlight with title and stories
    console.log('\n--- Test 1: Create Highlight with standard payload ---');
    try {
      const res = await api.post('/highlights', {
        userId: String(user._id),
        title: 'Test Create ' + Date.now(),
        coverImage: 'https://example.com/cover.jpg',
        stories: ['65f1a234567890abcdef0123'],
        storyIds: ['65f1a234567890abcdef0123']
      });
      console.log('Result 1 status:', res.status);
      console.log('Result 1 data:', res.data);
    } catch (err) {
      console.error('Test 1 failed:', err.response ? err.response.data : err.message);
    }

    // Test 2: Create highlight with empty storyId
    console.log('\n--- Test 2: Create Highlight with empty storyId ---');
    try {
      const res = await api.post('/highlights', {
        userId: String(user._id),
        title: 'Test Create ' + Date.now(),
        coverImage: 'https://example.com/cover.jpg',
        stories: [''],
        storyIds: ['']
      });
      console.log('Result 2 status:', res.status);
      console.log('Result 2 data:', res.data);
    } catch (err) {
      console.error('Test 2 failed:', err.response ? err.response.data : err.message);
    }

    // Test 3: Add story to highlight with valid payload
    console.log('\n--- Test 3: Add Story to Highlight with standard payload ---');
    // Find a highlight first
    const hl = await Highlight.findOne({ userId: String(user._id) });
    if (!hl) {
      console.log('No highlight to test adding story');
    } else {
      try {
        const res = await api.post(`/highlights/${hl._id}/stories`, {
          storyId: '65f1a234567890abcdef0124',
          storySnapshot: {
            storyId: '65f1a234567890abcdef0124',
            imageUrl: 'https://example.com/story.jpg'
          }
        });
        console.log('Result 3 status:', res.status);
        console.log('Result 3 data:', res.data);
      } catch (err) {
        console.error('Test 3 failed:', err.response ? err.response.data : err.message);
      }

      // Test 4: Add story to highlight with empty storyId
      console.log('\n--- Test 4: Add Story to Highlight with empty storyId ---');
      try {
        const res = await api.post(`/highlights/${hl._id}/stories`, {
          storyId: '',
          storySnapshot: {
            storyId: '',
            imageUrl: 'https://example.com/story.jpg'
          }
        });
        console.log('Result 4 status:', res.status);
        console.log('Result 4 data:', res.data);
      } catch (err) {
        console.error('Test 4 failed:', err.response ? err.response.data : err.message);
      }

      // Test 5: Add story to highlight with missing fields
      console.log('\n--- Test 5: Add Story to Highlight with missing storyId in request but populated in snapshot ---');
      try {
        const res = await api.post(`/highlights/${hl._id}/stories`, {
          storySnapshot: {
            storyId: '65f1a234567890abcdef0125',
            imageUrl: 'https://example.com/story.jpg'
          }
        });
        console.log('Result 5 status:', res.status);
        console.log('Result 5 data:', res.data);
      } catch (err) {
        console.error('Test 5 failed:', err.response ? err.response.data : err.message);
      }
    }

  } catch (err) {
    console.error('Main error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
