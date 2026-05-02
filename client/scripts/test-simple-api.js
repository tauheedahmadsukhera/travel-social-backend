// ✅ SIMPLE API TESTING - Using curl/axios directly
const axios = require('axios');

const API_BASE = 'https://trave-social-backend.onrender.com/api';

const testEndpoint = async (endpoint, name) => {
  try {
    console.log(`🧪 Testing ${name}...`);
    const response = await axios.get(`${API_BASE}${endpoint}`, {
      timeout: 10000
    });
    console.log(`✅ ${name} - Status: ${response.status}, Data: ${!!response.data}`);
    if (response.data) {
      console.log(`   Response type: ${Array.isArray(response.data?.data) ? 'Array' : typeof response.data?.data}`);
      if (Array.isArray(response.data?.data)) {
        console.log(`   Array length: ${response.data.data.length}`);
      }
    }
    return { success: true, data: response.data };
  } catch (error) {
    console.log(`❌ ${name} - Error: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
    }
    return { success: false, error: error.message };
  }
};

const runTests = async () => {
  console.log('🚀 Starting API Tests...\n');

  const tests = [
    { endpoint: '/status', name: 'Backend Status' },
    { endpoint: '/health', name: 'Health Check' },
    { endpoint: '/posts?limit=5', name: 'Get Posts' },
    { endpoint: '/categories', name: 'Get Categories' },
    { endpoint: '/posts/location-count', name: 'Location Count' },
    { endpoint: '/live-streams', name: 'Live Streams' },
  ];

  const results = [];
  
  for (const test of tests) {
    const result = await testEndpoint(test.endpoint, test.name);
    results.push({ ...test, ...result });
    console.log(''); // Empty line for readability
  }

  console.log('📊 TEST RESULTS SUMMARY:');
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${Math.round((passed / results.length) * 100)}%`);

  if (failed === 0) {
    console.log('\n🎉 ALL API ENDPOINTS WORKING PERFECTLY!');
  } else {
    console.log('\n⚠️ Some endpoints need attention.');
  }
};

runTests();