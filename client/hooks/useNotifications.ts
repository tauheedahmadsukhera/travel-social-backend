import { useEffect, useState } from 'react';
import { notificationService, Notification } from '@/lib/notificationService';

export const useNotifications = (userId: string, pollInterval = 15000) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      const data = await notificationService.getNotifications(userId);
      setNotifications(data);
      
      // Count unread
      const unread = data.filter((n: Notification) => !n.read).length;
      setUnreadCount(unread);
      
      console.log('[useNotifications] Fetched', data.length, 'notifications, unread:', unread);
    } catch (err) {
      console.error('[useNotifications] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    const success = await notificationService.markAsRead(notificationId);
    if (success) {
      setNotifications(prev =>
        prev.map(n => n._id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  const markAllAsRead = async () => {
    const success = await notificationService.markAllAsRead();
    if (success) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    }
  };

  // Poll for notifications on interval
  useEffect(() => {
    if (!userId) return;

    // Initial fetch
    fetchNotifications();

    // Set up polling
    const interval = setInterval(fetchNotifications, pollInterval);

    return () => clearInterval(interval);
  }, [userId, pollInterval]);

  return {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead
  };
};
