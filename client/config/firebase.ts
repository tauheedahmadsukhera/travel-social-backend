import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, initializeAuth } from 'firebase/auth';
import { Platform } from 'react-native';

// ⚠️ FIREBASE CONFIGURATION - AUTHENTICATION ONLY
// Firebase is ONLY used for social login authentication (Google, Apple, Snapchat, TikTok)
// All data operations (posts, stories, comments, etc.) should use Backend API
// Backend URL: https://trave-social-backend.onrender.com/api

// ✅ SECURE FIREBASE CONFIGURATION - Environment Variables
// Firebase is ONLY used for social login authentication (Google, Apple, Snapchat, TikTok)
// All data operations (posts, stories, comments, etc.) use Backend API
// Backend URL: https://trave-social-backend.onrender.com/api

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyC_0pHFGAK5YySB--8hL3Ctz-u1cx4vaCk',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'travel-app-3da72.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'travel-app-3da72',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'travel-app-3da72.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '709095117662',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:709095117662:web:5f00f45bb4e392ee17f5cf',
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-PFZRL4FDFD',
};

// Initialize Firebase (prevent duplicate)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// ✅ AUTHENTICATION ONLY - Initialize Firebase Auth with React Native persistence
let auth: Auth;
try {
  const { getReactNativePersistence } = require('firebase/auth');
  auth = initializeAuth(app, {
    persistence: Platform.OS === 'web'
      ? undefined
      : getReactNativePersistence(AsyncStorage),
  });
  console.log('✅ Firebase Auth initialized (AUTHENTICATION ONLY)');
} catch (error: any) {
  console.warn('Using existing Firebase Auth instance:', error?.message || error);
  auth = getAuth(app);
}

// ❌ FIRESTORE & STORAGE DISABLED - Use Backend API instead
// DO NOT use db or storage - all data operations go through Backend API
// For migration compatibility, these are exported as null
export const db = null as any;
export const storage = null as any;

// ❌ FIRESTORE HELPERS DISABLED - Use Backend API for all data operations
export const serverTimestamp = null as any;
export const arrayUnion = null as any;
export const arrayRemove = null as any;
export const FieldValue = null as any;

// ✅ ONLY AUTH IS AVAILABLE
export { auth };

export default app;
