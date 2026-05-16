import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@/lib/storage';
import { 
  fetchMessages, 
  getOrCreateConversation, 
  getUserProfile, 
  sendMessage, 
  editMessage,
  deleteMessage,
  reactToMessage
} from '../lib/firebaseHelpers/index';
import { 
  subscribeToMessages, 
  sendTypingIndicator, 
  stopTypingIndicator, 
  subscribeToTyping,
  initializeSocket
} from '../src/_services/socketService';
import { 
  normalizeMessage, 
  mergeMessages, 
  createTempId, 
  getMessageId 
} from '../src/_services/dmHelpers';
import { apiService } from '../src/_services/apiService';

export function useDM(conversationIdParam: string | null, otherUserId: string | null, currentUserId: string | null, onMessageReceived?: (msg: any) => void) {
  const [conversationId, setConversationId] = useState<string | null>(conversationIdParam);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [skip, setSkip] = useState(0);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [conversationMeta, setConversationMeta] = useState<any | null>(null);

  const LIMIT = 40;
  const isNearBottomRef = useRef(true);
  const preloadKeyRef = useRef<string>('');
  const hasPreloadedMessagesRef = useRef<boolean>(false);

  // Initialize/Resolve Conversation
  useEffect(() => {
    if (!currentUserId || !otherUserId || conversationId) return;
    
    const resolveTimeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    getOrCreateConversation(currentUserId, otherUserId)
      .then((res) => {
        clearTimeout(resolveTimeout);
        if (res?.success && res.conversationId) {
          setConversationId(res.conversationId);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        clearTimeout(resolveTimeout);
        setLoading(false);
      });

    return () => clearTimeout(resolveTimeout);
  }, [currentUserId, otherUserId, conversationId]);

  // Global Safety Timeout for Loading
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      setLoading(false);
    }, 5000);
    return () => clearTimeout(t);
  }, [loading]);

  // Load Messages & Setup Socket
  useEffect(() => {
    if (!conversationId || !currentUserId) return;
    
    let cancelled = false;
    const cid = conversationId;
    const cacheKey = `messages_cache_${conversationId}`;

    setLoading(!hasPreloadedMessagesRef.current);
    
    const fetchAll = async () => {
      if (!conversationId && !otherUserId) return;
      
      try {
        // Strategy 1: Fetch by conversationId (if valid)
        const validId = (conversationId && conversationId !== 'null' && conversationId !== 'undefined') ? conversationId : null;
        let msgRes = validId ? await fetchMessages(validId) : null;
        
        // Strategy 2: Participant-based fetch (Always try if Strategy 1 yields nothing)
        if ((!msgRes?.success || !msgRes.messages?.length) && otherUserId && currentUserId) {
           console.log('[DM] Trying participant-based fallback for user:', otherUserId);
           const fallbackRes = await apiService.get(`/conversations/resolve/messages?otherUserId=${otherUserId}`);
           if (fallbackRes?.success) msgRes = fallbackRes;
        }

        if (!cancelled && msgRes?.success) {
          const incoming: any[] = Array.isArray(msgRes.messages) ? msgRes.messages : [];
          setMessages(incoming.map((m: any) => normalizeMessage(m)));
        }
      } catch (error) {
        console.error('[DM] Fetch error:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
      
      if (conversationId) {
        apiService.get(`/conversations/${conversationId}`).then(res => {
          if (!cancelled && res?.success) setConversationMeta(res.data);
        }).catch(() => {});
      }
    };

    fetchAll();

    const unsub = subscribeToMessages(conversationId, (msg) => {
      const incoming = normalizeMessage(msg);
      setMessages(prev => {
        const merged = mergeMessages(prev, [incoming]);
        AsyncStorage.setItem(cacheKey, JSON.stringify(merged.slice(0, 50))).catch(() => {});
        return merged;
      });
      if (onMessageReceived) onMessageReceived(incoming);
    });

    const unsubTyping = subscribeToTyping(conversationId, 
      (data) => { if (String(data.userId) === String(otherUserId)) setIsOtherTyping(true); },
      (data) => { if (String(data.userId) === String(otherUserId)) setIsOtherTyping(false); }
    );

    return () => {
      cancelled = true;
      unsub();
      unsubTyping();
    };
  }, [conversationId, currentUserId, otherUserId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !conversationId) return;
    setLoadingMore(true);
    try {
      const res = await fetchMessages(conversationId, { skip: skip + LIMIT, limit: LIMIT });
      const incoming = Array.isArray(res?.messages) ? res.messages : [];
      if (incoming.length > 0) {
        setMessages(prev => mergeMessages(prev, incoming));
        setSkip(prev => prev + LIMIT);
        setHasMore(res.pagination?.hasMore ?? incoming.length === LIMIT);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.warn('Load more error', e);
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, hasMore, loadingMore, skip]);

  return {
    conversationId,
    messages,
    loading,
    loadingMore,
    hasMore,
    isOtherTyping,
    conversationMeta,
    loadMore,
    clearMessages: () => setMessages([]),
    setLoading,
    setMessages,
    isNearBottomRef
  };
}
