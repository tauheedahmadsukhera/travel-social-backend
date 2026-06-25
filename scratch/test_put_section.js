const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'trave-social-jwt-secret-key-change-in-production-2025';
const userId = '6956afd36d2fa5db6bdb2909';
const sectionId = '69c6a92f2012c8cc79e999bf';

// Generate token
const token = jwt.sign(
  {
    userId,
    email: 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
  },
  JWT_SECRET,
  { expiresIn: '7d' }
);

async function run() {
  console.log('Sending PUT request to local backend...');
  try {
    const response = await axios.put(
      `http://localhost:5002/api/users/${userId}/sections/${sectionId}`,
      {
        addPostId: '69df4d06b8c5b9bf2da39446',
        requesterUserId: userId,
        viewerId: userId
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    console.log('Response Success:', response.status, response.data);
  } catch (error) {
    if (error.response) {
      console.log('Response Error:', error.response.status, error.response.data);
    } else {
      console.error('Request Error:', error.message);
    }
  }
}

// Give server a brief moment to finish starting, then run
setTimeout(run, 1500);
