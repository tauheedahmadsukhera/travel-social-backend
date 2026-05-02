const http = require('http');

async function makeRequest(options, body = null) {
  if (body) {
    const bodyData = JSON.stringify(body);
    options.headers = {
      ...options.headers,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyData)
    };
  }
  
  return new Promise((resolve, reject) => {
    console.log(`  [DEBUG] Making request to ${options.hostname}:${options.port}${options.path}`);
    
    const req = http.request(options, (res) => {
      console.log(`  [DEBUG] Response received: ${res.statusCode}`);
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          console.log(`  [DEBUG] Response Body: ${data}`);
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', (err) => {
      console.error(`  [DEBUG] Request error: ${err.code} - ${err.message}`);
      reject(err);
    });
    
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  try {
    console.log('🧪 Testing Like Functionality\n');
    
    // Get posts
    console.log('1. Fetching posts...');
    const postsRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/posts',
      method: 'GET'
    });
    
    console.log(`   Status: ${postsRes.status}`);
    if (!postsRes.data.success || postsRes.data.data.length === 0) {
      console.log('❌ No posts found');
      process.exit(1);
    }
    
    const postId = postsRes.data.data[0]._id;
    console.log(`   ✅ Found ${postsRes.data.data.length} posts`);
    console.log(`   Using: ${postId}\n`);
    
    // Get user
    const userId = '5WLYAqbq2phJqbJUj6El20zD9fC3';
    console.log(`2. Using user: ${userId}\n`);
    
    // Like post
    console.log('3. Liking post...');
    const likeRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/posts/${postId}/like`,
      method: 'POST'
    }, { userId });
    
    if (likeRes.status === 200 && likeRes.data.success) {
      console.log(`   ✅ Liked successfully`);
      console.log(`   Likes: ${likeRes.data.data.likesCount}\n`);
    } else {
      console.log(`   ❌ Failed: ${likeRes.status}\n`);
    }
    
    console.log('✅ Test complete!');
    process.exit(0);
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

test();
