/**
 * Backend Wake-up Service
 * 
 * Handles Render.com cold start issues by:
 * 1. Pinging backend on app start
 * 2. Showing loading state during wake-up
 * 3. Retrying failed requests
 */

let isWakingUp = false;
let isBackendReady = false;
let wakeupPromise: Promise<boolean> | null = null;

let getAPIBaseURL: any = () => 'http://localhost:3000/api';

// Safely load environment config
try {
  const envModule = require('../../config/environment');
  getAPIBaseURL = envModule.getAPIBaseURL || (() => 'http://localhost:3000/api');
} catch (e) {
  console.warn('[BackendWakeup] Failed to load environment config, using default:', e);
}

/**
 * Check if backend is awake and responsive
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const API_BASE = getAPIBaseURL();
    console.log('[BackendWakeup] Checking health:', API_BASE);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const response = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      console.log('[BackendWakeup] Backend is healthy:', data);
      isBackendReady = true;
      return true;
    }
    
    return false;
  } catch (error: any) {
    console.warn('[BackendWakeup] Health check failed:', error.message);
    return false;
  }
}

/**
 * Wake up backend if it's sleeping (Render.com cold start)
 * Returns true if backend is ready, false if still waking up
 */
export async function wakeupBackend(): Promise<boolean> {
  // If already ready, return immediately
  if (isBackendReady) {
    return true;
  }
  
  // If already waking up, wait for existing promise
  if (isWakingUp && wakeupPromise) {
    return wakeupPromise;
  }
  
  // Start wake-up process
  isWakingUp = true;
  console.log('[BackendWakeup] Starting backend wake-up...');
  
  wakeupPromise = (async () => {
    const maxAttempts = 6; // 6 attempts = ~60 seconds max
    const delayBetweenAttempts = 10000; // 10 seconds
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[BackendWakeup] Attempt ${attempt}/${maxAttempts}...`);
      
      const isHealthy = await checkBackendHealth();
      
      if (isHealthy) {
        console.log('[BackendWakeup] ✅ Backend is ready!');
        isWakingUp = false;
        isBackendReady = true;
        return true;
      }
      
      if (attempt < maxAttempts) {
        console.log(`[BackendWakeup] Backend not ready, waiting ${delayBetweenAttempts/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
      }
    }
    
    console.warn('[BackendWakeup] ⚠️ Backend did not respond after', maxAttempts, 'attempts');
    isWakingUp = false;
    return false;
  })();
  
  return wakeupPromise;
}

/**
 * Get backend status
 */
export function getBackendStatus() {
  return {
    isReady: isBackendReady,
    isWakingUp: isWakingUp,
  };
}

/**
 * Reset backend status (for testing)
 */
export function resetBackendStatus() {
  isBackendReady = false;
  isWakingUp = false;
  wakeupPromise = null;
}

/**
 * Initialize backend on app start
 * Call this in _layout.tsx or app entry point
 */
export async function initializeBackend() {
  console.log('[BackendWakeup] Initializing backend...');
  
  // Try quick health check first
  const isHealthy = await checkBackendHealth();
  
  if (isHealthy) {
    console.log('[BackendWakeup] Backend already ready');
    return true;
  }
  
  // If not healthy, start wake-up process in background
  console.log('[BackendWakeup] Backend sleeping, starting wake-up...');
  wakeupBackend(); // Don't await - let it run in background
  
  return false;
}

