// ZeegoCloud Configuration for Live Streaming
// Using ZeegoCloud UIKit for React Native

export const ZEEGOCLOUD_CONFIG = {
  appID: Number(process.env.EXPO_PUBLIC_ZEGO_APP_ID || process.env.EXPO_PUBLIC_ZEEGOCLOUD_APP_ID || 0), // Your ZeegoCloud App ID
  appSign: String(process.env.EXPO_PUBLIC_ZEGO_APP_SIGN || process.env.EXPO_PUBLIC_ZEEGOCLOUD_APP_SIGN || ''), // Your App Sign
  serverSecret: '',
};

// Generate unique room ID for live stream
export const generateRoomId = (userId) => {
  return `live_${userId}_${Date.now()}`;
};

// Generate user ID for ZeegoCloud
export const generateUserId = (userId) => {
  return userId || `user_${Date.now()}`;
};

console.log('✅ ZeegoCloud config loaded');
