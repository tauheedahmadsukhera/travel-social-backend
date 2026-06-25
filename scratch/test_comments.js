const axios = require('axios');

async function test() {
  try {
    const res = await axios.get('http://localhost:5000/api/posts/6a02d075a9d834f16ef8694b/comments');
    console.log('✅ Success:', res.status, res.data);
  } catch (err) {
    console.error('❌ Error:', err.response ? err.response.status : err.message);
    if (err.response) {
      console.error('Data:', err.response.data);
    }
  }
}

test();
