import { apiService } from '@/src/_services/apiService';

export interface Notification {
  _id: string;
  recipientId: string;
  senderId: string;
  type:
    | 'like'
    | 'comment'
    | 'follow'
    | 'follow-request'
    | 'follow-approved'
    | 'new-follower'
    | 'mention'
    | 'tag'
    | 'message'
    | 'dm'
    | 'story'
    | 'story-mention'
    | 'story-reply'
    | 'live';
  postId?: string;
  commentId?: string;
  storyId?: string;
  streamId?: string;
  conversationId?: string;
  senderName?: string;
  senderAvatar?: string;
  message: string;
  read: boolean;
  createdAt: string;
  readAt?: string;
}

export const notificationService = {
  // Get user notifications
  async getNotifications(userId: string, limit = 50, skip = 0): Promise<Notification[]> {
    try {
      const response = await apiService.get(`/notifications/${userId}`, { params: { limit, skip } });
      console.log('[notificationService] Fetched', response?.data?.length || 0, 'notifications');
      return response?.data || [];
    } catch (err) {
      console.error('[notificationService] Error fetching notifications:', err);
      return [];
    }
  },

  // Create notification (for likes, comments, follows)
  async createNotification(
    recipientId: string,
    senderId: string,
    type: 'like' | 'comment' | 'follow' | 'mention',
    postId?: string,
    message?: string
  ): Promise<Notification | null> {
    try {
      const response = await apiService.post('/notifications', {
        recipientId,
        type,
        postId,
        message
      });
      console.log('[notificationService] Created', type, 'notification');
      return response?.data || null;
    } catch (err) {
      console.error('[notificationService] Error creating notification:', err);
      return null;
    }
  },

  // Mark notification as read
  async markAsRead(notificationId: string): Promise<boolean> {
    try {
      await apiService.patch(`/notifications/${notificationId}/read`);
      console.log('[notificationService] Marked notification as read:', notificationId);
      return true;
    } catch (err) {
      console.error('[notificationService] Error marking as read:', err);
      return false;
    }
  },

  async markAllAsRead(): Promise<boolean> {
    try {
      await apiService.patch('/notifications/read-all');
      console.log('[notificationService] Marked all notifications as read');
      return true;
    } catch (err) {
      console.error('[notificationService] Error marking all as read:', err);
      return false;
    }
  },

  // Send like notification
  async notifyLike(postOwnerId: string, likerId: string, postId: string) {
    return this.createNotification(
      postOwnerId,
      likerId,
      'like',
      postId,
      'liked your post'
    );
  },

  // Send comment notification
  async notifyComment(postOwnerId: string, commenterId: string, postId: string) {
    return this.createNotification(
      postOwnerId,
      commenterId,
      'comment',
      postId,
      'commented on your post'
    );
  },

  // Send follow notification
  async notifyFollow(followedUserId: string, followerId: string) {
    return this.createNotification(
      followedUserId,
      followerId,
      'follow',
      undefined,
      'started following you'
    );
  }
};
