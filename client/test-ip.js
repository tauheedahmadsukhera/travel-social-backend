const axios = require('axios');

const API_URL = 'http://10.23.148.223:5000/api';

async function testAPI() {
    console.log(`Checking API at: ${API_URL}`);
    try {
        const response = await axios.get(`${API_URL}/health`, { timeout: 5000 });
        console.log('✅ Success! Status:', response.status);
        console.log('Response data:', JSON.stringify(response.data));
    } catch (error) {
        console.error('❌ Failed! Error:', error.code || error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
    }
}

testAPI();
