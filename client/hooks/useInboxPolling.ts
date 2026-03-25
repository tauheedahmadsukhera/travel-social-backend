/**
 * useInboxPolling Hook
 * Replaces real-time listeners with efficient polling
 * 
 * Usage:
 * const { conversations, loading, error } = useInboxPolling(userId);
 */

import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { startConversationsPolling, startMessagesPolling, stopPolling } from '../lib/pollingService';
import { getCachedUserProfile, cacheUserProfile } from '../lib/redisCache';

interface UseInboxPollingOptions {
  pollingInterval?: number;
  autoStart?: boolean;
}

export function useInboxPolling(
  userId: string | null,
  options: UseInboxPollingOptions = {}
) {
  const { pollingInterval = 3000, autoStart = true } = options; // 3 seconds instead of 15

  console.log('🟡 useInboxPolling INIT: userId=', userId, 'autoStart=', autoStart, 'pollingInterval=', pollingInterval);

  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appState, setAppState] = useState<AppStateStatus>('active');


  useEffect(() => {
    if (!userId || !autoStart) {
      console.log('🟡 useInboxPolling SKIP: userId or autoStart false');
      setLoading(false);
      return;
    }

    console.log('🟡 useInboxPolling STARTING for userId:', userId);

    // Subscribe to app state changes
    const subscription = AppState.addEventListener('change', setAppState);

    let unsubscribeFn: (() => void) | null = null;
    let isMounted = true;
    let loadingEnded = false;

    // Start polling when app is active
    if (appState === 'active') {
      console.log(`📱 Starting inbox polling for user: ${userId}`);
      
      startConversationsPolling(
        userId,
        (data) => {
          console.log('🟢 CALLBACK FIRED: received', data.length, 'conversations');
          if (!isMounted) return;

          // Always update conversations on every poll so inbox stays fresh.
          setConversations(data);

          // Only use loadingEnded to stop the initial loading spinner.
          if (!loadingEnded) {
            loadingEnded = true;
            setLoading(false);
          }

          setError(null);
        },
        pollingInterval
      ).then(unsub => {
        console.log('🟢 startConversationsPolling RESOLVED');
        if (isMounted) {
          unsubscribeFn = unsub;
        }
      }).catch((err) => {
        console.error('❌ Failed to start polling:', err);
        // Even if polling fails, stop showing loading
        if (isMounted && !loadingEnded) {
          loadingEnded = true;
          setLoading(false);
          setError(err.message || 'Failed to load conversations');
          setConversations([]); // Show empty state
        }
      });
    } else {
      // Stop polling when app goes to background
      console.log('📵 Stopping inbox polling - app backgrounded');
      stopPolling(`conversations-${userId}`);
    }

    // EMERGENCY TIMEOUT: Force loading off after 3 seconds NO MATTER WHAT
    const emergencyTimeout = setTimeout(() => {
      if (isMounted && !loadingEnded) {
        console.warn('🔴 EMERGENCY TIMEOUT: Force loading off after 3s');
        loadingEnded = true;
        setLoading(false);
        if (!error) setError(null);
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearTimeout(emergencyTimeout);
      if (unsubscribeFn) {
        console.log('🧹 Cleaning up inbox polling');
        unsubscribeFn();
      }
      subscription.remove();
    };
  }, [userId, autoStart, pollingInterval, appState]);

  return { conversations, loading, error };
}

/**
 * useMessagesPolling Hook
 * Polls for new messages in a conversation
 */
interface UseMessagesPollingOptions {
  pollingInterval?: number;
  enabled?: boolean;
}

export function useMessagesPolling(
  conversationId: string | null,
  options: UseMessagesPollingOptions = {}
) {
  const { pollingInterval = 8000, enabled = true } = options;

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    if (!conversationId || !enabled) return;

    let unsubscribeFn: (() => void) | null = null;
    let isMounted = true;

    startMessagesPolling(
      conversationId,
      (data) => {
        if (!isMounted) return;
        setMessages(data);
        setLoading(false);
        setError(null);
      },
      pollingInterval
    ).then(unsub => {
      unsubscribeFn = unsub;
    }).catch((err) => {
      if (isMounted) {
        setLoading(false);
        setError(err.message || 'Failed to load messages');
      }
    });

    // Timeout to prevent infinite loading - max 5 seconds
    const timeoutId = setTimeout(() => {
      if (isMounted && loading) {
        console.warn('⏱️ Messages polling timeout - forcing loading off');
        setLoading(false);
      }
    }, 5000);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      if (unsubscribeFn) unsubscribeFn();
    };
  }, [conversationId, enabled, pollingInterval]);

  return { messages, loading, error };
}

/**
 * Optimized hook for fetching user profiles with cache
 */
export function useUserProfileOptimized(userId: string | null) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    (async () => {
      // Try cache first
      const cached = await getCachedUserProfile(userId);
      if (cached) {
        setProfile(cached);
        setLoading(false);
        return;
      }

      // Fall back to Firebase
      try {
        const { getUserProfile } = await import('../lib/firebaseHelpers/user');
        const result = await getUserProfile(userId);
        if (result && result.success && result.data) {
          // Cache the profile
          await cacheUserProfile(userId, result.data);
          setProfile(result.data);
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  return { profile, loading };
}
