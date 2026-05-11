const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../src/index');
const connectDB = require('../src/loaders/database');

describe('Posts API', () => {
  let Post;
  let User;

  beforeAll(async () => {
    // Manually connect to DB for testing
    await connectDB();
    Post = require('../models/Post');
    User = require('../models/User');
  }, 30000); // Increase timeout for DB connection

  afterAll(async () => {
    await mongoose.connection.close();
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
