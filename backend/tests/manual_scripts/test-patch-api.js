const axios = require('axios');

async function testPatch() {
    const baseUrl = 'http://localhost:5000/api'; // Adjust port if needed
    const postId = '67b36f1c71383832c3cc6c5e'; // Use a real post ID from your DB
    const userId = 'G83A14R9P8T2W9V7M6X5Z4Y3Q2J1'; // Use a real user ID

    try {
        console.log('Testing PATCH for post:', postId);
        const res = await axios.patch(`${baseUrl}/posts/${postId}`, {
            currentUserId: userId,
            caption: 'Updated Caption ' + Date.now(),
            location: 'New York',
            locationData: { name: 'New York', address: 'NY, USA', placeId: 'ny123' },
            hashtags: ['test', 'updated'],
            category: 'Travel',
            visibility: 'Everyone'
        });

        console.log('Response Status:', res.status);
        console.log('Response Data:', JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error('Error:', err.response ? err.response.data : err.message);
    }
}

testPatch();
