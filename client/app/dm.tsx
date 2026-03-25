import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    addNotification,
    deleteMessage,
    editMessage,
    fetchMessages,
    // getCurrentUser,
    getOrCreateConversation,
    getUserProfile,
    markConversationAsRead,
    reactToMessage,
    sendMessage,
} from '../lib/firebaseHelpers/index';
import { getFormattedActiveStatus, subscribeToUserPresence, updateUserOffline, updateUserPresence, UserPresence } from '../lib/userPresence';
import MessageBubble from '@/src/_components/MessageBubble';
import { useUserProfile } from '@/src/_hooks/useUserProfile';
import {
  initializeSocket,
  subscribeToMessages as socketSubscribeToMessages,
  subscribeToMessageSent,
  subscribeToMessageDelivered,
  subscribeToMessageRead,
  markMessageAsRead,
  sendTypingIndicator,
  stopTypingIndicator,
  subscribeToTyping
} from '@/src/_services/socketService';

const DEFAULT_AVATAR_URL = 'https://res.cloudinary.com/YOUR_CLOUD_NAME/image/upload/v1/default/default-pic.jpg';

export default function DM() {
  const params = useLocalSearchParams();
  const { user: paramUser, conversationId: paramConversationId } = params;
  // Extract otherUserId - could be passed as 'otherUserId' or 'id'
  const otherUserId: string | null = (() => {
    const raw = (params.otherUserId ?? params.id) as unknown;
    if (Array.isArray(raw)) return (raw[0] as string) || null;
    return typeof raw === 'string' ? raw : null;
  })();
  
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  console.log('[DM] Received params:', { otherUserId, paramUser, paramConversationId });
  
  // Load current user ID from AsyncStorage
  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem('userId').then(id => {
      if (isMounted && id) {
        setCurrentUserId(id);
        console.log('[DM] Current user ID loaded:', id);
      }
    }).catch(err => {
      console.error('[DM] Error loading user ID:', err);
    });
    return () => { isMounted = false; };
  }, []);
  
  // Use the hook to fetch and subscribe to the other user's profile
  const { profile: otherUserProfile, loading: profileLoading } = useUserProfile(
    otherUserId
  );

  const paramUserName: string | undefined = (() => {
    const raw = paramUser as unknown;
    if (Array.isArray(raw)) return raw[0] as string;
    return typeof raw === 'string' ? raw : undefined;
  })();

  const displayName = otherUserProfile?.name || paramUserName || otherUserProfile?.username || 'User';
  const avatarUri = otherUserProfile?.avatar || otherUserProfile?.photoURL || DEFAULT_AVATAR_URL;
  
  const [input, setInput] = useState("");
  const [canMessage, setCanMessage] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(
    typeof paramConversationId === 'string' ? paramConversationId : null
  );
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [lastMessageDoc, setLastMessageDoc] = useState<any>(null);
  const MESSAGES_PAGE_SIZE = 20;
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);
  const isNearBottomRef = useRef(true);
  const autoScrollRequestRef = useRef<{ force: boolean; animated: boolean } | null>(null);
  // const currentUser = getCurrentUser();
  // const currentUserTyped = getCurrentUser() as { uid?: string } | null;
  // TODO: Use user from context or props

  const requestAutoScroll = (force: boolean, animated: boolean) => {
    autoScrollRequestRef.current = { force, animated };
  };

  const maybeAutoScroll = () => {
    const req = autoScrollRequestRef.current;
    if (!req) return;

    if (req.force || isNearBottomRef.current) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: req.animated });
    }

    autoScrollRequestRef.current = null;
  };

  // Message edit/delete states
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [showMessageMenu, setShowMessageMenu] = useState(false);
  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string } | null>(null);
  const [editText, setEditText] = useState('');
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; text: string; senderId: string } | null>(null);
  
  // Track other user's active status
  const [otherUserPresence, setOtherUserPresence] = useState<UserPresence | null>(null);

  // Real-time messaging states
  const [isTyping, setIsTyping] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const dedupeMessagesById = (list: any[]) => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const msg of list) {
      const id = msg?.id;
      if (typeof id === 'string' && id.length > 0) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      out.push(msg);
    }
    return out;
  };

  const normalizeMessageTime = (msg: any) => {
    if (!msg || typeof msg !== 'object') return msg;
    const createdAt = msg.createdAt ?? msg.timestamp;
    if (!createdAt) return msg;
    // Ensure the UI always has a stable time field for rendering.
    return { ...msg, createdAt };
  };

  // Emoji reactions list (Instagram style)
  const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

  // Check if selected message is sent by current user
  const isOwnMessage = selectedMessage && currentUserId && selectedMessage.senderId === currentUserId;

  async function handleReaction(emoji: string) {
    if (!selectedMessage || !conversationId || !currentUserId) return;
    
    await reactToMessage(conversationId, selectedMessage.id, currentUserId, emoji);
    setShowReactionPicker(false);
    setShowMessageMenu(false);
    setSelectedMessage(null);
  }

  useEffect(() => {
    let isMounted = true;
    
    const initializeDM = async () => {
      try {
        // Step 1: Initialize conversation immediately
        if (!currentUserId || !otherUserId) {
          console.log('[DM] Missing user IDs, cannot initialize:', { currentUid: currentUserId, otherUserId });
          return;
        }

        // Get or create conversation ID
        const result = await getOrCreateConversation(
          String(currentUserId),
          otherUserId || ''
        );
        
        console.log('[DM] getOrCreateConversation result:', result);
        if (isMounted && result?.success && result?.conversationId) {
          setConversationId(result.conversationId);
          console.log('[DM] Conversation initialized:', result.conversationId);
        } else {
          console.error('[DM] Failed to create/get conversation:', result);
        }
        
        // Step 2: Allow messaging (skip permission check - user can always message)
        setCanMessage(true);
      } catch (error) {
        console.error('[DM] Error initializing:', error);
      }
    };

    initializeDM();

    return () => { isMounted = false; };
  }, [currentUserId, otherUserId]);

  // Initialize socket connection
  useEffect(() => {
    if (!currentUserId) return;

    console.log('[DM] Initializing socket for user:', currentUserId);
    const socket = initializeSocket(currentUserId);

    // Wait for socket to connect
    const onConnect = () => {
      console.log('[DM] Socket connected and ready');
      setSocketReady(true);
    };

    socket.on('connect', onConnect);

    // If already connected
    if (socket.connected) {
      setSocketReady(true);
    }

    return () => {
      console.log('[DM] Cleaning up socket');
      socket.off('connect', onConnect);
      setSocketReady(false);
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!conversationId || !socketReady) return;

    console.log('[DM] Setting up conversation:', conversationId, 'Socket ready:', socketReady);

    setMessages([]);
    setHasMoreMessages(false);
    setLoading(true);

    let loadingTimeout: NodeJS.Timeout | null = null;
    let isMounted = true;

    // Safety timeout - force stop loading after 10 seconds
    loadingTimeout = setTimeout(() => {
      if (isMounted) {
        console.warn('[DM] Loading timeout - forcing stop loading after 10s');
        setLoading(false);
      }
    }, 10000);

    // Fetch initial messages from backend
    fetchMessages(conversationId)
      .then(res => {
        if (isMounted) {
          console.log('[DM] Fetched messages:', res?.messages?.length || 0);
          // Reverse messages so newest are first (for inverted FlatList)
          const sortedMessages = dedupeMessagesById((res?.messages || []).slice().reverse().map(normalizeMessageTime));
          if (sortedMessages.length > 0) {
            requestAutoScroll(true, false);
          }
          setMessages(sortedMessages);
        }
      })
      .catch(err => {
        if (isMounted) {
          console.error('[DM] Failed to fetch messages:', err);
          setMessages([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          console.log('[DM] Finished loading - setting loading=false');
          setLoading(false);
          if (loadingTimeout) clearTimeout(loadingTimeout);
        }
      });

    // Subscribe to real-time messages via socket (only if socket is ready)
    const unsubMessages = socketSubscribeToMessages(conversationId, (newMessage: any) => {
      if (isMounted) {
        const normalized = normalizeMessageTime(newMessage);
        console.log('[DM] New message received via socket:', normalized);

        setMessages(prev => {
          const incomingId = normalized?.id;

          if (incomingId && prev.some(msg => msg.id === incomingId)) {
            console.log('[DM] Message already exists, skipping:', incomingId);
            return prev;
          }

          // If this is our own message, try to replace an existing temp message instead of adding a duplicate.
          if (currentUserId && normalized?.senderId === currentUserId) {
            const tempIndex = prev.findIndex(msg =>
              typeof msg?.id === 'string' &&
              msg.id.startsWith('temp_') &&
              msg.senderId === normalized.senderId &&
              msg.recipientId === normalized.recipientId &&
              msg.text === normalized.text
            );

            if (tempIndex !== -1) {
              const next = prev.slice();
              next[tempIndex] = { ...normalized, sent: true };
              return dedupeMessagesById(next);
            }
          }

          // Add new message at the beginning (array is reversed for inverted FlatList)
          return dedupeMessagesById([normalized, ...prev]);
        });

        requestAutoScroll(Boolean(currentUserId && normalized?.senderId === currentUserId), true);

        // Mark as read if we're the recipient
        if (currentUserId && normalized?.recipientId === currentUserId) {
          markMessageAsRead({
            conversationId,
            messageId: normalized.id,
            userId: currentUserId
          });
        }
      }
    });

    // Subscribe to message sent confirmation
    const unsubSent = subscribeToMessageSent((message: any) => {
      if (isMounted && message.conversationId === conversationId) {
        console.log('[DM] Message sent confirmation:', message.id);
        // Update message status to sent
        setMessages(prev => prev.map(m =>
          m.id === message.id ? { ...m, sent: true } : m
        ));
      }
    });

    // Subscribe to message delivered status
    const unsubDelivered = subscribeToMessageDelivered((data: any) => {
      if (isMounted && data.conversationId === conversationId) {
        console.log('[DM] Message delivered:', data.messageId);
        setMessages(prev => prev.map(m =>
          m.id === data.messageId ? { ...m, delivered: true } : m
        ));
      }
    });

    // Subscribe to message read status
    const unsubRead = subscribeToMessageRead((data: any) => {
      if (isMounted && data.conversationId === conversationId) {
        console.log('[DM] Message read:', data.messageId);
        setMessages(prev => prev.map(m =>
          m.id === data.messageId ? { ...m, read: true } : m
        ));
      }
    });

    // Subscribe to typing indicators
    const unsubTyping = subscribeToTyping(
      conversationId,
      (data) => {
        if (data.userId === otherUserId) {
          setIsTyping(true);
        }
      },
      (data) => {
        if (data.userId === otherUserId) {
          setIsTyping(false);
        }
      }
    );

    // Mark as read when opening conversation
    if (currentUserId) {
      markConversationAsRead(conversationId, currentUserId);
    }

    return () => {
      isMounted = false;
      if (loadingTimeout) clearTimeout(loadingTimeout);
      unsubMessages();
      unsubSent();
      unsubDelivered();
      unsubRead();
      unsubTyping();
    };
    // eslint-disable-next-line
  }, [conversationId, currentUserId, otherUserId, socketReady]);

  // Remove loadMessagesPage (pagination) for now; can be re-added with backend support
  const loadMessagesPage = () => {
    // Pagination disabled - all messages loaded on initial fetch
  };

  async function initializeConversation() {
    if (!currentUserId || !otherUserId) {
      setLoading(false);
      return;
    }

    if (conversationId) {
      setLoading(false);
      return;
    }

    // Create or get conversation
    const result = await getOrCreateConversation(
      String(currentUserId),
      otherUserId || ''
    );
    if (result && result.success && result.conversationId) {
      setConversationId(result.conversationId);
    }
    setLoading(false);
  }

  async function handleSend() {
    if (!input.trim() || !conversationId || !currentUserId || sendingRef.current || sending || !canMessage) return;

    sendingRef.current = true;

    const messageText = input.trim();
    const replyData = replyingTo;
    setInput("");
    setReplyingTo(null);
    setSending(true);

    // Create temporary message ID
    const tempMessageId = `temp_${Date.now()}`;
    const tempMessage = {
      id: tempMessageId,
      senderId: currentUserId,
      recipientId: otherUserId,
      text: messageText,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      read: false,
      delivered: false,
      sent: false, // Mark as sending
      replyTo: replyData
    };

    // Immediately add to local state for instant UI update
    console.log('[DM] Adding temp message to local state:', tempMessageId);
    setMessages(prev => [tempMessage, ...prev]);
    requestAutoScroll(true, true);

    // Stop typing indicator
    if (otherUserId) {
      stopTypingIndicator({
        conversationId,
        userId: currentUserId,
        recipientId: otherUserId
      });
    }

    try {
      // Update user as active when sending message
      await updateUserPresence(currentUserId, conversationId);

      // Also save via API (fallback) and get real message ID
      const result = await sendMessage(conversationId, currentUserId, messageText, otherUserId || undefined, replyData);

      // Replace temp message with real message from backend
      if (result && result.message) {
        const normalized = normalizeMessageTime(result.message);
        console.log('[DM] Replacing temp message with real message:', normalized?.id);
        setMessages(prev => {
          const replaced = prev.map(msg =>
            msg.id === tempMessageId ? { ...normalized, sent: true } : msg
          );
          return dedupeMessagesById(replaced);
        });
      } else {
        // Mark temp message as sent
        setMessages(prev => prev.map(msg =>
          msg.id === tempMessageId ? { ...msg, sent: true } : msg
        ));
      }

      // Notifications are created server-side on message send.
    } catch (error) {
      console.error('[DM] Send message error:', error);
      // Remove temp message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempMessageId));
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
      sendingRef.current = false;
      // Try to reload inbox if available
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new Event('reloadInbox'));
      }
    }
  }

  async function handleEditMessage() {
    if (!editingMessage || !conversationId || !currentUserId) return;

    const result = await editMessage(
      conversationId,
      editingMessage.id,
      currentUserId,
      editText.trim()
    );

    if (result.success) {
      setEditingMessage(null);
      setEditText('');
      // Messages will auto-update via real-time listener
    } else {
      Alert.alert('Error', result.error || 'Failed to edit message');
    }
  }

  async function handleDeleteMessage() {
    if (!selectedMessage || !conversationId || !currentUserId) return;

    const messageIdToDelete = selectedMessage.id;

    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!conversationId || !currentUserId) return;
            const result = await deleteMessage(
              conversationId,
              messageIdToDelete,
              currentUserId
            );

            if (result.success) {
              setMessages(prev => prev.filter(msg => msg?.id !== messageIdToDelete));
              setShowMessageMenu(false);
              setSelectedMessage(null);
            } else {
              Alert.alert('Error', result.error || 'Failed to delete message');
            }
          }
        }
      ]
    );
  }

  function renderChatItem({ item }: { item: any }) {
    if (item?.type === 'separator') {
      return (
        <View style={styles.dateSeparatorWrap}>
          <View style={styles.dateSeparatorPill}>
            <Text style={styles.dateSeparatorText}>{item.label}</Text>
          </View>
        </View>
      );
    }

    return renderMessage({ item });
  }

  function formatTime(timestamp: any) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  const getDateKey = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const formatDateLabel = (dateKey: string) => {
    if (!dateKey) return '';
    const [y, m, d] = dateKey.split('-').map(Number);
    if (!y || !m || !d) return '';
    const date = new Date(y, m - 1, d);
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    if (dateKey === todayKey) return 'Today';
    if (dateKey === yesterdayKey) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const messagesWithSeparators = useMemo(() => {
    const out: any[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const currentKey = getDateKey(msg?.createdAt ?? msg?.timestamp);
      const next = messages[i + 1];
      const nextKey = next ? getDateKey(next?.createdAt ?? next?.timestamp) : '';

      out.push({ type: 'message', ...msg });

      if (currentKey && currentKey !== nextKey) {
        out.push({ type: 'separator', id: `sep_${currentKey}`, dateKey: currentKey, label: formatDateLabel(currentKey) });
      }
    }

    return out;
  }, [messages]);

  function renderMessage({ item }: { item: any }) {
    const isSelf = item.senderId === currentUserId;
    const reactions = item.reactions || {};
    const reactionsList = Object.entries(reactions);
    const hasReply = item.replyTo && item.replyTo.text;
    const isReplyFromSelf = item.replyTo?.senderId === currentUserId;

    return (
      <TouchableOpacity
        style={isSelf ? styles.msgRowSelf : styles.msgRow}
        onLongPress={() => {
          setSelectedMessage(item);
          setShowMessageMenu(true);
        }}
        activeOpacity={0.9}
      >
        {!isSelf && (
          <Image
            source={{ uri: avatarUri }}
            style={styles.msgAvatar}
          />
        )}
        <MessageBubble
          text={item.text}
          imageUrl={item.imageUrl}
          createdAt={item.createdAt ?? item.timestamp}
          editedAt={item.editedAt}
          isSelf={isSelf}
          sent={item.sent}
          delivered={item.delivered}
          read={item.read}
          formatTime={formatTime}
          replyTo={item.replyTo}
          username={displayName}
          currentUserId={currentUserId ?? undefined}
        />
        {/* Reactions display */}
        {reactionsList.length > 0 && (
          <View style={[styles.reactionsContainer, isSelf ? styles.reactionsSelf : styles.reactionsOther]}>
            {reactionsList.map(([userId, emoji], index) => (
              <Text key={`${item.id}_${userId}_${index}`} style={styles.reactionEmoji}>{emoji as string}</Text>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]} edges={["top", "bottom"]}>
        <ActivityIndicator size="large" color="#007aff" />
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/inbox' as any);
            }
          }}>
            <Feather name="x" size={20} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerUser} onPress={() => {
            if (otherUserId) router.push(`/user-profile?id=${otherUserId}` as any);
          }}>
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
            <View>
              <Text style={styles.title}>{displayName}</Text>
              <Text style={styles.activeText}>{getFormattedActiveStatus(otherUserPresence)}</Text>
            </View>
          </TouchableOpacity>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.body}>
          {messages.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="message-circle" size={64} color="#ccc" />
              <Text style={styles.placeholder}>Start the conversation</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messagesWithSeparators}
              keyExtractor={(item, index) => {
                // Use message ID if available, otherwise use senderId + timestamp
                if (item.id) return item.id;
                const timeKey = item.createdAt ?? item.timestamp;
                if (item.senderId && timeKey) return `${item.senderId}_${timeKey}_${index}`;
                // Fallback to index (less ideal but prevents warnings)
                return `msg_${index}`;
              }}
              renderItem={renderChatItem}
              contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 12 }}
              onContentSizeChange={maybeAutoScroll}
              onLayout={() => {
                requestAutoScroll(true, false);
                maybeAutoScroll();
              }}
              inverted
              onScroll={(e) => {
                const y = e.nativeEvent.contentOffset.y;
                isNearBottomRef.current = y < 80;
              }}
              scrollEventThrottle={16}
              removeClippedSubviews={true}
              maxToRenderPerBatch={12}
              windowSize={7}
              extraData={messagesWithSeparators.length}
              initialNumToRender={12}
            />
          )}
        </View>

        {/* Typing indicator */}
        {isTyping && (
          <View style={styles.typingIndicator}>
            <Text style={styles.typingText}>{displayName} is typing...</Text>
          </View>
        )}

        {/* Reply preview bar above input */}
        {replyingTo && (
          <View style={styles.replyBar}>
            <View style={styles.replyBarContent}>
              <View style={styles.replyBarLine} />
              <View style={{ flex: 1 }}>
                <Text style={styles.replyBarName}>
                  Replying to {replyingTo.senderId === currentUserId ? 'yourself' : displayName}
                </Text>
                <Text style={styles.replyBarText} numberOfLines={1}>
                  {replyingTo.text}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyBarClose}>
              <Feather name="x" size={20} color="#666" />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.inputBar}>
          <View style={styles.inputWrap}>
            <View style={styles.inputBox}>
              <TextInput
                style={styles.input}
                value={canMessage ? input : ''}
                onChangeText={text => {
                  if (canMessage) {
                    setInput(text);

                    // Send typing indicator
                    if (otherUserId && text.length > 0) {
                      sendTypingIndicator({
                        conversationId: conversationId || '',
                        userId: currentUserId || '',
                        recipientId: otherUserId
                      });

                      // Clear previous timeout
                      if (typingTimeoutRef.current) {
                        clearTimeout(typingTimeoutRef.current);
                      }

                      // Stop typing after 2 seconds of inactivity
                      typingTimeoutRef.current = setTimeout(() => {
                        stopTypingIndicator({
                          conversationId: conversationId || '',
                          userId: currentUserId || '',
                          recipientId: otherUserId
                        });
                      }, 2000);
                    }
                  }
                }}
                placeholder={canMessage ? "Message..." : "You can't message this user"}
                placeholderTextColor="#8e8e8e"
                multiline
                maxLength={500}
                editable={canMessage}
              />
            </View>
            <TouchableOpacity 
              style={[styles.sendBtnText, (!input.trim() || sending || !canMessage) && { opacity: 0.4 }]} 
              onPress={canMessage ? handleSend : undefined}
              disabled={!canMessage || !input.trim() || sending}
            >
              <Text style={styles.sendTextBlue}>{sending ? 'Sending...' : 'Send'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Message Menu Modal with Reactions */}
      <Modal visible={showMessageMenu} transparent animationType="fade">
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowMessageMenu(false);
            setSelectedMessage(null);
          }}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={styles.menuModal}>
              {/* Reaction picker row */}
              <View style={styles.reactionPickerRow}>
                {REACTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.reactionPickerBtn}
                    onPress={() => handleReaction(emoji)}
                  >
                    <Text style={styles.reactionPickerEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.menuDivider} />

              {/* Reply option */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMessageMenu(false);
                  if (selectedMessage) {
                    setReplyingTo({
                      id: selectedMessage.id,
                      text: selectedMessage.text,
                      senderId: selectedMessage.senderId
                    });
                  }
                  setSelectedMessage(null);
                }}
              >
                <Feather name="corner-up-left" size={20} color="#007aff" />
                <Text style={styles.menuText}>Reply</Text>
              </TouchableOpacity>

              {/* Copy option */}
              <View style={styles.menuDivider} />
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  import('expo-clipboard').then(({ setStringAsync }) => {
                    if (selectedMessage?.text) {
                      setStringAsync(selectedMessage.text);
                    }
                  });
                  setShowMessageMenu(false);
                  setSelectedMessage(null);
                }}
              >
                <Feather name="copy" size={20} color="#007aff" />
                <Text style={styles.menuText}>Copy</Text>
              </TouchableOpacity>

              {/* Edit option - only for own messages */}
              {isOwnMessage && (
                <>
                  <View style={styles.menuDivider} />
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      setShowMessageMenu(false);
                      setEditingMessage({ id: selectedMessage.id, text: selectedMessage.text });
                      setEditText(selectedMessage.text);
                    }}
                  >
                    <Feather name="edit-2" size={20} color="#007aff" />
                    <Text style={styles.menuText}>Edit Message</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Delete option - only for own messages */}
              {isOwnMessage && (
                <>
                  <View style={styles.menuDivider} />
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      setShowMessageMenu(false);
                      handleDeleteMessage();
                    }}
                  >
                    <Feather name="trash-2" size={20} color="#e74c3c" />
                    <Text style={[styles.menuText, { color: '#e74c3c' }]}>Delete Message</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Edit Message Modal */}
      {editingMessage && (
        <Modal visible transparent animationType="fade">
          <KeyboardAvoidingView
            style={styles.editOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => {
                setEditingMessage(null);
                setEditText('');
              }}
            />
            <View style={styles.editModal}>
              <View style={styles.editHeader}>
                <Text style={styles.editTitle}>Edit Message</Text>
                <TouchableOpacity onPress={() => {
                  setEditingMessage(null);
                  setEditText('');
                }}>
                  <Feather name="x" size={24} color="#222" />
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.editInput}
                value={editText}
                onChangeText={setEditText}
                multiline
                autoFocus
                maxLength={500}
                placeholder="Edit your message..."
                placeholderTextColor="#999"
              />

              <View style={styles.editActions}>
                <TouchableOpacity
                  style={[styles.editBtn, styles.cancelBtn]}
                  onPress={() => {
                    setEditingMessage(null);
                    setEditText('');
                  }}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editBtn, styles.saveBtn, !editText.trim() && { opacity: 0.5 }]}
                  onPress={handleEditMessage}
                  disabled={!editText.trim()}
                >
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderBottomWidth: 0.5,
      borderBottomColor: '#dbdbdb',
      backgroundColor: '#fff',
  },
  activeText: {
    fontSize: 11,
    color: '#8e8e8e',
    marginTop: 1,
  },
  inputBar: {
    borderTopWidth: 0.5,
    borderTopColor: '#dbdbdb',
    backgroundColor: '#fff',
    paddingBottom: 10,
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbdbdb',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  iconBtn: {
    marginRight: 8,
  },
  inputBox: {
    flex: 1,
    marginRight: 8,
    maxHeight: 100,
  },
  input: {
    fontSize: 16,
    paddingVertical: 6,
    paddingHorizontal: 4,
    color: '#222',
  },
  sendBtn: {
    backgroundColor: '#3797f0',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  sendBtnText: {
    paddingHorizontal: 4,
  },
  sendTextBlue: {
    color: '#3797f0',
    fontWeight: '700',
    fontSize: 15,
  },
  sendText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  backBtn: {
    paddingRight: 10,
    paddingVertical: 4,
  },
  headerUser: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: '#eee',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
  },
  body: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: 4,
    marginHorizontal: 0,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  msgRowSelf: {
    flexDirection: 'row',
    marginBottom: 4,
    marginHorizontal: 0,
    justifyContent: 'flex-end',
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    backgroundColor: '#eee',
  },
  msgBubble: {
    position: 'relative',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '78%',
    // subtle shadow
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  msgBubbleLeft: {
    backgroundColor: '#efefef',
  },
  msgBubbleRight: {
    backgroundColor: '#3797f0',
  },
  tailLeft: {
    position: 'absolute',
    left: -6,
    bottom: 8,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderRightWidth: 6,
    borderTopColor: 'transparent',
    borderRightColor: '#efefef',
  },
  tailRight: {
    position: 'absolute',
    right: -6,
    bottom: 8,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderLeftWidth: 6,
    borderTopColor: 'transparent',
    borderLeftColor: '#3797f0',
  },
  msgText: {
    color: '#222',
    fontSize: 15,
  },
  msgTextSelf: {
    color: '#fff',
    fontSize: 15,
  },
  msgTime: {
    color: '#999',
    fontSize: 11,
    marginTop: 4,
  },
  msgTimeSelf: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    marginTop: 4,
  },
  msgImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 8,
  },
  placeholder: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 20,
  },
  dateSeparatorWrap: {
    alignItems: 'center',
    marginVertical: 10,
  },
  dateSeparatorPill: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dateSeparatorText: {
    color: 'rgba(0,0,0,0.6)',
    fontSize: 12,
    fontWeight: '600',
  },
  msgFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  editedLabel: {
    fontStyle: 'italic',
    fontSize: 10,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '80%',
    maxWidth: 300,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  menuText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#eee',
  },
  reactionPickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  reactionPickerBtn: {
    padding: 8,
  },
  reactionPickerEmoji: {
    fontSize: 28,
  },
  reactionsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: -8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    alignSelf: 'flex-start',
  },
  reactionsSelf: {
    alignSelf: 'flex-end',
    marginRight: 8,
  },
  reactionsOther: {
    alignSelf: 'flex-start',
    marginLeft: 36,
  },
  reactionEmoji: {
    fontSize: 14,
    marginHorizontal: 1,
  },
  editOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  editModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  editTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
  },
  editInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    minHeight: 100,
    maxHeight: 200,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  editBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: '#f5f5f5',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  saveBtn: {
    backgroundColor: '#007aff',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  // Reply styles
  replyPreview: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingLeft: 8,
  },
  replyPreviewSelf: {
    alignSelf: 'flex-end',
  },
  replyPreviewOther: {
    alignSelf: 'flex-start',
    marginLeft: 0,
  },
  replyLine: {
    width: 3,
    backgroundColor: '#3797f0',
    borderRadius: 2,
    marginRight: 8,
  },
  replyContent: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 200,
  },
  replyName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3797f0',
    marginBottom: 2,
  },
  replyText: {
    fontSize: 13,
    color: '#666',
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  replyBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyBarLine: {
    width: 3,
    height: 36,
    backgroundColor: '#3797f0',
    borderRadius: 2,
    marginRight: 10,
  },
  replyBarName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3797f0',
  },
  replyBarText: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  replyBarClose: {
    padding: 4,
  },
  // Typing indicator styles
  typingIndicator: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
  },
  typingText: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
  },
});
