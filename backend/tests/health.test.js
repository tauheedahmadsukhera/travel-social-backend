const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/index');

describe('Health API', () => {
  // Before all tests, we might need to wait for DB connection
  // But for health check, it might work even without DB or we just mock it
  


  it('should return status ok from /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('status', 'healthy');
  });

  it('should return success from /api/ping-v2', async () => {
    const res = await request(app).get('/api/ping-v2');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('success', true);
  });
});
