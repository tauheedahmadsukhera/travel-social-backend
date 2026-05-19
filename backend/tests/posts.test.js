const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/index');

describe('Posts API', () => {
  let Post;
  let User;
  let testUser;
  let testPost;

  beforeAll(async () => {
    Post = require('../src/models/Post');
    User = require('../src/models/User');

    // Ensure we have a test user and a test post for the feed queries to succeed quickly
    testUser = await User.findOneAndUpdate(
      { email: 'test-posts-api@example.com' },
      { 
        email: 'test-posts-api@example.com', 
        displayName: 'Test Posts User',
        firebaseUid: 'test-posts-uid-' + Date.now()
      },
      { upsert: true, new: true }
    );

    testPost = await Post.create({
      userId: testUser._id,
      content: 'Test Posts API Content',
      caption: 'Caption for test posts API',
      isPrivate: false,
      visibility: 'Everyone'
    });
  });

  afterAll(async () => {
    if (testPost) await Post.deleteOne({ _id: testPost._id });
    if (testUser) await User.deleteOne({ _id: testUser._id });
  });

  describe('GET /api/posts/feed', () => {
    it('should return a list of posts', async () => {
      const res = await request(app).get('/api/posts/feed');
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should support limit and skip parameters', async () => {
      const res = await request(app).get('/api/posts/feed?limit=5&skip=0');
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /api/posts/recommended', () => {
    it('should return randomized posts', async () => {
      const res = await request(app).get('/api/posts/recommended?limit=5');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
    });
  });
});
