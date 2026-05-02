const axios = require('axios');

async function testLike() {
  try {
    const res = await axios.post('http://192.168.100.209:5000/api/posts/69c540e20e3bcb7a588e3bc4/like', {
      userId: '6956afd36d2fa5db6bdb2909'
    });
    console.log('✅ Like Test Success:', res.status, res.data.success);
    console.log('Data:', JSON.stringify(res.data.data, null, 2));
  } catch (err) {
    console.error('❌ Like Test Failed:', err.response?.status || err.message);
    if (err.response?.data) console.error('Response:', err.response.data);
  }
}

testLike();
