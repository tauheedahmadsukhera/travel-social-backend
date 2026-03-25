// Test Agora Token Generation Locally
// Run with: node functions/test-token.js

const agoraToken = require('agora-token');
const { RtcTokenBuilder, RtcRole } = agoraToken;

// Agora credentials
const appId = '29320482381a43498eb8ca3e222b6e34';
const appCertificate = 'e8372567e0334d75add0ec3f597fb67b';

// Test parameters
const channelName = 'test_channel_123';
const uid = 12345;
const role = RtcRole.PUBLISHER; // or RtcRole.SUBSCRIBER

// Token expiration (1 hour)
const expirationTimeInSeconds = 3600;
const currentTimestamp = Math.floor(Date.now() / 1000);
const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

console.log('🎫 Generating Agora Token...');
console.log('📡 Channel:', channelName);
console.log('🎯 UID:', uid);
console.log('👤 Role:', role === RtcRole.PUBLISHER ? 'PUBLISHER' : 'SUBSCRIBER');

try {
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    role,
    privilegeExpiredTs,
    privilegeExpiredTs
  );

  console.log('\n✅ Token Generated Successfully!');
  console.log('🔑 Token:', token);
  console.log('⏰ Expires in:', expirationTimeInSeconds, 'seconds');
  console.log('\n📋 Token Details:');
  console.log('   - Length:', token.length, 'characters');
  console.log('   - Valid until:', new Date((currentTimestamp + expirationTimeInSeconds) * 1000).toLocaleString());
  
  console.log('\n✅ Token generation is working! You can now deploy the Cloud Function.');
} catch (error) {
  console.error('\n❌ Error generating token:', error);
  console.error('Make sure agora-token package is installed: npm install agora-token');
}

