const jwt = require('jsonwebtoken');
const axios = require('axios');

const JWT_SECRET = 'trave-social-jwt-secret-key-change-in-production-2025';
const userId = '6956afd36d2fa5db6bdb2909';
const conversationId = '6956afd36d2fa5db6bdb2909_695f77cb41a262e64c17addc';

async function run() {
  console.log('Generating JWT token for user:', userId);
  const token = jwt.sign({ userId: userId }, JWT_SECRET, { expiresIn: '1h' });
  console.log('Token generated:', token);

  const url = `https://travel-social-backend.onrender.com/api/conversations/${conversationId}/messages`;
  console.log('Requesting URL:', url);

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ Request failed!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error Message:', error.message);
    }
  }
}

run();
