import { apiService } from '@/src/_services/apiService';

/**
 * Get a post by its ID
 */
export async function getPostById(postId: string) {
  try {
    const data = await apiService.get(`/posts/${postId}`);
    return data;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Like a post
 */
export async function likePost(postId: string, userId: string) {
  try {
    console.log('[Post API] likePost - postId:', postId, 'userId:', userId);
    const data = await apiService.post(`/posts/${postId}/like`, { userId });
    console.log('[Post API] likePost response:', data);
    return data;
  } catch (error: any) {
    console.error('[Post API] likePost error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Unlike a post
 */
export async function unlikePost(postId: string, userId: string) {
  try {
    console.log('[Post API] unlikePost - postId:', postId, 'userId:', userId);
    const data = await apiService.delete(`/posts/${postId}/like`, { userId });
    console.log('[Post API] unlikePost response:', data);
    return data;
  } catch (error: any) {
    console.error('[Post API] unlikePost error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * React to a post with an emoji
 */
export async function reactToPost(postId: string, userId: string, userName: string, userAvatar: string, emoji: string) {
  try {
    console.log('[Post API] reactToPost - postId:', postId, 'userId:', userId, 'emoji:', emoji);
    const data = await apiService.post(`/posts/${postId}/react`, { userId, userName, userAvatar, emoji });
    console.log('[Post API] reactToPost response:', data);
    return data;
  } catch (error: any) {
    console.error('[Post API] reactToPost error:', error);
    return { success: false, error: error.message };
  }
}
