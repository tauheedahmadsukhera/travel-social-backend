const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../src/index');

describe('Comments API', () => {
  let testUser;
  let testPost;
  let testComment;
  let token;

  beforeAll(async () => {
    const User = require('../models/User');
    const Post = require('../models/Post');
    const Comment = require('../models/Comment');
    const jwt = require('jsonwebtoken');

    // Create a test user
    testUser = await User.findOneAndUpdate(
      { email: 'test-comments@example.com' },
      { 
        email: 'test-comments@example.com', 
        displayName: 'Test Comment User',
        firebaseUid: 'test-comment-uid-' + Date.now()
      },
      { upsert: true, new: true }
    );

    // Create a test post
    testPost = await Post.create({
      userId: testUser._id,
      content: 'Test Comment Post',
      isPrivate: false
    });

    // Create a test comment
    testComment = await Comment.create({
      postId: testPost._id,
      userId: testUser._id,
      text: 'Original Comment'
    });

    // Generate token
    const secret = process.env.JWT_SECRET || 'dev-only-secret-do-not-use-in-prod';
    token = jwt.sign({ userId: testUser._id, email: testUser.email }, secret);
  });

  afterAll(async () => {
    const Post = require('../models/Post');
    const User = require('../models/User');
    const Comment = require('../models/Comment');
    if (testComment) await Comment.deleteOne({ _id: testComment._id });
    if (testPost) await Post.deleteOne({ _id: testPost._id });
    if (testUser) await User.deleteOne({ _id: testUser._id });
  });

  describe('GET /api/posts/:postId/comments', () => {
    it('should fetch comments for a post', async () => {
      const res = await request(app)
        .get(`/api/posts/${testPost._id}/comments`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].text).toBe('Original Comment');
    });
  });

  describe('POST /api/posts/:postId/comments', () => {
    it('should add a new comment', async () => {
      const res = await request(app)
        .post(`/api/posts/${testPost._id}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'New Test Comment' });
      
      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.text).toBe('New Test Comment');
    });
  });

  describe('PATCH /api/posts/:postId/comments/:commentId', () => {
    it('should edit an existing comment', async () => {
      const res = await request(app)
        .patch(`/api/posts/${testPost._id}/comments/${testComment._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'Updated Comment' });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.text).toBe('Updated Comment');
    });
  });

  describe('DELETE /api/posts/:postId/comments/:commentId', () => {
    it('should delete a comment', async () => {
      const res = await request(app)
        .delete(`/api/posts/${testPost._id}/comments/${testComment._id}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });
  });
});
