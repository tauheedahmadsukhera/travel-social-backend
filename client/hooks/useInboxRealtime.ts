import { useEffect, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@/lib/storage';
import { apiService } from '@/src/_services/apiService';
import { getSocket, initializeSocket } from '@/src/_services/socketService';

export function useInboxRealtime(userId: string | null) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const cacheKey = userId ? `inboxConversationsCache_v2_${userId}` : null;

  const fetchConversations = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await apiService.get(`/conversations?userId=${userId}`);
      let convos = response?.data;
      if (!response?.success) convos = [];
      if (!Array.isArray(convos)) convos = [];
      
      setConversations(convos);
      setError(null);
      setReady(true);
      setLoading(false);

      if (cacheKey) {
        AsyncStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: convos })).catch(() => {});
      }
    } catch (err: any) {
      console.error('❌ Failed to fetch conversations:', err);
      setError(err.message || 'Failed to load conversations');
      setLoading(false);
      setReady(true);
    }
  }, [userId, cacheKey]);

  // Warm start from cache
  useEffect(() => {
    if (!cacheKey) return;
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const data = parsed?.data;
        if (!Array.isArray(data) || data.length === 0) return;
        if (!mounted) return;
        setConversations(data);
        setLoading(false);
        setReady(true);
      } catch { }
    })();
    return () => { mounted = false; };
  }, [cacheKey]);

  // Main Socket Connection & Fetch Logic
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setReady(false);
      return;
    }

    let isMounted = true;
    
    // Initial fetch
    fetchConversations();

    // Initialize Socket.io listener
    initializeSocket(userId).then((socket) => {
      if (!isMounted) return;

      const handleNewMessage = () => {
        // Refresh conversations when a new message is received globally
        fetchConversations();
      };

      // Listen for any new messages
      socket.on('newMessage', handleNewMessage);
      socket.on('messageRead', handleNewMessage); // Update unread counts
      
      // Cleanup
      return () => {
        socket.off('newMessage', handleNewMessage);
        socket.off('messageRead', handleNewMessage);
      };
    });

    // Handle AppState changes (Foreground refresh)
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        fetchConversations();
        const socket = getSocket();
        if (socket && socket.disconnected) {
          socket.connect();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Emergency Timeout
    const emergencyTimeout = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearTimeout(emergencyTimeout);
      subscription.remove();
      
      const socket = getSocket();
      if (socket) {
        socket.off('newMessage');
        socket.off('messageRead');
      }
    };
  }, [userId, fetchConversations]);

  return { conversations, loading, error, ready, refresh: fetchConversations };
}
