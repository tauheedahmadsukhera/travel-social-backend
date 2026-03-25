/**
 * Safe ZeegoCloud Configuration with Error Handling
 * Handles native module loading gracefully
 */

export const ZEEGOCLOUD_CONFIG = {
  appID: Number(process.env.EXPO_PUBLIC_ZEGO_APP_ID || process.env.EXPO_PUBLIC_ZEEGOCLOUD_APP_ID || 0),
  appSign: String(process.env.EXPO_PUBLIC_ZEGO_APP_SIGN || process.env.EXPO_PUBLIC_ZEEGOCLOUD_APP_SIGN || ''),
  serverSecret: '',
  // Ensure config has proper defaults
  get settings() {
    return {
      autoInitSDK: true,
      enableLog: true,
    };
  },
};

/**
 * Safe wrapper to handle native module loading
 */
export const safeInitializeZegoCloud = async (): Promise<any> => {
  try {
    // Import dynamically to catch any native module errors
    const zegoModule = await import('@zegocloud/zego-uikit-prebuilt-live-streaming-rn');

    if (!zegoModule || !zegoModule.default) {
      console.warn('[ZegoCloud] UIKit not available, using fallback streaming service');
      return null;
    }

    console.log('[ZegoCloud] Initialized successfully');
    return zegoModule.default;
  } catch (error) {
    console.error('[ZegoCloud] Failed to initialize:', error);
    console.warn('[ZegoCloud] Falling back to basic streaming mode');
    return null;
  }
};

// Generate unique room ID for live stream
export const generateRoomId = (userId: string) => {
  if (!userId) userId = `anonymous_${Date.now()}`;
  return `live_${userId}_${Date.now()}`;
};

// Generate user ID for ZeegoCloud
export const generateUserId = (userId: string) => {
  return userId || `user_${Date.now()}`;
};

/**
 * Validate ZeegoCloud configuration
 */
export const validateZegoConfig = (): boolean => {
  if (!ZEEGOCLOUD_CONFIG.appID || typeof ZEEGOCLOUD_CONFIG.appID !== 'number') {
    console.error('[ZegoCloud] Invalid appID');
    return false;
  }
  
  if (!ZEEGOCLOUD_CONFIG.appSign || typeof ZEEGOCLOUD_CONFIG.appSign !== 'string') {
    console.error('[ZegoCloud] Invalid appSign');
    return false;
  }
  
  console.log('[ZegoCloud] Configuration is valid');
  return true;
};

console.log('[ZegoCloud] Config module loaded');
