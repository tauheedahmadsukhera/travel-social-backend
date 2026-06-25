const axios = require('axios');

const BASE_URL = 'http://localhost:5002/api';
const randomSuffix = Math.floor(Math.random() * 1000000);
const TEST_USERNAME = `user_${randomSuffix}`;
const TEST_EMAIL = `test_${randomSuffix}@example.com`;
const TEST_PASSWORD = 'Password123!';

async function runLocalEndpointTests() {
  console.log('🧪 Starting local backend endpoints verification...\n');
  let token = null;
  let userId = null;
  let postId = null;
  let commentId = null;
  
  const headers = {};

  try {
    // 1. Health checks
    console.log('1. Testing status and health endpoints...');
    const statusRes = await axios.get(`${BASE_URL}/status`);
    console.log(`   [STATUS] ${statusRes.status} -> success: ${statusRes.data.status}`);
    
    const healthRes = await axios.get(`${BASE_URL}/health`);
    console.log(`   [HEALTH] ${healthRes.status} -> success: ${healthRes.data.status}`);
    
    const pingRes = await axios.get(`${BASE_URL}/ping-v2`);
    console.log(`   [PING] ${pingRes.status} -> success: ${pingRes.data.message}`);

    // 2. Auth: Check username availability
    console.log('\n2. Testing username check...');
    const checkUsernameRes = await axios.get(`${BASE_URL}/auth/username/check?username=${TEST_USERNAME}`);
    console.log(`   [CHECK USERNAME] ${checkUsernameRes.status} -> available: ${checkUsernameRes.data.available}`);

    // 3. Auth: Signup with username + password
    console.log('\n3. Testing username signup...');
    const signupRes = await axios.post(`${BASE_URL}/auth/username/signup`, {
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
      name: 'Test Endpoint User'
    });
    
    if (signupRes.data.success) {
      token = signupRes.data.token;
      userId = signupRes.data.user.id;
      headers['Authorization'] = `Bearer ${token}`;
      console.log(`   ✅ Signup success! UserId: ${userId}`);
    } else {
      console.log(`   ❌ Signup failed:`, signupRes.data);
      return;
    }

    // 4. Auth: Verify token
    console.log('\n4. Testing auth verification...');
    const verifyRes = await axios.post(`${BASE_URL}/auth/verify`, {}, { headers });
    console.log(`   [VERIFY] ${verifyRes.status} -> success: ${verifyRes.data.success}`);

    // 5. User: Get user profile
    console.log('\n5. Testing GET /api/users/:userId...');
    const profileRes = await axios.get(`${BASE_URL}/users/${userId}`, { headers });
    console.log(`   [PROFILE] ${profileRes.status} -> name: ${profileRes.data.data.displayName || profileRes.data.data.username}`);

    // 6. Posts: Create a post
    console.log('\n6. Testing POST /api/posts...');
    const createPostRes = await axios.post(`${BASE_URL}/posts`, {
      caption: 'This is a test post from endpoint validator',
      content: 'This is a test post from endpoint validator',
      visibility: 'Everyone',
      isPrivate: false
    }, { headers });
    
    if (createPostRes.data.success) {
      postId = createPostRes.data.data._id || createPostRes.data.data.id;
      console.log(`   ✅ Post created! PostId: ${postId}`);
    } else {
      console.log(`   ❌ Post creation failed:`, createPostRes.data);
    }

    // 7. Posts: Get feed
    console.log('\n7. Testing GET /api/posts/feed...');
    const feedRes = await axios.get(`${BASE_URL}/posts/feed`, { headers });
    console.log(`   [FEED] ${feedRes.status} -> posts count: ${feedRes.data.data.length}`);

    // 8. Posts: Get recommended
    console.log('\n8. Testing GET /api/posts/recommended...');
    const recRes = await axios.get(`${BASE_URL}/posts/recommended`, { headers });
    console.log(`   [RECOMMENDED] ${recRes.status} -> posts count: ${recRes.data.data.length}`);

    if (postId) {
      // 9. Comments: Add a comment
      console.log('\n9. Testing POST /api/posts/:postId/comments...');
      const commentRes = await axios.post(`${BASE_URL}/posts/${postId}/comments`, {
        text: 'This is a test comment',
        userName: TEST_USERNAME
      }, { headers });
      
      if (commentRes.data.success) {
        commentId = commentRes.data.data._id || commentRes.data.data.id;
        console.log(`   ✅ Comment added! CommentId: ${commentId}`);
      } else {
        console.log(`   ❌ Comment addition failed:`, commentRes.data);
      }

      // 10. Comments: Get comments
      console.log('\n10. Testing GET /api/posts/:postId/comments...');
      const getCommentsRes = await axios.get(`${BASE_URL}/posts/${postId}/comments`, { headers });
      console.log(`   [GET COMMENTS] ${getCommentsRes.status} -> comments count: ${getCommentsRes.data.data.length}`);

      // 11. Posts: Like a post
      console.log('\n11. Testing POST /api/posts/:postId/like...');
      const likeRes = await axios.post(`${BASE_URL}/posts/${postId}/like`, {
        userName: TEST_USERNAME
      }, { headers });
      console.log(`   [LIKE POST] ${likeRes.status} -> success: ${likeRes.data.success}`);

      // 12. Posts: Unlike a post
      console.log('\n12. Testing DELETE /api/posts/:postId/like...');
      const unlikeRes = await axios.delete(`${BASE_URL}/posts/${postId}/like`, { headers });
      console.log(`   [UNLIKE POST] ${unlikeRes.status} -> success: ${unlikeRes.data.success}`);
    }

    // 13. Categories: Get categories
    console.log('\n13. Testing GET /api/categories...');
    const categoriesRes = await axios.get(`${BASE_URL}/categories`, { headers });
    console.log(`   [CATEGORIES] ${categoriesRes.status} -> success: ${categoriesRes.data.success}`);

    // 14. Live Streams: Get live streams
    console.log('\n14. Testing GET /api/live-streams...');
    const liveRes = await axios.get(`${BASE_URL}/live-streams`, { headers });
    console.log(`   [LIVE STREAMS] ${liveRes.status} -> success: ${liveRes.data.success}`);

    // 15. Regions: Get all regions
    console.log('\n15. Testing GET /api/all-regions...');
    const regionsRes = await axios.get(`${BASE_URL}/all-regions`, { headers });
    console.log(`   [REGIONS] ${regionsRes.status} -> data count: ${regionsRes.data.data ? regionsRes.data.data.length : 'N/A'}`);

    console.log('\n🎉 Local endpoint tests execution completed!');

  } catch (error) {
    console.error('\n❌ Test execution failed with error:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data:`, error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

runLocalEndpointTests();
