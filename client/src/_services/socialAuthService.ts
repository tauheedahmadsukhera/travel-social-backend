import { authorize } from 'react-native-app-auth';
// @ts-ignore
import { tiktokConfig } from '../../legacy_config/tiktokAuth';
let SnapKit: any = null;
try {
  SnapKit = require('react-native-snapkit');
} catch (e) {
  SnapKit = null;
}

export async function signInWithTikTok(): Promise<any> {
  try {
    const result = await authorize(tiktokConfig);
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error };
  }
}

export async function signInWithSnapchat(): Promise<any> {
  if (!SnapKit) {
    return { success: false, error: 'SnapKit is not available in Expo managed workflow. Eject to bare workflow to use Snapchat login.' };
  }
  try {
    await SnapKit.init('fa1c26b3-f800-47f0-9497-70857642f682');
    const user = await SnapKit.login();
    return { success: true, ...user };
  } catch (error) {
    return { success: false, error };
  }
}

export async function handleSocialAuthResult(result: any, router: any): Promise<void> {
  if (result.success) {
    // Extract user info from TikTok/Snapchat result
    let uid = result.user?.id || result.uid || result.openId || result.sub || result.userId;
    let name = result.user?.displayName || result.user?.username || result.name || result.displayName || result.nickname || 'Unknown';
    let avatar = result.user?.avatar || result.user?.profileImage || result.avatar || result.picture || '';
    let provider = result.provider || (result.accessToken ? 'tiktok' : 'snapchat');

    // Create/update user in backend (no Firestore)
    try {
      // Backend API call to create or update user from social login
      await fetch('/api/auth/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, name, avatar, provider })
      });
    } catch (err) {
      console.error('Error saving user to backend:', err);
    }
    router.replace('/'); // Navigate to home or dashboard
  } else {
    // Show error message to user
    console.error('Social auth failed:', result.error);
  }
}

// Placeholder for Google/Apple sign-in
export async function signInWithGoogle(): Promise<any> { return { success: false }; }
export async function signInWithApple(): Promise<any> { return { success: false }; }

