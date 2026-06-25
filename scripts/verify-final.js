const axios = require('axios');
const fs = require('fs');

async function verifyAll() {
  console.log('--- FILE CONTENT CHECK ---');
  const content = fs.readFileSync('src/index.js', 'utf8');
  const hasDualRoute = content.includes("['/api/posts/:postId/like', '/posts/:postId/like']");
  console.log('Has Dual Route in file:', hasDualRoute);

  console.log('\n--- ENDPOINT TESTS ---');
  const endpoints = [
    'http://localhost:5000/api/posts/69c540e20e3bcb7a588e3bc4/like',
    'http://localhost:5000/posts/69c540e20e3bcb7a588e3bc4/like'
  ];

  for (const url of endpoints) {
    try {
      const res = await axios.post(url, { userId: '6956afd36d2fa5db6bdb2909' });
      console.log(`✅ ${url} ->`, res.status, res.data.success);
    } catch (err) {
      console.error(`❌ ${url} ->`, err.response?.status || err.message);
    }
  }
}

verifyAll();
