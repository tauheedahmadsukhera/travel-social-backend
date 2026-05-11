const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../src/index');

describe('Feed API', () => {
  let testUser;
  let testPost;
  let token;

  beforeAll(async () => {
    const User = require('../models/User');
    const Post = require('../models/Post');
    const jwt = require('jsonwebtoken');

    // Create a test user
    testUser = await User.findOneAndUpdate(
      { email: 'test-feed@example.com' },
      { 
        email: 'test-feed@example.com', 
        displayName: 'Test Feed User',
        firebaseUid: 'test-feed-uid-' + Date.now()
      },
      { upsert: true, new: true }
    );

    // Create a test post
    testPost = await Post.create({
      userId: testUser._id,
      content: 'Test Feed Post',
      caption: 'This is a test post for the feed',
      isPrivate: false,
      visibility: 'Everyone'
    });

    // Generate token
    const secret = process.env.JWT_SECRET || 'dev-only-secret-do-not-use-in-prod';
    token = jwt.sign({ userId: testUser._id, email: testUser.email }, secret);
  });

  afterAll(async () => {
    const Post = require('../models/Post');
    const User = require('../models/User');
    if (testPost) await Post.deleteOne({ _id: testPost._id });
    if (testUser) await User.deleteOne({ _id: testUser._id });
  });

  describe('GET /api/posts/feed', () => {
    it('should fetch the feed for authenticated user', async () => {
      const res = await request(app)
        .get('/api/posts/feed')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      
      // Check if our test post is in the feed
      const found = res.body.data.find(p => String(p._id).includes(String(testPost._id)));
      expect(found).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      const res = await request(app)
        .get('/api/posts/feed?limit=1')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBeLessThanOrEqual(1);
    });

    it('should handle anonymous feed', async () => {
      const res = await request(app).get('/api/posts/feed');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });
  });
});
