import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'react-native';
// import { useAuthLoading, useUser } from '@/src/_components/UserContext';
// import {} from '../lib/firebaseHelpers';
// @ts-ignore
import { useInboxPolling } from '../hooks/useInboxPolling';
import { archiveConversation, deleteConversation } from '../lib/firebaseHelpers/archive';
import { markConversationAsRead } from '../lib/firebaseHelpers/conversation';
import { apiService } from '@/src/_services/apiService';

// Helper component to show conversation with user profile
function ConversationItem({ item, userId, router, formatTime, profilesById, setConversations, setOptimisticReadByOtherId, onOpenActions }: any) {
  const otherUserId = item?.otherUserId || item.participants?.find((uid: string) => uid !== userId);
  const profileAny = otherUserId ? profilesById?.[String(otherUserId)] : null;
  const username = profileAny?.username || profileAny?.displayName || profileAny?.name || String(otherUserId || '').substring(0, 12) || 'User';
  const avatar = profileAny?.avatar || profileAny?.photoURL;
  const lastMsgPreview = item.lastMessage?.substring(0, 40) || 'No messages yet';

  const DEFAULT_AVATAR = 'https://res.cloudinary.com/dinwxxnzm/image/upload/v1/default/default-pic.jpg';
  const displayAvatar = typeof avatar === 'string' && avatar.trim() ? avatar : DEFAULT_AVATAR;

  return (
    <TouchableOpacity
      style={{
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
        flexDirection: 'row',
        alignItems: 'center'
      }}
      onLongPress={() => {
        if (typeof onOpenActions === 'function') {
          onOpenActions(item, otherUserId, username);
        }
      }}
      delayLongPress={350}
      onPress={() => {
        if (!otherUserId) return;

        const conversationId = String(item.conversationId || item.id || item._id);
        if (!conversationId) return;

        markConversationAsRead(conversationId, String(userId)).catch(() => { });

        if (typeof setConversations === 'function') {
          setConversations((prev: any[]) => {
            if (!Array.isArray(prev)) return prev;
            return prev.map((c: any) => {
              const participants = Array.isArray(c?.participants) ? c.participants.map(String) : [];
              const otherId = participants.find((p: string) => p !== String(userId));
              if (otherId && otherId === String(otherUserId)) {
                return { ...c, unreadCount: 0 };
              }
              return c;
            });
          });
        }

        if (typeof setOptimisticReadByOtherId === 'function') {
          setOptimisticReadByOtherId((prev: any) => ({
            ...(prev || {}),
            [String(otherUserId)]: Date.now()
          }));
        }

        router.push({
          pathname: '/dm',
          params: {
            conversationId,
            otherUserId: otherUserId,
            user: username
          }
        });
      }}
    >
      <Image
        source={{ uri: displayAvatar }}
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          marginRight: 12,
          backgroundColor: '#eee'
        }}
      />

      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '700', fontSize: 15, color: '#000', marginBottom: 4 }}>
          {username}
        </Text>
        <Text style={{ color: '#666', fontSize: 13 }} numberOfLines={1}>
          {lastMsgPreview}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ color: '#999', fontSize: 12 }}>
          {formatTime(item.lastMessageAt)}
        </Text>
        {typeof item?.unreadCount === 'number' && item.unreadCount > 0 ? (
          <View style={{ marginTop: 6, backgroundColor: '#e0245e', minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{item.unreadCount > 9 ? '9+' : item.unreadCount}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function Inbox() {
  const router = useRouter();

  const [profilesById, setProfilesById] = useState<Record<string, any>>({});

  const coerceToEpochMs = useCallback((value: any): number => {
    if (!value) return 0;

    if (typeof value === 'number' && Number.isFinite(value)) {
      // Handle seconds vs milliseconds
      if (value > 0 && value < 10_000_000_000) return value * 1000;
      return value;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return 0;

      // Numeric string
      if (/^\d+$/.test(trimmed)) {
        const asNum = Number(trimmed);
        if (Number.isFinite(asNum)) {
          if (asNum > 0 && asNum < 10_000_000_000) return asNum * 1000;
          return asNum;
        }
      }

      // ISO date string
      const parsed = Date.parse(trimmed);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    // Firestore Timestamp
    if (typeof value?.toDate === 'function') {
      const d = value.toDate();
      const ms = d instanceof Date ? d.getTime() : NaN;
      return Number.isFinite(ms) ? ms : 0;
    }

    // Common timestamp shapes from backends
    const seconds = value?.seconds ?? value?._seconds;
    const nanos = value?.nanoseconds ?? value?._nanoseconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      const ms = seconds * 1000 + (typeof nanos === 'number' ? Math.floor(nanos / 1_000_000) : 0);
      return Number.isFinite(ms) ? ms : 0;
    }

    // Date object
    if (value instanceof Date) {
      const ms = value.getTime();
      return Number.isFinite(ms) ? ms : 0;
    }

    return 0;
  }, []);

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/home');
  };

  // Get userId from AsyncStorage (token-based auth)
  const [userId, setUserId] = useState<string | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  useEffect(() => {
    const getUser = async () => {
      try {
        const uid = await AsyncStorage.getItem('userId');
        console.log('📱 Inbox: Got userId from storage:', uid);
        setUserId(uid);
      } catch (error) {
        console.error('Error getting userId:', error);
      } finally {
        setUserLoading(false);
      }
    };
    getUser();
  }, []);

  // Use optimized polling instead of real-time listeners (saves 70-80% on costs)
  const { conversations: polledConversations, loading: polledLoading } = useInboxPolling(userId || null, {
    pollingInterval: 15000, // Poll every 15 seconds instead of real-time
    autoStart: true
  });

  console.log('🟠 INBOX: userId=', userId, 'userLoading=', userLoading, 'polledLoading=', polledLoading, 'polledConversations.length=', polledConversations?.length);

  const [conversations, setConversations] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [forceLoadTimeout, setForceLoadTimeout] = useState(false);
  const [optimisticReadByOtherId, setOptimisticReadByOtherId] = useState<Record<string, number>>({});

  const [actionsVisible, setActionsVisible] = useState(false);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [actionItem, setActionItem] = useState<any | null>(null);
  const [actionOtherUserId, setActionOtherUserId] = useState<string | null>(null);
  const [actionTitle, setActionTitle] = useState<string>('');

  const normalizeConversations = useCallback((raw: any[]) => {
    if (!Array.isArray(raw)) return [];

    return raw.map((convo: any) => {
      const participantsRaw = convo?.participants ?? convo?.participantIds ?? convo?.members;
      const participants = Array.isArray(participantsRaw) ? participantsRaw.map(String) : [];
      const otherId = participants.find((p: string) => p !== String(userId));

      const baseId = convo?.conversationId || convo?.id || convo?._id;
      const stableId = typeof baseId === 'string' && baseId.trim()
        ? baseId
        : (participants.length >= 2 ? participants.slice().sort().join('_') : String(baseId || otherId || 'conversation'));

      const lastText = convo?.lastMessage ?? convo?.lastMessageText ?? convo?.last_message;

      // Prefer last-message timestamp fields over updatedAt
      const timeRaw = convo?.lastMessageAt ?? convo?.lastMessageTime ?? convo?.last_message_at ?? convo?.updatedAt ?? convo?.createdAt;
      const lastMessageAt = coerceToEpochMs(timeRaw);

      const optimisticTs = otherId ? optimisticReadByOtherId[String(otherId)] : undefined;
      const suppressUnread = typeof optimisticTs === 'number' && (Date.now() - optimisticTs) < 30000;

      const unreadCountRaw = convo?.unreadCount ?? convo?.unread ?? convo?.unread_count;
      const unreadCount = suppressUnread ? 0 : (typeof unreadCountRaw === 'number' ? unreadCountRaw : Number(unreadCountRaw || 0));

      return {
        ...convo,
        id: stableId,
        conversationId: stableId,
        participants,
        otherUserId: otherId || convo?.otherUserId || convo?.otherUser?.id,
        lastMessage: typeof lastText === 'string' ? lastText : (lastText ? String(lastText) : ''),
        lastMessageAt,
        unreadCount: Number.isFinite(unreadCount) ? unreadCount : 0,
      };
    });
  }, [coerceToEpochMs, optimisticReadByOtherId, userId]);

  useEffect(() => {
    if (!Array.isArray(conversations) || conversations.length === 0) return;

    const ids = Array.from(new Set(
      conversations
        .map((c: any) => c?.otherUserId)
        .filter((x: any) => typeof x === 'string' && x.trim() !== '')
        .map(String)
    ));

    const missing = ids.filter((id) => !profilesById?.[id]);
    if (missing.length === 0) return;

    let mounted = true;
    (async () => {
      try {
        const results = await Promise.allSettled(
          missing.map(async (id) => {
            const res = await apiService.get(`/users/${id}`);
            if (!res?.success) return null;
            const data = res?.data;
            if (!data) return null;
            const avatar = data?.avatar || data?.photoURL || 'https://res.cloudinary.com/dinwxxnzm/image/upload/v1/default/default-pic.jpg';
            return [id, { ...data, avatar }] as const;
          })
        );

        if (!mounted) return;
        setProfilesById((prev) => {
          const next = { ...(prev || {}) };
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value) {
              const [id, profile] = r.value;
              next[String(id)] = profile;
            }
          }
          return next;
        });
      } catch { }
    })();

    return () => {
      mounted = false;
    };
  }, [conversations, profilesById]);

  const refreshInbox = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await apiService.get(`/conversations?userId=${userId}`);
      let convos = response?.data;
      if (!response?.success) convos = [];
      if (!Array.isArray(convos)) convos = [];
      setConversations(normalizeConversations(convos));
    } catch (err: any) {
      console.error('❌ Inbox refresh failed:', err?.message || err);
    }
  }, [normalizeConversations, userId]);

  const openActions = useCallback((item: any, otherId: string | null, title: string) => {
    setActionItem(item);
    setActionOtherUserId(otherId);
    setActionTitle(typeof title === 'string' ? title : 'Conversation');
    setConfirmDeleteVisible(false);
    setActionsVisible(true);
  }, []);

  const closeActions = useCallback(() => {
    setActionsVisible(false);
    setConfirmDeleteVisible(false);
  }, []);



  const handleDelete = useCallback(async () => {
    const conversationId = actionItem?.conversationId || actionItem?.id || actionItem?._id;
    if (!conversationId || !userId) return;

    closeActions();
    try {
      setConversations((prev: any[] | null) => {
        if (!Array.isArray(prev)) return prev;
        return prev.filter((c: any) => {
          const participants = Array.isArray(c?.participants) ? c.participants.map(String) : [];
          const otherId = participants.find((p: string) => p !== String(userId));
          const cid = c?.conversationId || c?.id || c?._id;
          if (actionOtherUserId && otherId && String(otherId) === String(actionOtherUserId)) return false;
          return String(cid) !== String(conversationId);
        });
      });

      const result = await deleteConversation(String(conversationId), String(userId));
      if (!result?.success) {
        await refreshInbox();
      }
    } catch {
      await refreshInbox();
    }
  }, [actionItem, actionOtherUserId, closeActions, refreshInbox, userId]);

  useEffect(() => {
    // Only set loading if actually loading
    if (!polledLoading) {
      setLoading(false);
      setForceLoadTimeout(false); // Reset timeout flag when data loads successfully
      return;
    }

    setLoading(true);

    // Force clear loading after 15 seconds max to prevent infinite spinner
    // Only if we haven't already forced a timeout
    if (!forceLoadTimeout) {
      const timeoutId = setTimeout(() => {
        console.warn('⚠️ Inbox loading timeout - forcing display after 15s');
        setLoading(false);
        setForceLoadTimeout(true);
      }, 15000);
      return () => clearTimeout(timeoutId);
    }
  }, [polledLoading]);

  useEffect(() => {
    if (!userId) {
      setConversations([]);
      return;
    }

    console.log('🔵 EFFECT TRIGGERED: polledConversations=', polledConversations?.length, 'userId=', userId);

    if (!Array.isArray(polledConversations) || polledConversations.length === 0) {
      console.log('🟠 No conversations to process');
      setConversations([]);
      return;
    }

    // Normalize IDs and apply optimistic unread suppression
    const normalizedConvos = normalizeConversations(polledConversations);

    console.log('🟢 SETTING CONVERSATIONS:', normalizedConvos?.length, 'convos');
    console.log('📋 First convo sample:', normalizedConvos?.[0]);
    setConversations(normalizedConvos);
  }, [polledConversations, userId, optimisticReadByOtherId]);

  // Immediate refresh when returning to Inbox (do not wait for next polling tick)
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;

      (async () => {
        await refreshInbox();
      })();

      return () => {
        return;
      };
    }, [refreshInbox, userId])
  );

  function formatTime(timestamp: any) {
    const ms = coerceToEpochMs(timestamp);
    if (!ms) return '';
    const date = new Date(ms);
    const now = new Date();
    const diff = Math.max(0, now.getTime() - date.getTime());
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (hours < 1) return 'now';
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
  }

  if (userLoading) {
    console.log('🔴 SHOWING USER LOADING SPINNER');
    return (
      <SafeAreaView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#007aff" />
        <Text style={{ color: '#999', marginTop: 10 }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (!userId) {
    console.log('🔴 USER NOT LOGGED IN');
    return (
      <SafeAreaView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: '#999', fontSize: 18, marginTop: 40 }}>Please sign in to view your messages.</Text>
      </SafeAreaView>
    );
  }

  // Show loading only if still loading AND no conversations yet.
  // We use `polledLoading` and `userLoading` as our source of truth.
  // Additionally, if the data hasn't synced from the hook yet, we wait.
  if (userLoading || polledLoading || (loading && conversations === null)) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#007aff" />
        <Text style={{ color: '#999', marginTop: 10 }}>Loading messages...</Text>
      </SafeAreaView>
    );
  }

  // If after loading is COMPLETELY finished, we truly have no conversations, show the empty state.
  if (!loading && !polledLoading && !userLoading && (conversations === null || conversations.length === 0)) {
    console.log('🔴 NO CONVERSATIONS - Inbox: No conversations found for user', userId, 'conversations=', conversations);
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => {
              handleClose();
            }}
            style={[styles.backBtn, { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', zIndex: 10, elevation: 10 }]}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="x" size={28} color="#000" />
          </TouchableOpacity>
          <Text pointerEvents="none" style={[styles.title, { textAlign: 'center', flex: 1 }]}>Messages</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.emptyStateContainer}>
          <View style={styles.emptyIconWrapper}>
            <Feather name="send" size={64} color="#dbdbdb" strokeWidth={1} />
          </View>

          <Text style={styles.emptyTitle}>Your inbox is empty</Text>
          <Text style={styles.emptySubtitle}>Send a message to start a conversation</Text>

          <TouchableOpacity
            style={styles.exploreBtn}
            onPress={() => router.push('/search-modal')}
          >
            <Text style={styles.exploreBtnText}>Find People</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => {
            handleClose();
          }}
          style={[styles.backBtn, { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', zIndex: 10, elevation: 10 }]}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="x" size={28} color="#000" />
        </TouchableOpacity>
        <Text pointerEvents="none" style={[styles.title, { textAlign: 'center', flex: 1 }]}>Messages</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.topActions}>
        {/* Requests button removed as per user request */}
      </View>

      {(() => {
        console.log('🟢 RENDERING: conversations.length=', conversations?.length, '| filtered data=', conversations?.filter(c => !c[`archived_${userId}`])?.length);

        if (!loading && (conversations === null || conversations.length === 0)) {
          console.log('🔴 NO CONVERSATIONS - Inbox: No conversations found', conversations);
          return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <Feather name="message-circle" size={64} color="#ccc" />
              <Text style={{ color: '#999', marginTop: 16, fontSize: 16 }}>No messages found</Text>
              <Text style={{ color: '#ccc', marginTop: 8, textAlign: 'center' }}>Start a conversation by visiting someone&apos;s profile</Text>
            </View>
          );
        }

        const safeConversations = conversations || [];
        const filteredConvosRaw = safeConversations.filter(c => !c[`archived_${userId}`]);
        const filteredConvosRawStable = filteredConvosRaw.filter((c: any) => {
          const archived = typeof c?.isArchived === 'boolean' ? c.isArchived : c?.[`archived_${userId}`];
          return !archived;
        });

        const getSortTime = (c: any) => {
          const direct = c?.lastMessageAt;
          if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
          const t = c?.updatedAt || c?.lastMessageTime || c?.createdAt;
          const d = t?.toDate ? t.toDate() : (typeof t === 'number' ? new Date(t) : (t ? new Date(t) : null));
          return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
        };

        // Frontend safety dedupe: 1 row per other participant; keep newest but sum unreadCount
        const map = new Map<string, any>();
        for (const c of filteredConvosRawStable) {
          const participants = Array.isArray(c?.participants) ? c.participants.map(String) : [];
          const otherId = participants.find((p: string) => p !== String(userId));
          const key = otherId || (c?.conversationId ? String(c.conversationId) : String(c?.id || c?._id));

          const existing = map.get(key);
          if (!existing) {
            map.set(key, c);
          } else {
            const aggregatedUnread = (existing?.unreadCount || 0) + (c?.unreadCount || 0);
            const keep = getSortTime(c) >= getSortTime(existing) ? c : existing;
            map.set(key, { ...keep, unreadCount: aggregatedUnread });
          }
        }

        const filteredConvos = Array.from(map.values()).sort((a, b) => getSortTime(b) - getSortTime(a));
        console.log('📋 FLATLIST DATA:', filteredConvos.length, 'items to render');

        if (filteredConvos.length > 0) {
          return (
            <FlatList
              data={filteredConvos}
              keyExtractor={(item) => String(item.conversationId || item.id)}
              style={{ width: '100%', flex: 1 }}
              renderItem={({ item, index }) => (
                <ConversationItem
                  item={item}
                  userId={userId}
                  router={router}
                  formatTime={formatTime}
                  profilesById={profilesById}
                  setConversations={setConversations}
                  setOptimisticReadByOtherId={setOptimisticReadByOtherId}
                  onOpenActions={openActions}
                />
              )}
              contentContainerStyle={{ paddingBottom: 16 }}
              scrollEnabled={true}
            />
          );
        }

        // No conversations after filter
        return (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <Text style={{ color: '#999' }}>All conversations archived</Text>
          </View>
        );
      })()}

      <Modal
        visible={actionsVisible}
        transparent
        animationType="fade"
        onRequestClose={closeActions}
      >
        <Pressable style={styles.actionSheetBackdrop} onPress={closeActions}>
          <Pressable style={styles.actionSheetContainer} onPress={() => { }}>
            <Text style={styles.actionSheetTitle} numberOfLines={1}>{actionTitle || 'Conversation'}</Text>

            {/* Archive button removed as per user request */}

            <TouchableOpacity
              style={[styles.actionSheetButton, styles.actionSheetDeleteButton]}
              activeOpacity={0.8}
              onPress={() => {
                setActionsVisible(false);
                setConfirmDeleteVisible(true);
              }}
            >
              <Feather name="trash-2" size={18} color="#ff3b30" />
              <Text style={[styles.actionSheetButtonText, styles.actionSheetDeleteText]}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionSheetButton, styles.actionSheetCancelButton]} activeOpacity={0.8} onPress={closeActions}>
              <Text style={styles.actionSheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={confirmDeleteVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDeleteVisible(false)}
      >
        <Pressable style={styles.actionSheetBackdrop} onPress={() => setConfirmDeleteVisible(false)}>
          <Pressable style={styles.confirmContainer} onPress={() => { }}>
            <Text style={styles.confirmTitle}>Delete conversation?</Text>
            <Text style={styles.confirmSubtitle}>This will remove the conversation from your inbox.</Text>
            <View style={styles.confirmRow}>
              <TouchableOpacity style={[styles.confirmBtn, styles.confirmCancelBtn]} onPress={() => setConfirmDeleteVisible(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, styles.confirmDeleteBtn]} onPress={handleDelete}>
                <Text style={styles.confirmDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  headerRow: {
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderBottomWidth: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    marginLeft: -30,
    color: '#000',
  },
  backBtn: {
    padding: 6
  },
  iconBtn: {
    padding: 6
  },
  topActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    gap: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  actionText: {
    marginLeft: 6,
    color: '#007aff',
    fontWeight: '600',
    fontSize: 14,
  },
  actionSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  actionSheetContainer: {
    backgroundColor: '#fff',
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  actionSheetTitle: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
    marginBottom: 10,
  },
  actionSheetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionSheetButtonText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#111',
    fontWeight: '600',
  },
  actionSheetDeleteButton: {
    marginTop: 2,
  },
  actionSheetDeleteText: {
    color: '#ff3b30',
  },
  actionSheetCancelButton: {
    marginTop: 10,
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  actionSheetCancelText: {
    fontSize: 16,
    color: '#111',
    fontWeight: '700',
  },
  confirmContainer: {
    marginHorizontal: 22,
    marginBottom: 24,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111',
    marginBottom: 6,
  },
  confirmSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 14,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginLeft: 10,
  },
  confirmCancelBtn: {
    backgroundColor: '#f5f5f5',
  },
  confirmCancelText: {
    fontWeight: '700',
    color: '#111',
  },
  confirmDeleteBtn: {
    backgroundColor: '#ff3b30',
  },
  confirmDeleteText: {
    fontWeight: '800',
    color: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  avatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  avatarRingUnread: {
    borderWidth: 2,
    borderColor: '#007aff'
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f0f0f0'
  },
  content: {
    flex: 1,
    paddingRight: 8
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4
  },
  user: {
    fontWeight: '600',
    fontSize: 15,
    color: '#000',
    flex: 1
  },
  userUnread: {
    fontWeight: '700',
    color: '#000'
  },
  at: {
    color: '#999',
    fontSize: 12,
    marginLeft: 8
  },
  last: {
    color: '#666',
    fontSize: 14,
    flex: 1
  },
  lastUnread: {
    color: '#000',
    fontWeight: '600'
  },
  unreadBadge: {
    backgroundColor: '#007aff',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6
  },
  unreadText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 11
  },
  archiveBtn: {
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    height: '100%',
  },
  archiveText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  emptyIconWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  exploreBtn: {
    backgroundColor: '#FFB800',
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 6,
    marginTop: 16,
  },
  exploreBtnText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 15,
  },
});
