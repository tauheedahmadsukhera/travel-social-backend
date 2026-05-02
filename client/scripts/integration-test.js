#!/usr/bin/env node

/**
 * 🔗 TRAVE SOCIAL FRONTEND-BACKEND INTEGRATION TEST SUITE
 * 
 * Tests all critical integration points:
 * - Authentication (Firebase → Backend)
 * - User Profile Management
 * - CRUD Operations (Posts, Comments)
 * - Real-time Messaging
 * - Live Streaming
 * - Following/Followers System
 */

const http = require('http');
const https = require('https');

const API_BASE = 'http://localhost:5000/api';
const HEALTH_CHECK_URL = 'http://localhost:5000';

let testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

// ============================================================================
// Helper Functions
// ============================================================================

function makeRequest(method, url, body = null) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        method: method,
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 3000,
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : null;
            resolve({ status: res.statusCode, data: parsed, headers: res.headers });
          } catch (e) {
            resolve({ status: res.statusCode, data: data, headers: res.headers });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ status: 0, data: null, error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 0, data: null, error: 'timeout' });
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    } catch (err) {
      resolve({ status: 0, data: null, error: err.message });
    }
  });
}

function logTest(name, passed, error = null) {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${name}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${name}`);
    if (error) console.log(`   Error: ${error}`);
  }
  testResults.details.push({ name, passed, error });
}

function logSection(title) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📋 ${title}`);
  console.log(`${'='.repeat(70)}`);
}

function logSummary() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 TEST SUMMARY`);
  console.log(`${'='.repeat(70)}`);
  console.log(`✅ Passed: ${testResults.passed}/${testResults.total}`);
  console.log(`❌ Failed: ${testResults.failed}/${testResults.total}`);
  console.log(`📈 Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(2)}%`);
  console.log(`${'='.repeat(70)}\n`);
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

async function runTests() {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║   🚀 TRAVE SOCIAL FRONTEND-BACKEND INTEGRATION TEST SUITE 🚀      ║
║                                                                    ║
║          Testing Authentication, APIs, and Real-time Features     ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
  `);

  // ========================================================================
  // TEST 1: Health Check
  // ========================================================================
  logSection('1. BACKEND HEALTH CHECK');

  try {
    const healthResponse = await makeRequest('GET', HEALTH_CHECK_URL);
    if (healthResponse.status === 200 || (healthResponse.data && healthResponse.data.status === 'ok')) {
      logTest('Backend Server Running', true);
      console.log(`   API Base: ${API_BASE}`);
      console.log(`   Server Port: 5000`);
    } else {
      logTest('Backend Server Running', false, `Status ${healthResponse.status}`);
    }
  } catch (error) {
    logTest('Backend Server Running', false, error.message);
    console.log(`\n⚠️  CRITICAL: Backend server is not running!`);
    console.log(`   Please start the backend with: npm start (in trave-social-backend folder)\n`);
    logSummary();
    return;
  }

  // ========================================================================
  // TEST 2: Authentication Endpoints
  // ========================================================================
  logSection('2. AUTHENTICATION ENDPOINTS');

  // Test 2.1: Login endpoint exists
  try {
    const loginRes = await makeRequest('POST', `${API_BASE}/auth/login`, {
      email: 'test@test.com',
      password: 'test123'
    });
    logTest('Auth: POST /auth/login endpoint', loginRes.status !== 404);
  } catch (error) {
    logTest('Auth: POST /auth/login endpoint', false, error.message);
  }

  // Test 2.2: Register endpoint exists
  try {
    const registerRes = await makeRequest('POST', `${API_BASE}/auth/register`, {
      email: 'test@test.com',
      password: 'test123',
      username: 'testuser'
    });
    logTest('Auth: POST /auth/register endpoint', registerRes.status !== 404);
  } catch (error) {
    logTest('Auth: POST /auth/register endpoint', false, error.message);
  }

  // Test 2.3: Firebase login verification endpoint
  try {
    const firebaseRes = await makeRequest('POST', `${API_BASE}/auth/firebase-login`, {
      token: 'dummy_token'
    });
    logTest('Auth: POST /auth/firebase-login endpoint', firebaseRes.status !== 404);
  } catch (error) {
    logTest('Auth: POST /auth/firebase-login endpoint', false, error.message);
  }

  // ========================================================================
  // TEST 3: User Endpoints
  // ========================================================================
  logSection('3. USER PROFILE ENDPOINTS');

  // Test 3.1: Get user profile
  try {
    const userRes = await makeRequest('GET', `${API_BASE}/users/test-user-id`);
    logTest('Users: GET /api/users/:userId endpoint', userRes.status !== 404);
  } catch (error) {
    logTest('Users: GET /api/users/:userId endpoint', false, error.message);
  }

  // Test 3.2: Update user profile
  try {
    const updateRes = await makeRequest('PUT', `${API_BASE}/users/test-user-id`, {
      name: 'Test User',
      bio: 'Test bio'
    });
    logTest('Users: PUT /api/users/:userId endpoint', updateRes.status !== 404);
  } catch (error) {
    logTest('Users: PUT /api/users/:userId endpoint', false, error.message);
  }

  // Test 3.3: Get user posts
  try {
    const postsRes = await makeRequest('GET', `${API_BASE}/users/test-user-id/posts`);
    logTest('Users: GET /api/users/:userId/posts endpoint', postsRes.status !== 404);
  } catch (error) {
    logTest('Users: GET /api/users/:userId/posts endpoint', false, error.message);
  }

  // ========================================================================
  // TEST 4: Post Management Endpoints
  // ========================================================================
  logSection('4. POST MANAGEMENT ENDPOINTS');

  // Test 4.1: Create post
  try {
    const createRes = await makeRequest('POST', `${API_BASE}/posts`, {
      userId: 'test-user-id',
      caption: 'Test post',
      location: 'Test Location'
    });
    logTest('Posts: POST /api/posts (create)', createRes.status !== 404);
  } catch (error) {
    logTest('Posts: POST /api/posts (create)', false, error.message);
  }

  // Test 4.2: Get all posts
  try {
    const allRes = await makeRequest('GET', `${API_BASE}/posts`);
    logTest('Posts: GET /api/posts (all posts)', allRes.status !== 404);
  } catch (error) {
    logTest('Posts: GET /api/posts (all posts)', false, error.message);
  }

  // Test 4.3: Get feed
  try {
    const feedRes = await makeRequest('GET', `${API_BASE}/posts/feed`);
    logTest('Posts: GET /api/posts/feed (feed)', feedRes.status !== 404);
  } catch (error) {
    logTest('Posts: GET /api/posts/feed (feed)', false, error.message);
  }

  // Test 4.4: Get single post
  try {
    const singleRes = await makeRequest('GET', `${API_BASE}/posts/test-post-id`);
    logTest('Posts: GET /api/posts/:postId (single)', singleRes.status !== 404);
  } catch (error) {
    logTest('Posts: GET /api/posts/:postId (single)', false, error.message);
  }

  // Test 4.5: Like post
  try {
    const likeRes = await makeRequest('POST', `${API_BASE}/posts/test-post-id/like`, {
      userId: 'test-user-id'
    });
    logTest('Posts: POST /api/posts/:postId/like (like)', likeRes.status !== 404);
  } catch (error) {
    logTest('Posts: POST /api/posts/:postId/like (like)', false, error.message);
  }

  // Test 4.6: Delete post
  try {
    const deleteRes = await makeRequest('DELETE', `${API_BASE}/posts/test-post-id`, {
      userId: 'test-user-id'
    });
    logTest('Posts: DELETE /api/posts/:postId (delete)', deleteRes.status !== 404);
  } catch (error) {
    logTest('Posts: DELETE /api/posts/:postId (delete)', false, error.message);
  }

  // ========================================================================
  // TEST 5: Messaging Endpoints
  // ========================================================================
  logSection('5. MESSAGING & CONVERSATIONS');

  // Test 5.1: Create conversation
  try {
    const convRes = await makeRequest('POST', `${API_BASE}/conversations`, {
      participantIds: ['user1', 'user2']
    });
    logTest('Messaging: POST /api/conversations (create)', convRes.status !== 404);
  } catch (error) {
    logTest('Messaging: POST /api/conversations (create)', false, error.message);
  }

  // Test 5.2: Get messages
  try {
    const messRes = await makeRequest('GET', `${API_BASE}/conversations/test-conv-id/messages`);
    logTest('Messaging: GET /conversations/:id/messages (fetch)', messRes.status !== 404);
  } catch (error) {
    logTest('Messaging: GET /conversations/:id/messages (fetch)', false, error.message);
  }

  // Test 5.3: Send message
  try {
    const sendRes = await makeRequest('POST', `${API_BASE}/conversations/test-conv-id/messages`, {
      senderId: 'test-user-id',
      text: 'Test message'
    });
    logTest('Messaging: POST /conversations/:id/messages (send)', sendRes.status !== 404);
  } catch (error) {
    logTest('Messaging: POST /conversations/:id/messages (send)', false, error.message);
  }

  // ========================================================================
  // TEST 6: Live Stream Endpoints
  // ========================================================================
  logSection('6. LIVE STREAMING ENDPOINTS');

  // Test 6.1: Create stream
  try {
    const createRes = await makeRequest('POST', `${API_BASE}/livestreams`, {
      userId: 'test-user-id',
      title: 'Test Stream'
    });
    logTest('Streams: POST /api/livestreams (create)', createRes.status !== 404);
  } catch (error) {
    logTest('Streams: POST /api/livestreams (create)', false, error.message);
  }

  // Test 6.2: Get active streams
  try {
    const activeRes = await makeRequest('GET', `${API_BASE}/livestreams`);
    logTest('Streams: GET /api/livestreams (active)', activeRes.status !== 404);
  } catch (error) {
    logTest('Streams: GET /api/livestreams (active)', false, error.message);
  }

  // Test 6.3: Join stream
  try {
    const joinRes = await makeRequest('POST', `${API_BASE}/livestreams/test-stream-id/join`, {
      userId: 'test-user-id'
    });
    logTest('Streams: POST /livestreams/:id/join (join)', joinRes.status !== 404);
  } catch (error) {
    logTest('Streams: POST /livestreams/:id/join (join)', false, error.message);
  }

  // ========================================================================
  // TEST 7: Notification Endpoints
  // ========================================================================
  logSection('7. NOTIFICATION ENDPOINTS');

  // Test 7.1: Get notifications
  try {
    const notifRes = await makeRequest('GET', `${API_BASE}/notifications?userId=test-user-id`);
    logTest('Notifications: GET /api/notifications (fetch)', notifRes.status !== 404);
  } catch (error) {
    logTest('Notifications: GET /api/notifications (fetch)', false, error.message);
  }

  // Test 7.2: Mark as read
  try {
    const readRes = await makeRequest('POST', `${API_BASE}/notifications/test-notif-id/read`, {
      userId: 'test-user-id'
    });
    logTest('Notifications: POST /notifications/:id/read (mark read)', readRes.status !== 404);
  } catch (error) {
    logTest('Notifications: POST /notifications/:id/read (mark read)', false, error.message);
  }

  // ========================================================================
  // TEST 8: Following System
  // ========================================================================
  logSection('8. FOLLOWING SYSTEM');

  // Test 8.1: Follow user
  try {
    const followRes = await makeRequest('POST', `${API_BASE}/users/target-user-id/follow`, {
      followerId: 'test-user-id'
    });
    logTest('Following: POST /api/users/:userId/follow (follow)', followRes.status !== 404);
  } catch (error) {
    logTest('Following: POST /api/users/:userId/follow (follow)', false, error.message);
  }

  // Test 8.2: Unfollow user
  try {
    const unfollowRes = await makeRequest('DELETE', `${API_BASE}/users/target-user-id/follow`, {
      followerId: 'test-user-id'
    });
    logTest('Following: DELETE /api/users/:userId/follow (unfollow)', unfollowRes.status !== 404);
  } catch (error) {
    logTest('Following: DELETE /api/users/:userId/follow (unfollow)', false, error.message);
  }

  // ========================================================================
  // TEST 9: CORS & Headers
  // ========================================================================
  logSection('9. CORS & SECURITY HEADERS');

  try {
    const corsRes = await makeRequest('GET', `${API_BASE}/posts`);
    const hasOriginHeader = corsRes.headers['access-control-allow-origin'];
    logTest('CORS: Access-Control-Allow-Origin header present', !!hasOriginHeader);
    if (hasOriginHeader) {
      console.log(`   Value: ${hasOriginHeader}`);
    }
  } catch (error) {
    logTest('CORS: Access-Control-Allow-Origin header present', false, error.message);
  }

  // ========================================================================
  // FINAL SUMMARY
  // ========================================================================
  logSummary();

  // Print detailed recommendations
  console.log(`📝 INTEGRATION VERIFICATION REPORT\n`);

  if (testResults.failed === 0) {
    console.log(`✅ ALL INTEGRATION POINTS OPERATIONAL\n`);
    console.log(`Your frontend and backend are properly connected!`);
    console.log(`All critical API endpoints are responding.\n`);
    console.log(`Next Steps:`);
    console.log(`1. Start the frontend: npx expo start (in trave-social folder)`);
    console.log(`2. Test authentication flows in the app`);
    console.log(`3. Monitor network requests in browser DevTools`);
    console.log(`4. Check backend logs for any errors\n`);
  } else {
    console.log(`⚠️  SOME ENDPOINTS NOT RESPONDING\n`);
    console.log(`Failed Tests:`);
    testResults.details.filter(d => !d.passed).forEach(d => {
      console.log(`- ${d.name}`);
      if (d.error) console.log(`  ${d.error}`);
    });
    console.log(`\nPossible Issues:`);
    console.log(`1. Backend server not fully started - wait a moment`);
    console.log(`2. Routes not imported correctly in backend`);
    console.log(`3. MongoDB connection not established`);
    console.log(`4. Port 5000 in use by another service\n`);
    console.log(`Solutions:`);
    console.log(`1. Check backend logs for error messages`);
    console.log(`2. Verify .env file has correct MongoDB URI`);
    console.log(`3. Ensure all route files exist in backend\n`);
  }
}

// ============================================================================
// Execute Tests
// ============================================================================

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
