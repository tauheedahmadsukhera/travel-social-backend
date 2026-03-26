import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from '@/src/_services/apiService';
import { API_BASE_URL } from '../api';
import {
  sendLiveComment as socketSendLiveComment,
  subscribeToLiveStream as socketSubscribeToLiveStream,
  subscribeToMessages as socketSubscribeToMessages
} from '@/src/_services/socketService';

import { getApps, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, User, updateProfile } from 'firebase/auth';
import { FIREBASE_CONFIG } from '../../config/environment';

// Initialize Firebase app and auth (avoid duplicate app crash)
let firebaseApp: any = null;
let auth: any = null;

try {
  firebaseApp = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
  auth = getAuth(firebaseApp);
} catch (error: any) {
  console.error('[firebaseHelpers/core] Firebase initialization failed:', error?.message || error);
}

function getRequiredAuth() {
  if (!auth) {
    throw new Error('Firebase auth is not configured. Please verify EXPO_PUBLIC_FIREBASE_* environment variables.');
  }
  return auth;
}

// Firebase auth + MongoDB storage
export async function signInWithEmailPassword(email: string, password: string): Promise<{ success: boolean; user?: any; error?: string }> {
  try {
    console.log('[signInWithEmailPassword] Firebase login:', email);
    const firebaseAuth = getRequiredAuth();

    // Step 1: Firebase authentication
    const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const firebaseUser = userCredential.user;

    // Step 2: Sync with backend (save to MongoDB)
    const response = await apiService.post('/auth/login-firebase', {
      firebaseUid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName || email.split('@')[0],
      avatar: firebaseUser.photoURL
    });

    if (response.success) {
      // Step 3: Store token
      await AsyncStorage.setItem('token', response.token);
      await AsyncStorage.setItem('userId', String(response.user?.id ?? firebaseUser.uid));
      await AsyncStorage.setItem('userEmail', firebaseUser.email || '');

      console.log('[signInWithEmailPassword] ✅ Firebase + MongoDB sync successful');
      return { success: true, user: firebaseUser };
    } else {
      console.error('[signInWithEmailPassword] ❌ MongoDB sync failed:', response.error);
      // Still return success since Firebase auth worked
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('userId');
      await AsyncStorage.removeItem('userEmail');
      try { await signOut(firebaseAuth); } catch (e) { }

      return { success: false, error: response.error || 'Login sync failed' };
    }
  } catch (error: any) {
    console.error('[signInWithEmailPassword] Firebase login error:', error.message);
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('userId');
    await AsyncStorage.removeItem('userEmail');
    try {
      if (auth) {
        await signOut(auth);
      }
    } catch (e) { }
    return { success: false, error: error.message };
  }
}

export async function registerWithEmailPassword(email: string, password: string, displayName?: string): Promise<{ success: boolean; user?: any; error?: string }> {
  try {
    console.log('[registerWithEmailPassword] Firebase register:', email);
    const firebaseAuth = getRequiredAuth();

    // Step 1: Firebase registration
    const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    const firebaseUser = userCredential.user;

    // Update profile
    if (displayName) {
      await updateProfile(firebaseUser, { displayName });
    }

    // Step 2: Sync with backend (save to MongoDB)
    let response = await apiService.post('/auth/register-firebase', {
      firebaseUid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: displayName || email.split('@')[0],
      avatar: firebaseUser.photoURL
    });

    if (!response.success) {
      response = await apiService.post('/auth/login-firebase', {
        firebaseUid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: displayName || email.split('@')[0],
        avatar: firebaseUser.photoURL
      });
    }

    if (response.success) {
      // Step 3: Store token
      await AsyncStorage.setItem('token', response.token);
      await AsyncStorage.setItem('userId', String(response.user?.id ?? firebaseUser.uid));
      await AsyncStorage.setItem('userEmail', firebaseUser.email || '');

      console.log('[registerWithEmailPassword] ✅ Firebase + MongoDB sync successful');
      return { success: true, user: firebaseUser };
    } else {
      console.error('[registerWithEmailPassword] ❌ MongoDB sync failed:', response.error);
      // Still return success since Firebase auth worked
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('userId');
      await AsyncStorage.removeItem('userEmail');
      try { await signOut(firebaseAuth); } catch (e) { }
      return { success: false, error: response.error || 'Signup sync failed' };
    }
  } catch (error: any) {
    console.error('[registerWithEmailPassword] Firebase register error:', error.message);
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('userId');
    await AsyncStorage.removeItem('userEmail');
    try {
      if (auth) {
        await signOut(auth);
      }
    } catch (e) { }
    return { success: false, error: error.message };
  }
}

export async function verifyToken(): Promise<{ success: boolean; user?: any; error?: string }> {
  try {
    const token = await AsyncStorage.getItem('token');
    if (!token) return { success: false, error: 'No token found' };

    // Verify token with backend
    const response = await apiService.post('/auth/verify', {});

    if (response.success) {
      return { success: true };
    } else {
      // Token expired, clear it
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('userId');
      await AsyncStorage.removeItem('userEmail');
      return { success: false, error: 'Token expired' };
    }
  } catch (error: any) {
    console.error('[verifyToken] Error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function signOutUser(): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[signOutUser] Logging out');

    // Sign out from Firebase
    try {
      if (auth) {
        await signOut(auth);
      }
    } catch (e) {
      console.warn('[signOutUser] Firebase signOut warning:', e);
    }

    // Notify backend about logout
    try {
      await apiService.post('/auth/logout', {});
    } catch (e) {
      console.warn('[signOutUser] Backend logout warning:', e);
    }

    // Clear AsyncStorage
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('userId');
    await AsyncStorage.removeItem('userEmail');

    console.log('[signOutUser] ✅ Logout successful');
    return { success: true };
  } catch (error: any) {
    console.error('[signOutUser] Error:', error.message);
    // Still clear local storage even if backend call fails
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('userId');
    await AsyncStorage.removeItem('userEmail');
    return { success: true };
  }
}

// ============= AUTHENTICATION =============

/**
 * Sign in user with Firebase then verify with backend
 */
export async function signInUser(email: string, password: string) {
  try {
    console.log('[signInUser] Attempting to sign in:', email);

    // Use Firebase auth service (which calls backend)
    const result = await signInWithEmailPassword(email, password);

    if (result.success) {
      console.log('[signInUser] ✅ Sign in successful');
      return { success: true, user: result.user };
    } else {
      console.error('[signInUser] ❌ Sign in failed:', result.error);
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error('[signInUser] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Sign up new user with Firebase then create in backend
 */
export async function signUpUser(email: string, password: string, displayName?: string) {
  try {
    console.log('[signUpUser] Attempting to register:', email);

    // Use Firebase auth service (which calls backend)
    const result = await registerWithEmailPassword(email, password, displayName);

    if (result.success) {
      console.log('[signUpUser] ✅ Registration successful');
      return { success: true, user: result.user };
    } else {
      console.error('[signUpUser] ❌ Registration failed:', result.error);
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error('[signUpUser] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser() {
  try {
    const userId = await AsyncStorage.getItem('userId');
    const token = await AsyncStorage.getItem('token');

    if (!userId || !token) {
      console.log('[getCurrentUser] No user found');
      return { success: false, error: 'No current user' };
    }

    // Verify token with backend
    const verifyResult = await verifyToken();

    if (verifyResult.success) {
      console.log('[getCurrentUser] ✅ User verified');
      return { success: true, user: verifyResult.user };
    } else {
      // Token invalid, clear storage
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('userId');
      console.log('[getCurrentUser] ⚠️ Token invalid, cleared storage');
      return { success: false, error: 'Token expired' };
    }
  } catch (error: any) {
    console.error('[getCurrentUser] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Sign out current user
 */
export async function logoutUser() {
  try {
    console.log('[logoutUser] Signing out');

    const result = await signOutUser();

    if (result.success) {
      console.log('[logoutUser] ✅ Sign out successful');
      return { success: true };
    } else {
      console.error('[logoutUser] ❌ Sign out failed:', result.error);
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error('[logoutUser] Error:', error);
    return { success: false, error: error.message };
  }
}

// Helper to get current user synchronously for component use
export function getCurrentUserSync() {
  // Note: This is async in nature but returns what we can
  // For truly sync access, you might need to refactor components
  return null; // Will be fetched properly via getCurrentUser
}

// Helper to check if user is approved follower
export async function isApprovedFollower(userId: string, checkUserId: string) {
  try {
    const res = await apiService.get(`/users/${userId}/followers/${checkUserId}`);
    return res?.isApproved || false;
  } catch (error) {
    return false;
  }
}

// Helper to get user highlights
export async function getUserHighlights(userId: string, requesterUserId?: string) {
  try {
    const params: any = {};
    if (requesterUserId) {
      params.requesterUserId = requesterUserId;
    }
    const res = await apiService.get(`/users/${userId}/highlights`, params);
    return { success: res?.success !== false, highlights: res?.data || [] };
  } catch (error: any) {
    return { success: false, highlights: [] };
  }
}

// Helper to get user stories
export async function getUserStories(userId: string, requesterUserId?: string) {
  try {
    const params: any = {};
    if (requesterUserId) {
      params.requesterUserId = requesterUserId;
    }
    const res = await apiService.get(`/users/${userId}/stories`, params);
    return { success: res?.success !== false, stories: res?.data || [] };
  } catch (error: any) {
    return { success: false, stories: [] };
  }
}

// Helper to get user sections sorted
export async function getUserSectionsSorted(userId: string, requesterUserId?: string) {
  try {
    const params: any = {};
    if (requesterUserId) {
      params.requesterUserId = requesterUserId;
    }
    const res = await apiService.get(`/users/${userId}/sections`, params);
    return res?.data || [];
  } catch (error) {
    return [];
  }
}

// Helper to get passport tickets
export async function getPassportTickets(userId: string) {
  try {
    if (!userId) {
      console.warn('⚠️ getPassportTickets called with no userId');
      return [];
    }
    const res = await apiService.get(`/users/${userId}/passport-tickets`);
    return res?.data || {};
  } catch (error) {
    return {};
  }
}

// Chat helpers
export async function fetchMessages(conversationId: string) {
  return apiService.getMessages(conversationId);
}

export async function sendMessage(conversationId: string, sender: string, text: string, recipientId?: string) {
  return apiService.post(`/conversations/${conversationId}/messages`, {
    sender,
    senderId: sender,
    text,
    recipientId
  });
}

export function getCurrentUid() {
  // Sync retrieval is not possible with AsyncStorage, returning null as fallback
  return null;
}

// ============= FOLLOW REQUESTS & NOTIFICATIONS =============
export async function sendFollowRequest(fromUserId: string, toUserId: string) {
  return apiService.post(`/users/${toUserId}/follow-request`, { from: fromUserId });
}

export async function rejectFollowRequest(privateUserId: string, requesterId: string) {
  return apiService.post(`/users/${privateUserId}/follow-request/reject`, { from: requesterId });
}

export async function addNotification(payload: any) {
  return apiService.post('/notifications', payload);
}

// ============= USER PROFILE =============
export async function updateUserProfile(uid: string, data: any) {
  try {
    const res = await apiService.patch(`/users/${uid}`, data);

    // Check response structure
    if (!res || !res.success) {
      console.error('[updateUserProfile] ❌ Backend error:', res?.error);
      return { success: false, error: res?.error || 'Failed to update profile' };
    }

    console.log('[updateUserProfile] ✅ Profile updated');
    return res;
  } catch (err: any) {
    console.error('[updateUserProfile] ❌ Error:', err.message);
    return { success: false, error: err.message };
  }
}

export async function toggleUserPrivacy(uid: string, isPrivate: boolean) {
  try {
    const res = await apiService.patch(`/users/${uid}/privacy`, { isPrivate });

    // Check if the backend response was successful
    if (!res || !res.success) {
      console.error('[toggleUserPrivacy] ❌ Backend error:', res?.error);
      return { success: false, error: res?.error || 'Failed to update privacy' };
    }

    console.log('[toggleUserPrivacy] ✅ Privacy updated:', isPrivate);
    return { success: true, isPrivate: res.data?.isPrivate ?? isPrivate };
  } catch (err: any) {
    console.error('[toggleUserPrivacy] ❌ Error:', err.message);
    return { success: false, error: err.message };
  }
}

// ============= MEDIA =============
export async function uploadMedia(uri: string, mediaType: 'image' | 'video' = 'image', path?: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    console.log(`[uploadMedia] 📤 Starting ${mediaType} upload from URI:`, uri);

    let base64Data: string = '';

    // Handle file:// URIs (Android/device) - Read as base64
    if (uri.startsWith('file://')) {
      console.log('[uploadImage] 📱 Detected file:// URI, reading as base64...');
      try {
        // Use legacy API which works better
        const FileSystemLegacy = require('expo-file-system/legacy');
        base64Data = await FileSystemLegacy.readAsStringAsync(uri, { encoding: 'base64' });
        console.log('[uploadImage] ✅ Read file as base64, length:', base64Data.length);
      } catch (legacyError: any) {
        console.error('[uploadImage] ⚠️  Legacy FileSystem error:', legacyError.message);
        // Try new FileSystem API
        try {
          console.log('[uploadImage] 🔄 Trying new FileSystem API...');
          const FileSystem = require('expo-file-system');
          base64Data = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
          console.log('[uploadImage] ✅ Read file as base64 (new API), length:', base64Data.length);
        } catch (newError: any) {
          console.error('[uploadImage] ❌ New FileSystem error:', newError.message);
          throw new Error(`Cannot read file: ${newError.message}`);
        }
      }
    } else if (uri.startsWith('http://') || uri.startsWith('https://')) {
      // Handle http(s):// URIs - fetch and convert to base64
      console.log('[uploadImage] 🌐 Detected http(s) URI, fetching and converting to base64...');
      try {
        const response = await fetch(uri);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        const reader = new FileReader();

        return new Promise((resolve) => {
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            console.log('[uploadImage] ✅ Converted remote image to base64, length:', base64.length);
            // Continue with upload
            uploadWithBase64(base64, mediaType, path).then(resolve);
          };
          reader.onerror = (err) => {
            resolve({ success: false, error: 'Failed to read remote image' });
          };
          reader.readAsDataURL(blob);
        });
      } catch (err: any) {
        console.error('[uploadImage] ❌ Remote image error:', err.message);
        throw err;
      }
    } else {
      throw new Error(`Unsupported URI format: ${uri}`);
    }

    // Upload with base64
    return uploadWithBase64(base64Data, mediaType, path);

  } catch (err: any) {
    console.error('[uploadMedia] ❌ Error:', err.message);
    console.error('[uploadMedia] ❌ Full error:', err);
    return { success: false, error: err.message };
  }
}

// Backward compatibility wrapper
export async function uploadImage(uri: string, path?: string) {
  return uploadMedia(uri, 'image', path);
}

// Helper function to upload using base64
async function uploadWithBase64(base64Data: string, mediaType: 'image' | 'video' = 'image', path?: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!base64Data) {
      throw new Error('No base64 data provided');
    }

    // Send as base64 string directly (backend supports this)
    const extension = mediaType === 'video' ? 'mp4' : 'jpg';
    const result = await apiService.post('/media/upload', {
      file: base64Data,
      fileName: `${mediaType}-${Date.now()}.${extension}`,
      mediaType: mediaType,
      path: path
    });

    console.log('[uploadImage] 📥 Full response received:', JSON.stringify(result).substring(0, 500));

    // Check if response has success flag
    if (!result?.success) {
      console.error('[uploadImage] ❌ Backend returned error:', result?.error || 'Unknown error');
      return { success: false, error: result?.error || 'Upload failed' };
    }

    // Handle nested response structure
    const url = result?.data?.url || result?.url || result?.secureUrl || result?.location;

    if (!url) {
      console.error('[uploadImage] ❌ No URL in response:', result);
      return { success: false, error: 'No URL returned from upload' };
    }

    console.log('[uploadImage] ✅ Upload successful:', url);
    return { success: true, url };
  } catch (err: any) {
    console.error('[uploadImage] ❌ Upload error:', err.message);
    return { success: false, error: err.message };
  }
}

async function uploadStoryMedia(uri: string, userId: string, mediaType: 'image' | 'video', onProgress?: (percent: number) => void): Promise<{ success: boolean; url?: string; error?: string; mediaType?: string; thumbnailUrl?: string }> {
  try {
    const endpointUrl = `${API_BASE_URL}/upload/story`;
    const token = await AsyncStorage.getItem('token');

    const safeType = mediaType === 'video' ? 'video' : 'image';
    const contentType = safeType === 'video' ? 'video/mp4' : 'image/jpeg';
    const fileName = safeType === 'video' ? `story-${Date.now()}.mp4` : `story-${Date.now()}.jpg`;

    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('mediaType', safeType);
    formData.append('file', { uri, name: fileName, type: contentType } as any);

    return await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', endpointUrl);

      xhr.setRequestHeader('Accept', 'application/json');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.onprogress = (event) => {
        if (!onProgress) return;
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.round((event.loaded * 100) / event.total);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        try {
          const raw = xhr.responseText || '';
          const json = raw ? JSON.parse(raw) : null;

          if (xhr.status < 200 || xhr.status >= 300) {
            resolve({ success: false, error: json?.error || `Upload failed (${xhr.status})` });
            return;
          }

          resolve(json);
        } catch (e: any) {
          if (xhr.status < 200 || xhr.status >= 300) {
            resolve({ success: false, error: `Upload failed (${xhr.status})` });
            return;
          }
          reject(new Error('Invalid upload response'));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Upload failed'));
      };

      xhr.send(formData as any);
    });
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteImage(path: string) {
  await apiService.delete('/media', { path });
  return { success: true };
}

// ============= CATEGORIES & SECTIONS =============
export const DEFAULT_CATEGORIES = [
  { name: 'Winter holidays', image: 'https://images.unsplash.com/photo-1519125323398-675f0ddb6308?w=400&h=400&fit=crop' },
  { name: 'Beach', image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=400&fit=crop' },
  { name: 'City life', image: 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=400&h=400&fit=crop' },
  { name: 'London', image: 'https://images.unsplash.com/photo-1465101046530-73398c7f28ca?w=400&h=400&fit=crop' },
  { name: 'Christmas', image: 'https://images.unsplash.com/photo-1519125323398-675f0ddb6308?w=400&h=400&fit=crop' },
];

export async function getCategories() {
  try {
    const res = await apiService.get('/categories');
    const categories = Array.isArray(res) ? res : res?.categories;
    return categories?.length ? categories : DEFAULT_CATEGORIES;
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

export async function getUserSections(userId: string, requesterId?: string) {
  const data = await apiService.get(`/users/${userId}/sections`, { requesterId });
  return { success: true, data: data?.sections || data || [] };
}

export async function addUserSection(userId: string, section: { name: string; postIds: string[]; coverImage?: string; visibility?: string; collaborators?: string[]; allowedGroups?: string[] }) {
  try {
    const res = await apiService.post(`/users/${userId}/sections`, section);
    // Unwrap response
    const sectionData = res?.data || res;
    return { success: true, sectionId: sectionData?._id || sectionData?.id, section: sectionData };
  } catch (error: any) {
    console.error('[addUserSection] Error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function updateUserSection(userId: string, sectionIdOrName: string, section: any, requesterId?: string) {
  try {
    const res = await apiService.put(`/users/${userId}/sections/${encodeURIComponent(sectionIdOrName)}`, { 
      ...section, 
      requesterId 
    });
    return { success: true, data: res?.data || res };
  } catch (error: any) {
    console.error('[updateUserSection] Error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function deleteUserSection(userId: string, sectionName: string) {
  await apiService.delete(`/users/${userId}/sections/${encodeURIComponent(sectionName)}`);
  return { success: true };
}

// ============= POSTS =============
export async function getLocationVisitCount(location: string): Promise<number> {
  if (!location) return 0;
  try {
    // Backend returns aggregated data: { _id: location, count: N }
    const res = await apiService.get('/posts/location-count');

    // Find matching location in the aggregated results
    if (res?.data && Array.isArray(res.data)) {
      const locationData = res.data.find((item: any) =>
        item._id?.toLowerCase() === location.toLowerCase()
      );
      if (locationData?.count) {
        return locationData.count;
      }
    }

    return 0;
  } catch (err) {
    console.warn('[getLocationVisitCount] Error:', err);
    return 0;
  }
}

export async function getAllPosts(limitCount: number = 50) {
  try {
    const posts = await apiService.get('/posts', { limit: limitCount });
    const data = posts?.data || posts || [];
    return { success: true, posts: data, data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load posts', posts: [], data: [] };
  }
}

export async function createPost(
  userId: string,
  mediaUris: string[],
  caption: string,
  location?: string,
  mediaType: 'image' | 'video' = 'image',
  locationData?: { name: string; address: string; placeId?: string; neighborhood?: string; city?: string; country?: string; countryCode?: string; lat?: number; lon?: number; verified?: boolean },
  taggedUserIds?: string[],
  category?: string,
  hashtags?: string[],
  mentions?: string[],
  visibility: string = 'Everyone',
  allowedFollowers: string[] = [],
  postType: string = 'post'
) {
  try {
    const normalizeLocationKey = (val: any) => String(val || '').trim().toLowerCase();
    const uniqueLocationKeys = (keys: any[]) => {
      const out: string[] = [];
      const seen = new Set<string>();
      for (const k of Array.isArray(keys) ? keys : []) {
        const n = normalizeLocationKey(k);
        if (!n) continue;
        if (seen.has(n)) continue;
        seen.add(n);
        out.push(n);
      }
      return out;
    };

    const buildLocationKeys = () => {
      const keys: any[] = [];
      if (locationData) {
        keys.push(locationData.name);
        keys.push(locationData.neighborhood);
        keys.push(locationData.city);
        keys.push(locationData.country);
        keys.push(locationData.countryCode);

        const addr = typeof locationData.address === 'string' ? locationData.address : '';
        if (addr) {
          const parts = addr.split(',').map(p => p.trim()).filter(Boolean);
          if (parts.length >= 1) keys.push(parts[0]);
          if (parts.length >= 2) keys.push(parts[1]);
          if (parts.length >= 1) keys.push(parts[parts.length - 1]);
        }
      }
      keys.push(location);

      const normalized = uniqueLocationKeys(keys);
      const countryCode = normalizeLocationKey(locationData && locationData.countryCode);
      const country = normalizeLocationKey(locationData && locationData.country);
      if (countryCode === 'gb' || country === 'uk' || country === 'united kingdom') {
        if (!normalized.includes('uk')) normalized.push('uk');
        if (!normalized.includes('united kingdom')) normalized.push('united kingdom');
      }
      return uniqueLocationKeys(normalized);
    };

    const mediaUrls = [];
    for (const uri of mediaUris || []) {
      const upload = await uploadMedia(uri, mediaType);
      if (!upload?.url) throw new Error(upload?.error || 'Upload failed');
      mediaUrls.push(upload.url);
    }

    const locationKeys = buildLocationKeys();

    const payload = {
      userId,
      content: caption || ' ',  // Backend expects 'content' field (use space if empty)
      caption: caption || ' ',  // Also send caption for compatibility
      location,
      locationData,
      locationKeys,
      mediaType,
      mediaUrls,
      category,
      hashtags,
      mentions,
      taggedUserIds,
      visibility,
      type: postType,
      allowedFollowers: allowedFollowers.length > 0 ? allowedFollowers : undefined,
      isPrivate: allowedFollowers.length > 0,  // mark as private when group is selected
    };

    console.log('[createPost] Posting to /posts with payload:', payload);
    const res = await apiService.post('/posts', payload);

    console.log('[createPost] Full response:', JSON.stringify(res, null, 2));

    // Handle nested response - check all possible locations
    const postId = res?.data?._id || res?.data?.postId || res?.data?.id ||
      res?.postId || res?._id || res?.id ||
      res?.data?.data?._id || res?.data?.data?.id;

    if (!postId) {
      console.error('[createPost] ❌ No postId in response. Full response:', JSON.stringify(res, null, 2));
      // Still return success if we got a 200/201 response
      if (res?.status === 200 || res?.status === 201 || res?.success) {
        console.warn('[createPost] ⚠️ Post likely created but no ID returned');
        return { success: true, postId: 'unknown' };
      }
      throw new Error('No postId returned from server');
    }

    console.log('[createPost] ✅ Post created with ID:', postId);
    return { success: true, postId };
  } catch (err: any) {
    console.error('[createPost] ❌ Error:', err.message);
    throw err;
  }
}

export async function getUserPosts(userId: string) {
  const posts = await apiService.get(`/users/${userId}/posts`);
  return { success: true, data: posts?.data || posts || [] };
}

export async function getFeedPosts(limitCount: number = 20) {
  const posts = await apiService.get('/feed', { limit: limitCount });
  const data = posts?.posts || posts?.data || posts || [];
  return { success: true, posts: data, data };
}

export async function likePost(postId: string, userId: string) {
  await apiService.post(`/posts/${postId}/like`, { userId });
  return { success: true };
}

export async function unlikePost(postId: string, userId: string) {
  await apiService.delete(`/posts/${postId}/like`, { userId });
  return { success: true };
}

export async function deletePost(postId: string, currentUserId?: string) {
  try {
    const res = await apiService.delete(`/posts/${postId}`, { currentUserId });

    // Check if the backend response specifically indicates success
    if (res && res.success) {
      console.log(`[deletePost] ✅ Post ${postId} deleted successfully from backend`);
      return { success: true };
    } else {
      console.error(`[deletePost] ❌ Backend deletion failed:`, res?.error || 'Unknown error');
      return { success: false, error: res?.error || 'Failed to delete post from server' };
    }
  } catch (error: any) {
    console.error(`[deletePost] ❌ Request error:`, error.message);
    return { success: false, error: error.message || 'Failed to delete post' };
  }
}

// ============= COMMENTS =============
export async function addComment(postId: string, userId: string, userName: string, userAvatar: string, text: string) {
  try {
    const res = await apiService.post(`/posts/${postId}/comments`, { userId, userName, userAvatar, text });
    const commentId = res?.data?._id || res?.id || res?._id || res?.commentId;

    console.log('[addComment] ✅ Comment added:', commentId);
    return { success: true, id: commentId };
  } catch (err: any) {
    console.error('[addComment] ❌ Error:', err.message);
    return { success: false, error: err.message };
  }
}

export async function likeComment(postId: string, commentId: string, userId: string) {
  await apiService.post(`/posts/${postId}/comments/${commentId}/like`, { userId });
  return { success: true };
}

export async function unlikeComment(postId: string, commentId: string, userId: string) {
  await apiService.delete(`/posts/${postId}/comments/${commentId}/like`, { userId });
  return { success: true };
}

export async function getPostComments(postId: string) {
  try {
    const res = await apiService.get(`/posts/${postId}/comments`);
    const comments = res?.data || res?.comments || [];
    console.log('[getPostComments] ✅ Loaded', comments.length, 'comments for post:', postId);
    return { success: true, data: comments };
  } catch (err: any) {
    console.error('[getPostComments] ❌ Error:', err.message);
    return { success: true, data: [] };
  }
}

export async function deleteComment(postId: string, commentId: string) {
  await apiService.delete(`/posts/${postId}/comments/${commentId}`);
  return { success: true };
}

export async function editComment(postId: string, commentId: string, newText: string) {
  await apiService.put(`/posts/${postId}/comments/${commentId}`, { text: newText });
  return { success: true };
}

export async function addCommentReply(postId: string, parentCommentId: string, reply: any) {
  await apiService.post(`/posts/${postId}/comments/${parentCommentId}/replies`, reply);
  return { success: true };
}

// ============= STORIES =============
export async function createStory(
  userId: string,
  mediaUri: string,
  mediaType: 'image' | 'video' = 'image',
  locationData?: { name?: string; address?: string; placeId?: string },
  onProgress?: (percent: number) => void
) {
  let mediaUrl: string | undefined;
  let thumbnailUrl: string | undefined;

  if (typeof mediaUri === 'string' && (mediaUri.startsWith('http://') || mediaUri.startsWith('https://'))) {
    mediaUrl = mediaUri;
  } else if (mediaType === 'video' || typeof onProgress === 'function') {
    const uploadRes = await uploadStoryMedia(mediaUri, userId, mediaType, (p) => {
      if (!onProgress) return;
      const clamped = Math.max(0, Math.min(100, p));
      onProgress(Math.min(95, clamped));
    });
    if (!uploadRes?.success || !uploadRes?.url) {
      throw new Error(uploadRes?.error || 'Upload failed');
    }
    mediaUrl = uploadRes.url;
    thumbnailUrl = uploadRes.thumbnailUrl;
  } else {
    const upload = await uploadImage(mediaUri);
    if (!upload?.url) throw new Error(upload?.error || 'Upload failed');
    mediaUrl = upload.url;
  }

  // Get user's actual name
  let userName = 'Anonymous';
  try {
    console.log('[createStory] Fetching profile for userId:', userId);
    const userProfileRes: any = await apiService.get(`/users/${userId}`);
    console.log('[createStory] User profile result:', userProfileRes);
    if (userProfileRes?.success && userProfileRes?.data) {
      if (userProfileRes.data.displayName) {
        userName = userProfileRes.data.displayName;
        console.log('[createStory] Using displayName:', userName);
      } else if (userProfileRes.data.name) {
        userName = userProfileRes.data.name;
        console.log('[createStory] Using name:', userName);
      } else if (userProfileRes.data.userName) {
        userName = userProfileRes.data.userName;
        console.log('[createStory] Using userName:', userName);
      }
    }
  } catch (err) {
    console.log('[createStory] Could not fetch user profile for name:', err);
  }

  console.log('[createStory] Final userName to send:', userName);

  if (typeof onProgress === 'function') {
    onProgress(97);
  }

  const res = await apiService.post('/stories', { userId, userName, mediaUrl: mediaUrl, mediaType, locationData, thumbnailUrl });

  // Unwrap API response
  const storyData = res?.data || res;

  return {
    success: true,
    storyId: storyData?._id || storyData?.id || storyData?.storyId,
    story: storyData
  };
}

export async function getActiveStories() {
  const res = await apiService.get('/stories/active');
  const stories = res?.stories || res?.data || res || [];
  return { success: true, stories };
}

// ============= LIVE STREAMING (REST stubs) =============
export async function getActiveLiveStreams() {
  try {
    const res = await apiService.get('/live-streams');
    return res?.streams || res?.data || res || [];
  } catch {
    return [];
  }
}

export async function joinLiveStream(streamId: string, userId: string) {
  await apiService.post(`/live-streams/${streamId}/join`, { userId });
  return { success: true };
}

export async function leaveLiveStream(streamId: string, userId: string) {
  await apiService.post(`/live-streams/${streamId}/leave`, { userId });
  return { success: true };
}

// Real-time listeners to be replaced by WebSockets later
export function subscribeToMessages(conversationId: string, onMessage: (msg: any) => void) {
  return socketSubscribeToMessages(conversationId, onMessage);
}

export function subscribeToLiveStream(streamId: string, onUserJoined: (data: any) => void, onUserLeft: (data: any) => void, onLiveComment: (comment: any) => void) {
  return socketSubscribeToLiveStream(streamId, onUserJoined, onUserLeft, onLiveComment);
}

export function sendLiveComment(streamId: string, comment: any) {
  return socketSendLiveComment(streamId, comment);
}

export async function addLikedStatusToPosts(posts: any[], userId: string) {
  try {
    return (posts || []).map(post => ({
      ...post,
      liked: Array.isArray(post?.likes) ? post.likes.includes(userId) : false,
      likesCount: post?.likesCount || 0,
      commentsCount: post?.commentsCount || 0,
    }));
  } catch {
    return posts;
  }
}

export default {
  signInUser: signInWithEmailPassword,
  signUpUser: registerWithEmailPassword,
  getCurrentUser,
  getCurrentUserSync,
  getCurrentUid,
  isApprovedFollower,
  getUserHighlights,
  getUserStories,
  getUserSectionsSorted,
  getPassportTickets,
  sendFollowRequest,
  rejectFollowRequest,
  addNotification,
  updateUserProfile,
  uploadImage,
  deleteImage,
  getCategories,
  getUserSections,
  addUserSection,
  updateUserSection,
  deleteUserSection,
  getLocationVisitCount,
  getAllPosts,
  createPost,
  getUserPosts,
  getFeedPosts,
  likePost,
  unlikePost,
  deletePost,
  addComment,
  likeComment,
  unlikeComment,
  getPostComments,
  deleteComment,
  editComment,
  addCommentReply,
  createStory,
  getActiveStories,
  getActiveLiveStreams,
  joinLiveStream,
  leaveLiveStream,
  subscribeToMessages,
  subscribeToLiveStream,
  addLikedStatusToPosts,
  getRegions,
  searchUsers,
  fetchMessages,
  sendMessage,
  uploadMedia,
  toggleUserPrivacy,
};

// ============= SEARCH & REGIONS =============
export async function getRegions() {
  try {
    // Return static regions with local names that will be mapped to assets
    const regions = [
      // COUNTRIES
      { id: 'us', name: 'United States', image: 'Unitedstates' },
      { id: 'france', name: 'France', image: 'France' },
      { id: 'uk', name: 'United Kingdom', image: 'UnitedKingdom' },
      // REGIONS
      { id: 'america', name: 'America', image: 'America' },
      { id: 'europe', name: 'Europe', image: 'Europe' },
      { id: 'japan', name: 'Japan', image: 'Japan' },
      // CITIES
      { id: 'london', name: 'London', image: 'London' },
      { id: 'paris', name: 'Paris', image: 'Paris' },
      { id: 'newyork', name: 'New York', image: 'New York' },
    ];
    return { success: true, data: regions };
  } catch (error) {
    console.error('Error fetching regions:', error);
    return { success: false, data: [] };
  }
}

export async function searchUsers(query: string, limit: number = 20) {
  try {
    const response = await apiService.get('/users/search', { params: { q: query, limit } });
    console.log('[searchUsers] Response:', response);

    // Handle nested response structure
    if (response && response.success !== false && Array.isArray(response.data)) {
      return { success: true, data: response.data };
    }
    if (response && Array.isArray(response)) {
      return { success: true, data: response };
    }

    console.warn('[searchUsers] Unexpected response format:', response);
    return { success: false, data: [] };
  } catch (error) {
    console.error('[searchUsers] Error:', error);
    return { success: false, data: [] };
  }
}
