import axios from 'axios';
import { BACKEND_URL } from '@/lib/api';

const API_URL = `${BACKEND_URL}/api/users`;

export const userService = {
  // Block a user
  async blockUser(userId: string, blockUserId: string): Promise<boolean> {
    try {
      const response = await axios.put(
        `${API_URL}/${userId}/block/${blockUserId}`
      );
      console.log('[userService] Blocked user:', blockUserId);
      return response.data.success;
    } catch (err) {
      console.error('[userService] Error blocking user:', err);
      return false;
    }
  },

  // Unblock a user
  async unblockUser(userId: string, blockUserId: string): Promise<boolean> {
    try {
      const response = await axios.delete(
        `${API_URL}/${userId}/block/${blockUserId}`
      );
      console.log('[userService] Unblocked user:', blockUserId);
      return response.data.success;
    } catch (err) {
      console.error('[userService] Error unblocking user:', err);
      return false;
    }
  },

  // Report a user
  async reportUser(
    userId: string,
    reporterId: string,
    reason: string,
    details?: string
  ): Promise<boolean> {
    try {
      const response = await axios.post(
        `${API_URL}/${userId}/report`,
        { reporterId, reason, details }
      );
      console.log('[userService] Reported user:', userId);
      return response.data.success;
    } catch (err) {
      console.error('[userService] Error reporting user:', err);
      return false;
    }
  },

  // Get shareable profile URL
  async getProfileUrl(userId: string): Promise<string | null> {
    try {
      const response = await axios.get(
        `${API_URL}/${userId}/profile-url`
      );
      console.log('[userService] Generated profile URL');
      return response.data.data?.profileUrl || null;
    } catch (err) {
      console.error('[userService] Error getting profile URL:', err);
      return null;
    }
  },

  // Get blocked users
  async getBlockedUsers(userId: string): Promise<any[]> {
    try {
      const response = await axios.get(`${API_URL}/${userId}/blocked`);
      return response.data.success ? response.data.data : [];
    } catch (err) {
      console.error('[userService] Error getting blocked users:', err);
      return [];
    }
  },

  // Report a post
  async reportPost(
    postId: string,
    userId: string,
    reason: string,
    details?: string
  ): Promise<boolean> {
    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/posts/${postId}/report`,
        { userId, reason, details }
      );
      console.log('[userService] Reported post:', postId);
      return response.data.success;
    } catch (err) {
      console.error('[userService] Error reporting post:', err);
      return false;
    }
  }
};
