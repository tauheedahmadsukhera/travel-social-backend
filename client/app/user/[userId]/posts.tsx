import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PostCard from '../../../src/_components/PostCard';
import { apiService } from '../../../src/_services/apiService';
import { feedEventEmitter } from '../../../lib/feedEventEmitter';



const PAGE_SIZE = 20;
const INITIAL_PAGE_SIZE = 100;
const MAX_INITIAL_PAGES = 5;

export default function UserPostsScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();

  const userId = useMemo(() => {
    const v = (params as any)?.userId;
    return Array.isArray(v) ? v[0] : v;
  }, [params]);

  const postId = useMemo(() => {
    const v = (params as any)?.postId;
    return Array.isArray(v) ? v[0] : v;
  }, [params]);

  const listRef = useRef<FlatList>(null);
  const didScrollToTargetRef = useRef(false);

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);

  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [skip, setSkip] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const id = await AsyncStorage.getItem('userId');
        setViewerId(id);
      } catch {
        setViewerId(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!userId) return;

    (async () => {
      try {
        const res = await apiService.get(`/users/${userId}`, viewerId ? { requesterUserId: viewerId } : undefined);
        if (res?.success) setProfile(res?.data || null);
      } catch {
        setProfile(null);
      }
    })();
  }, [userId, viewerId]);

  const normalizePosts = useCallback((arr: any[]) => {
    return (Array.isArray(arr) ? arr : []).map((p: any) => ({
      ...p,
      id: p?.id || p?._id,
    })).filter((p: any) => p?.id);
  }, []);

  const mergeDedup = useCallback((prev: any[], next: any[]) => {
    const map = new Map<string, any>();
    [...prev, ...next].forEach((p: any) => {
      const id = String(p?.id || p?._id || '');
      if (!id) return;
      map.set(id, { ...p, id });
    });
    return Array.from(map.values());
  }, []);

  const tryScrollToPost = useCallback((allPosts: any[]) => {
    if (!postId) return;
    if (didScrollToTargetRef.current) return;

    const idx = allPosts.findIndex((p: any) => String(p?.id || p?._id || '') === String(postId));
    if (idx < 0) return;

    didScrollToTargetRef.current = true;
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index: idx, animated: false, viewPosition: 0 });
      } catch {
      }
    });
  }, [postId]);

  const single = useMemo(() => {
    return (params as any)?.single === 'true' || (params as any)?.single === true;
  }, [params]);

  const fetchInitial = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadingMore(false);
    didScrollToTargetRef.current = false;

    try {
      if (single && postId) {
        // Fetch only the specific post
        const res = await apiService.get(`/posts/${postId}`);
        const data = res?.success && res?.data ? [res.data] : [];
        const normalized = normalizePosts(data);
        setPosts(normalized);
        setSkip(normalized.length);
        setHasMore(false); // No more posts to fetch in single mode
        return;
      }

      let nextSkip = 0;
      let merged: any[] = [];
      let lastBatchSize = 0;

      const limit = postId ? INITIAL_PAGE_SIZE : PAGE_SIZE;
      const maxPages = postId ? MAX_INITIAL_PAGES : 1;

      for (let i = 0; i < maxPages; i += 1) {
        const res = await apiService.getUserPosts(String(userId), {
          skip: nextSkip,
          limit,
          viewerId: viewerId || undefined,
        });

        const data = res?.success && Array.isArray(res?.data) ? res.data : [];
        const normalized = normalizePosts(data);
        lastBatchSize = normalized.length;
        merged = mergeDedup(merged, normalized);
        nextSkip += normalized.length;

        tryScrollToPost(merged);

        if (!postId) break;
        const found = merged.some((p: any) => String(p?.id || p?._id || '') === String(postId));
        if (found) break;
        if (normalized.length < limit) break;
      }

      setPosts(merged);
      setSkip(nextSkip);
      setHasMore(lastBatchSize >= limit);
    } catch {
      setPosts([]);
      setSkip(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [mergeDedup, normalizePosts, postId, single, tryScrollToPost, userId, viewerId]);

  const fetchMore = useCallback(async () => {
    if (!userId) return;
    if (loading || loadingMore) return;
    if (!hasMore) return;

    setLoadingMore(true);
    try {
      const res = await apiService.getUserPosts(String(userId), {
        skip,
        limit: PAGE_SIZE,
        viewerId: viewerId || undefined,
      });

      const data = res?.success && Array.isArray(res?.data) ? res.data : [];
      const normalized = normalizePosts(data);

      setPosts(prev => {
        const next = mergeDedup(prev, normalized);
        tryScrollToPost(next);
        return next;
      });

      setSkip(prev => prev + normalized.length);
      setHasMore(normalized.length >= PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loading, loadingMore, mergeDedup, normalizePosts, skip, tryScrollToPost, userId, viewerId]);

  useEffect(() => {
    if (!userId) return;
    setHasMore(true);
    setSkip(0);
    fetchInitial();
  }, [fetchInitial, userId]);

  // Listen for feed updates (like post deletion)
  useEffect(() => {
    const unsub = feedEventEmitter.onFeedUpdate((event) => {
      if (event.type === 'POST_DELETED' && event.postId) {
        console.log('[UserPosts] Post deleted event received:', event.postId);
        setPosts(prev => prev.filter(p => (p.id || p._id) !== event.postId));
      }
    });
    return unsub;
  }, []);


  const onEndReached = () => {
    fetchMore();
  };

  if (!userId) {
    return (
      <SafeAreaView style={styles.loading} edges={['top', 'bottom']}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>
        <Text style={styles.missingText}>Missing userId</Text>
      </SafeAreaView>
    );
  }

  if (loading && posts.length === 0) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color="#0A3D62" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {String(profile?.displayName || profile?.name || profile?.username || 'Posts')}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <FlatList
        ref={listRef}
        data={posts}
        keyExtractor={(item: any, index: number) => String(item?.id || item?._id || `post-${index}`)}
        renderItem={({ item }: { item: any }) => (
          <PostCard
            post={item}
            currentUser={viewerId}
            showMenu={true}
          />
        )}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color="#0A3D62" />
            </View>
          ) : null
        }
        onScrollToIndexFailed={(info) => {
          const offset = info.averageItemLength * info.index;
          listRef.current?.scrollToOffset({ offset, animated: false });
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: false });
          }, 150);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  backBtn: { padding: 6, marginRight: 8 },
  headerRight: { width: 28 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111' },
  footer: { paddingVertical: 16, alignItems: 'center' },
  missingText: { marginTop: 12, color: '#666', fontSize: 14 },
});
