const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/index');

describe('Verification Request API', () => {
  let testUser;
  let testAdmin;
  let token;
  let adminToken;
  let createdRequestId;

  beforeAll(async () => {
    const User = require('../src/models/User');
    const jwt = require('jsonwebtoken');

    // Create a regular test user
    testUser = await User.findOneAndUpdate(
      { email: 'test-verification-user@example.com' },
      { 
        email: 'test-verification-user@example.com', 
        displayName: 'Test Verification User',
        isVerified: false,
        firebaseUid: 'test-user-uid-' + Date.now()
      },
      { upsert: true, new: true }
    );

    // Create an admin test user
    testAdmin = await User.findOneAndUpdate(
      { email: 'test-verification-admin@example.com' },
      { 
        email: 'test-verification-admin@example.com', 
        displayName: 'Test Verification Admin',
        role: 'admin',
        firebaseUid: 'test-admin-uid-' + Date.now()
      },
      { upsert: true, new: true }
    );

    // Generate tokens
    const secret = process.env.JWT_SECRET || 'dev-only-secret-do-not-use-in-prod';
    token = jwt.sign({ userId: testUser._id, email: testUser.email }, secret);
    adminToken = jwt.sign({ userId: testAdmin._id, email: testAdmin.email }, secret);
  });

  afterAll(async () => {
    const User = require('../src/models/User');
    const VerificationRequest = require('../src/models/VerificationRequest');
    
    // Clean up
    await VerificationRequest.deleteMany({ userId: { $in: [testUser._id, String(testUser._id)] } });
    await User.deleteMany({ _id: { $in: [testUser._id, testAdmin._id] } });
  });

  describe('GET /api/users/verification/status', () => {
    it('should return null if no request has been submitted', async () => {
      const res = await request(app)
        .get('/api/users/verification/status')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
    });
  });

  describe('POST /api/users/verification/request', () => {
    it('should fail with missing fields', async () => {
      const res = await request(app)
        .post('/api/users/verification/request')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Test Legal Name' }); // missing category/doc url
      
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });

    it('should successfully submit a verification request', async () => {
      const res = await request(app)
        .post('/api/users/verification/request')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Test Legal Name',
          category: 'Travel Blogger',
          documentUrl: 'http://example.com/test-id.jpg'
        });
      
      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fullName).toBe('Test Legal Name');
      expect(res.body.data.status).toBe('pending');
      createdRequestId = res.body.data._id;
    });

    it('should fail to submit duplicate requests when one is pending', async () => {
      const res = await request(app)
        .post('/api/users/verification/request')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Test Legal Name 2',
          category: 'Influencer',
          documentUrl: 'http://example.com/test-id2.jpg'
        });
      
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('pending');
    });
  });

  describe('GET /api/users/verification/status after submission', () => {
    it('should retrieve status as pending', async () => {
      const res = await request(app)
        .get('/api/users/verification/status')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.isVerified).toBe(false);
    });
  });

  describe('Admin Verification Moderation', () => {
    it('should reject access to non-admins for pending requests list', async () => {
      const res = await request(app)
        .get('/api/admin/verification-requests')
        .set('Authorization', `Bearer ${token}`); // regular user token
      
      expect(res.statusCode).toEqual(403);
    });

    it('should allow admin to list pending requests', async () => {
      const res = await request(app)
        .get('/api/admin/verification-requests?status=pending')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject verification request update for non-admins', async () => {
      const res = await request(app)
        .put(`/api/admin/verification-requests/${createdRequestId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' });
      
      expect(res.statusCode).toEqual(403);
    });

    it('should allow admin to approve request', async () => {
      const res = await request(app)
        .put(`/api/admin/verification-requests/${createdRequestId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'approved' });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('approved');

      // Check if user isVerified was updated
      const User = require('../src/models/User');
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.isVerified).toBe(true);
    });
  });
});
