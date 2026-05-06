import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

export function useDM(conversationIdParam: string | null, otherUserId: string | null, currentUserId: string | null) {
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
    
    getOrCreateConversation(currentUserId, otherUserId)
      .then((res) => {
        if (res?.success && res?.conversationId) {
          setConversationId(res.conversationId);
        }
      });
  }, [currentUserId, otherUserId, conversationId]);

  // Load Messages & Setup Socket
  useEffect(() => {
    if (!conversationId || !currentUserId) return;
    
    let cancelled = false;
    const cid = conversationId;
    const cacheKey = `messages_cache_${conversationId}`;

    setLoading(!hasPreloadedMessagesRef.current);
    
    const fetchAll = async () => {
      try {
        const msgRes = await fetchMessages(conversationId);
        if (cancelled || cid !== conversationId) return;

        const incoming = Array.isArray(msgRes?.messages) ? msgRes.messages : [];
        setMessages((prev) => {
          const merged = mergeMessages(prev, incoming);
          AsyncStorage.setItem(cacheKey, JSON.stringify(merged.slice(0, 50))).catch(() => {});
          return merged;
        });
        setHasMore(msgRes.pagination?.hasMore ?? incoming.length === LIMIT);
        setLoading(false);

        // Fetch meta for groups
        apiService.get(`/conversations/${conversationId}`).then((metaRes) => {
          if (!cancelled && metaRes?.success) setConversationMeta(metaRes.data);
        }).catch(() => {});

      } catch (err) {
        console.error('[useDM] Fetch error:', err);
        setLoading(false);
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
    setMessages,
    isNearBottomRef
  };
}
