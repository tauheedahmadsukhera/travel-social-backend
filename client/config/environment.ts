/**
 * Environment Configuration
 * Load all environment variables from .env file using Expo Constants
 * NEVER commit actual keys - use .env.local or environment secrets
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Get environment variables
const env = Constants.expoConfig?.extra || process.env;

// Ensure keys are loaded from environment (fail loudly if missing in production)
const isDevelopment = process.env.NODE_ENV !== 'production';

function getEnvVar(key: string, defaultValue?: string): string {
  const value = env[key] || process.env[key];
  if (!value && !isDevelopment && defaultValue === undefined) {
    throw new Error(`Missing critical environment variable: ${key}`);
  }
  return value || defaultValue || '';
}

// Firebase Configuration (hardcoded for Metro compatibility)
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC_0pHFGAK5YySB--8hL3Ctz-u1cx4vaCk",
  authDomain: "travel-app-3da72.firebaseapp.com",
  projectId: "travel-app-3da72",
  storageBucket: "travel-app-3da72.firebasestorage.app",
  messagingSenderId: "709095117662",
  appId: "1:709095117662:web:5f00f45bb4e392ee17f5cf",
  measurementId: "G-PFZRL4FDFD"
} as const;

// Google Maps Configuration
export const GOOGLE_MAPS_CONFIG = {
  apiKey: getEnvVar('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY', getEnvVar('GOOGLE_MAPS_API_KEY', getEnvVar('GOOGLE_MAP_API_KEY', ''))),
  provider: 'google' as const,
} as const;

// Agora Configuration (app ID is semi-public, but certificate is NOT)
export const AGORA_CONFIG = {
  appId: getEnvVar('EXPO_PUBLIC_AGORA_APP_ID', ''),
  // Certificate should NEVER be in frontend - request tokens from backend only
  tokenServerUrl: getEnvVar('EXPO_PUBLIC_AGORA_TOKEN_URL', ''),
} as const;

// App Configuration
export const APP_CONFIG = {
  name: 'Travel Social',
  version: '1.0.0',
  environment: process.env.NODE_ENV || 'development',
} as const;

// Rate Limiting
export const RATE_LIMITS = {
  postsPerHour: parseInt(getEnvVar('EXPO_PUBLIC_RATE_LIMIT_POSTS_PER_HOUR', '10'), 10),
  commentsPerHour: parseInt(getEnvVar('EXPO_PUBLIC_RATE_LIMIT_COMMENTS_PER_HOUR', '50'), 10),
  messagesPerMinute: parseInt(getEnvVar('EXPO_PUBLIC_RATE_LIMIT_MESSAGES_PER_MINUTE', '30'), 10),
} as const;

// Feature Flags
export const FEATURES = {
  liveStreaming: true,
  stories: true,
  highlights: true,
  mapView: true,
  passport: true,
  privateAccounts: true,
  verifiedLocations: true,
  offlineMode: false,
  analytics: true,
  pushNotifications: true,
} as const;

// API Configuration
export const API_CONFIG = {
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second
} as const;

// Storage Configuration
export const STORAGE_CONFIG = {
  maxImageSize: 10 * 1024 * 1024, // 10MB
  maxVideoSize: 100 * 1024 * 1024, // 100MB
  imageQuality: 0.8,
  maxImageWidth: 1080,
  maxImageHeight: 1920,
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
  allowedVideoTypes: ['video/mp4', 'video/quicktime'],
} as const;

// Pagination Configuration
export const PAGINATION = {
  postsPerPage: 10,
  storiesPerPage: 20,
  commentsPerPage: 50,
  notificationsPerPage: 30,
  messagesPerPage: 50,
} as const;

// Default Assets
export const DEFAULT_ASSETS = {
  avatar: 'https://firebasestorage.googleapis.com/v0/b/travel-app-3da72.firebasestorage.app/o/default%2Fdefault-pic.jpg?alt=media&token=7177f487-a345-4e45-9a56-732f03dbf65d',
  placeholder: 'https://via.placeholder.com/600x600.png?text=No+Media',
} as const;

// Theme Configuration
export const THEME = {
  primaryColor: '#667eea',
  accentColor: '#764ba2',
  errorColor: '#e74c3c',
  successColor: '#2ecc71',
  warningColor: '#0A3D62',
  infoColor: '#3498db',
  backgroundColor: '#ffffff',
  textColor: '#000000',
  borderColor: '#ddd',
} as const;

// Validation Rules
export const VALIDATION = {
  minPasswordLength: 6,
  maxPasswordLength: 128,
  minUsernameLength: 3,
  maxUsernameLength: 30,
  maxBioLength: 150,
  maxCaptionLength: 2200,
  maxCommentLength: 500,
  emailRegex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  usernameRegex: /^[a-zA-Z0-9_]{3,30}$/,
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  networkError: 'Network error. Please check your connection.',
  authError: 'Authentication failed. Please login again.',
  permissionError: 'Permission denied. Please enable required permissions.',
  uploadError: 'Failed to upload media. Please try again.',
  genericError: 'Something went wrong. Please try again.',
  invalidEmail: 'Please enter a valid email address.',
  invalidPassword: 'Password must be at least 6 characters long.',
  invalidUsername: 'Username must be 3-30 characters and contain only letters, numbers, and underscores.',
  userNotFound: 'User not found.',
  postNotFound: 'Post not found.',
  unauthorized: 'You are not authorized to perform this action.',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  postCreated: 'Post created successfully!',
  postUpdated: 'Post updated successfully!',
  postDeleted: 'Post deleted successfully!',
  profileUpdated: 'Profile updated successfully!',
  followSuccess: 'Followed successfully!',
  unfollowSuccess: 'Unfollowed successfully!',
  commentAdded: 'Comment added successfully!',
  messageSent: 'Message sent successfully!',
} as const;

// Cache Keys
export const CACHE_KEYS = {
  userProfile: (userId: string) => `user_profile_${userId}`,
  posts: (userId: string) => `posts_${userId}`,
  stories: (userId: string) => `stories_${userId}`,
  feed: (userId: string) => `feed_${userId}`,
  notifications: (userId: string) => `notifications_${userId}`,
} as const;

// Storage Keys
export const STORAGE_KEYS = {
  authToken: '@auth_token',
  userData: '@user_data',
  theme: '@theme',
  language: '@language',
  offlineQueue: '@offline_queue',
} as const;

// API Base URL Helper
export function getAPIBaseURL(): string {
  const prodUrl = 'https://travel-social-backend.onrender.com/api';
  const localIp = 'http://192.168.100.209:5000/api';
  // Avoid runtime crashes in release when env resolution fails.
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL || getEnvVar('EXPO_PUBLIC_API_BASE_URL', '');

  if (__DEV__) {
    console.log('📡 [environment] EXPO_PUBLIC_API_BASE_URL from env:', envUrl || 'Not set');
    console.log('📡 [environment] Using Local IP Fallback:', localIp);
    // Force local IP in dev for now to bypass cache issues
    return envUrl || localIp || prodUrl;
  }

  return envUrl || prodUrl;
}

export default {
  FIREBASE_CONFIG,
  GOOGLE_MAPS_CONFIG,
  AGORA_CONFIG,
  APP_CONFIG,
  FEATURES,
  API_CONFIG,
  STORAGE_CONFIG,
  PAGINATION,
  DEFAULT_ASSETS,
  THEME,
  VALIDATION,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  CACHE_KEYS,
  STORAGE_KEYS,
};

