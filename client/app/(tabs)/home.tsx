import { Feather } from "@expo/vector-icons";
import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import PostCard from '@/src/_components/PostCard';
import StoriesRow from '@/src/_components/StoriesRow';
import LiveStreamsRow from '@/src/_components/LiveStreamsRow';
import StoriesViewer from '@/src/_components/StoriesViewer';
import { useHeaderVisibility } from './_layout';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CATEGORIES, getAllStoriesForFeed, getUserProfile } from '../../lib/firebaseHelpers/index';
import { getCategoryImageSource } from '../../lib/categoryImages';
import { apiService } from '@/src/_services/apiService';
import { feedEventEmitter } from '../../lib/feedEventEmitter';
import { startLocationTracking } from '../../services/locationService';


const { width } = Dimensions.get("window");

const MIRROR_HOME = false;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  fab: {
    position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#e0245e', alignItems: 'center', justifyContent: 'center', elevation: 8, zIndex: 100,
  },
  searchBar: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  searchText: { color: '#666', fontSize: 15, fontWeight: '400' },
  headerSection: { paddingBottom: 6, paddingTop: 2 },
  chip: { alignItems: 'center', marginRight: 10 },
  chipIconWrap: { width: 64, height: 64, borderRadius: 14, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  chipIconWrapActive: { borderColor: '#0A3D62', borderWidth: 2.5 },
  chipText: { color: '#666', marginTop: 5, fontSize: 11, textAlign: 'center' },
  chipTextActive: { color: '#111', fontWeight: '700' },
  categoryImage: { width: 64, height: 64, borderRadius: 14 },
});

export default function Home() {

  const defaultCategoryObjects = Array.isArray(DEFAULT_CATEGORIES)
    ? DEFAULT_CATEGORIES.map((cat: any) =>
      typeof cat === 'string'
        ? { name: cat, image: '' }
        : cat
    )
    : [];

  const [categories, setCategories] = useState(defaultCategoryObjects);
  const params = useLocalSearchParams();
  const filter = (params.filter as string) || '';
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [allLoadedPosts, setAllLoadedPosts] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserData, setCurrentUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [privacyFiltered, setPrivacyFiltered] = useState<any[]>([]);
  const [paginationOffset, setPaginationOffset] = useState(20);
  const POSTS_PER_PAGE = 10;
  const [showStoriesViewer, setShowStoriesViewer] = useState(false);
  const [selectedStories, setSelectedStories] = useState<any[]>([]);
  const [storyInitialIndex, setStoryInitialIndex] = useState(0);
  const [storiesRefreshTrigger, setStoriesRefreshTrigger] = useState(0);
  const [storiesRowResetTrigger, setStoriesRowResetTrigger] = useState(0);
  const [storyMedia, setStoryMedia] = useState<{ uri: string; type: string } | null>(null);
  const flatListRef = React.useRef<FlatList>(null);
  const categoriesScrollRef = React.useRef<ScrollView>(null);
  const categoriesAutoScrolledRef = React.useRef(false);
  const openedStoryIdRef = React.useRef<string | null>(null);

  const { hideHeader, showHeader } = useHeaderVisibility();
  const lastScrollYRef = useRef(0);
  const lastEmitTsRef = useRef(0);
  const headerHiddenRef = useRef(false);

  useEffect(() => {
    categoriesAutoScrolledRef.current = false;
  }, [categories.length]);

  // Handle media returning from story-creator screen
  useEffect(() => {
    const uri = params?.storyMediaUri != null ? String(params.storyMediaUri) : '';
    const type = params?.storyMediaType != null ? String(params.storyMediaType) : 'photo';
    if (!uri) return;
    setStoryMedia({ uri, type });
  }, [params?.storyMediaUri]);

  // Get current user ID from AsyncStorage (token-based auth)
  useEffect(() => {
    const getUserId = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        setCurrentUserId(userId);

        // Also fetch user's display name and other info
        if (userId) {
          try {
            const response = await apiService.getUser(userId);
            if (response?.success && response?.data) {
              setCurrentUserData(response.data);
              if (__DEV__) console.log('[Home] User data loaded:', response.data?.displayName || response.data?.name);
            }

            // Start background location tracking for passport stamps
            await startLocationTracking(userId);
          } catch (error) {
            console.error('[Home] Initialization error:', error);
          }
        }
      } catch (error) {
        console.error('[Home] Failed to get userId from storage:', error);
      }
    };
    getUserId();
  }, []);

  // Listen for feed updates (like post deletion)
  useEffect(() => {
    const unsub = feedEventEmitter.onFeedUpdate((event) => {
      if (event.type === 'POST_DELETED' && event.postId) {
        console.log('[Home] Post deleted event received:', event.postId);
        setPosts(prev => prev.filter(p => (p.id || p._id) !== event.postId));
        setAllLoadedPosts(prev => prev.filter(p => (p.id || p._id) !== event.postId));
      }
    });
    return unsub;
  }, []);


  useEffect(() => {
    showHeader();
    return () => {
      showHeader();
    };
  }, [showHeader]);

  // Deep-link support: open StoriesViewer by storyId (used by notifications)
  useEffect(() => {
    const storyIdParam = params?.storyId != null ? String(params.storyId) : '';
    if (!storyIdParam) return;

    if (openedStoryIdRef.current === storyIdParam) return;
    openedStoryIdRef.current = storyIdParam;

    (async () => {
      try {
        const DEFAULT_AVATAR_URL = 'https://via.placeholder.com/200x200.png?text=Profile';

        const res = await getAllStoriesForFeed();
        if (!res?.success || !Array.isArray(res.data)) return;

        const now = Date.now();
        const activeStories = res.data.filter((s: any) => {
          if (s?.expiresAt == null) return true;
          return Number(s.expiresAt) > now;
        });

        const target = activeStories.find((s: any) => {
          const id = s?._id || s?.id;
          return id != null && String(id) === storyIdParam;
        });
        if (!target) return;

        const ownerId = target?.userId != null ? String(target.userId) : '';
        if (!ownerId) return;

        let ownerAvatar = DEFAULT_AVATAR_URL;
        try {
          const profileRes: any = await getUserProfile(ownerId);
          if (profileRes?.success && profileRes?.data?.avatar) {
            ownerAvatar = profileRes.data.avatar;
          }
        } catch { }

        const ownerStoriesRaw = activeStories.filter((s: any) => String(s?.userId || '') === ownerId);
        const transformed = ownerStoriesRaw.map((story: any) => ({
          ...story,
          id: story._id || story.id,
          userId: ownerId,
          userName: story.userName || 'Anonymous',
          userAvatar: ownerAvatar,
          imageUrl: story.image || story.imageUrl || story.mediaUrl,
          videoUrl: story.video || story.videoUrl,
          mediaType: story.video ? 'video' : 'image'
        }));

        const idx = Math.max(0, transformed.findIndex((s: any) => String(s?.id || '') === storyIdParam));
        if (transformed.length === 0) return;

        setSelectedStories(transformed);
        setStoryInitialIndex(idx);
        setShowStoriesViewer(true);
      } catch (e) {
        console.log('[Home] Failed to open story deep-link:', e);
      }
    })();
  }, [params?.storyId]);

  // Memoized shuffle
  const shufflePosts = useCallback((postsArray: any[]) => {
    const shuffled = [...postsArray];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  // Memoized feed mixer
  const createMixedFeed = useCallback((postsArray: any[]) => {
    if (postsArray.length === 0) return [];
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

    // Helper to convert createdAt to timestamp
    const getPostTimestamp = (createdAt: any): number => {
      if (!createdAt) return 0;
      // If it's a Firestore timestamp with toMillis()
      if (typeof createdAt.toMillis === 'function') return createdAt.toMillis();
      // If it's an ISO string
      if (typeof createdAt === 'string') return new Date(createdAt).getTime();
      // If it's already a number
      if (typeof createdAt === 'number') return createdAt;
      return 0;
    };

    const recentPosts = postsArray.filter((p: any) => {
      const postTime = getPostTimestamp(p.createdAt);
      return postTime > oneDayAgo;
    });

    const mediumPosts = postsArray.filter((p: any) => {
      const postTime = getPostTimestamp(p.createdAt);
      return postTime <= oneDayAgo && postTime > threeDaysAgo;
    });

    const olderPosts = postsArray.filter((p: any) => {
      const postTime = getPostTimestamp(p.createdAt);
      return postTime <= threeDaysAgo;
    });

    console.log('[Home] createMixedFeed - recent:', recentPosts.length, 'medium:', mediumPosts.length, 'older:', olderPosts.length);

    const shuffledRecent = shufflePosts(recentPosts);
    const shuffledMedium = shufflePosts(mediumPosts);
    const shuffledOlder = shufflePosts(olderPosts);

    const mixed: any[] = [];
    const recentCount = Math.min(5, shuffledRecent.length);
    mixed.push(...shuffledRecent.slice(0, recentCount));

    const remaining = [...shuffledRecent.slice(recentCount), ...shuffledMedium, ...shuffledOlder];
    mixed.push(...shufflePosts(remaining));
    return mixed;
  }, [shufflePosts]);

  const loadInitialFeed = async (pageNum = 0) => {
    if (pageNum === 0) setLoading(true);
    try {
      // OPTIMIZED: Use standard API service method
      const limit = 50;
      const skip = pageNum * limit;
      const response = await apiService.getPosts({ 
        skip, 
        limit, 
        requesterUserId: currentUserId || undefined 
      });

      // CLEAN RESPONSE HANDLING
      let postsData: any[] = [];
      if (response?.success && Array.isArray(response.data)) {
        postsData = response.data;
        if (__DEV__) console.log('[Home] Got posts:', postsData.length);
      } else if (Array.isArray(response)) {
        postsData = response;
        if (__DEV__) console.log('[Home] Got posts (array):', postsData.length);
      } else {
        console.warn('[Home] Unexpected response format:', response);
        postsData = [];
      }

      // Normalize posts: convert MongoDB _id to id, ensure required fields exist
      const normalizedPosts = postsData.map(p => ({
        ...p,
        id: p.id || p._id, // Use id if exists, otherwise use _id
        isPrivate: p.isPrivate ?? false, // Default to false if not set
        allowedFollowers: p.allowedFollowers || [], // Default to empty array
      }));

      console.log('[Home] Loaded posts count:', normalizedPosts.length);
      // Log post details
      normalizedPosts.forEach(p => {
        console.log(`  Loaded Post: id=${p.id}, userId=${p.userId}, isPrivate=${p.isPrivate}, category=${p.category}, location=${p.location?.name || p.location}`);
      });

      if (pageNum === 0) {
        // First page: replace all
        console.log('[Home] Setting allLoadedPosts to:', normalizedPosts.length);
        setAllLoadedPosts(normalizedPosts);
        const mixedFeed = createMixedFeed(normalizedPosts);
        console.log('[Home] Mixed feed count:', mixedFeed.length);
        setPosts(mixedFeed);
        setPaginationOffset(20); // Reset pagination
      } else {
        // Subsequent pages: append
        setAllLoadedPosts(prev => {
          const updated = [...prev, ...normalizedPosts];
          // Deduplicate by ID
          const unique = Array.from(new Map(updated.map(p => [p.id, p])).values());
          return unique;
        });
      }
    } catch (error) {
      console.error('[Home] Error loading posts:', error);
    } finally {
      if (pageNum === 0) setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const cats = await apiService.getCategories();
      const mappedCats = Array.isArray(cats?.data)
        ? cats.data.map((c: any) => {
          if (typeof c === 'string') return { name: c, image: '' };
          return {
            name: typeof c.name === 'string' ? c.name : '',
            image: typeof c.image === 'string' ? c.image : ''
          };
        }).filter((c: any) => c.name)
        : [];
      setCategories(mappedCats.length > 0 ? mappedCats : defaultCategoryObjects);
    } catch (error) {
      console.error('[Home] Failed to load categories:', error);
      setCategories(defaultCategoryObjects);
    }
  };

  useEffect(() => {
    console.log('[Home] Initial load effect running...');
    loadInitialFeed();
    loadCategories();
  }, []);

  useEffect(() => {
    if (!MIRROR_HOME) return;
    if (!categories || categories.length === 0) return;
    requestAnimationFrame(() => {
      try {
        categoriesScrollRef.current?.scrollToEnd({ animated: false });
      } catch { }
    });
  }, [categories.length]);

  async function filterPostsByPrivacy(posts: any[], userId: string | undefined) {
    if (!userId) return posts.filter(post => !post.isPrivate);

    const viewerId = String(userId);
    return posts.filter(post => {
      const authorId = String(post.userId?._id || post.userId || '');
      if (!authorId) return false;
      if (authorId === viewerId) return true;
      if (!post.isPrivate) return true;
      
      if (post.isPrivate && Array.isArray(post.allowedFollowers)) {
        return post.allowedFollowers.some((id: any) => String(id) === viewerId);
      }
      return false;
    });
  }

  const filteredRaw = React.useMemo(() => {
    console.log('[Home] filteredRaw memo - posts count:', posts.length, 'filter:', filter, 'location:', params.location);

    const locationFilter = params.location as string;
    const selectedPostId = params.postId as string;

    if (locationFilter) {
      const key = String(locationFilter || '').trim().toLowerCase();
      const locationPosts = posts.filter((p: any) => {
        const pLoc = typeof p.location === 'object' ? p.location?.name : p.location;
        const exact = (pLoc || '').toLowerCase() === key;
        if (exact) return true;

        const keys = Array.isArray(p?.locationKeys) ? p.locationKeys : [];
        if (keys.some((k: any) => String(k || '').toLowerCase() === key)) return true;

        const ld = p?.locationData;
        const city = typeof ld?.city === 'string' ? ld.city.toLowerCase() : '';
        const country = typeof ld?.country === 'string' ? ld.country.toLowerCase() : '';
        const cc = typeof ld?.countryCode === 'string' ? ld.countryCode.toLowerCase() : '';
        if (city && city === key) return true;
        if (country && country === key) return true;
        if (cc && cc === key) return true;

        const addr = typeof ld?.address === 'string' ? ld.address.toLowerCase() : '';
        if (addr && addr.includes(key)) return true;

        return false;
      });

      console.log('[Home] filteredRaw location filter - result:', locationPosts.length);
      if (selectedPostId) {
        const selected = locationPosts.find((p: any) => p.id === selectedPostId);
        const others = locationPosts.filter((p: any) => p.id !== selectedPostId);
        return selected ? [selected, ...others] : others;
      }
      return locationPosts;
    }

    if (filter) {
      const categoryPosts = posts.filter((p: any) => p.category?.toLowerCase() === filter.toLowerCase());
      console.log('[Home] filteredRaw category filter - result:', categoryPosts.length);
      return categoryPosts;
    }

    return posts;
  }, [posts, filter, params.location, params.postId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const filtered = await filterPostsByPrivacy(filteredRaw, currentUserId || undefined);
      if (cancelled) return;
      setPrivacyFiltered(filtered.slice(0, paginationOffset));
    })();
    return () => {
      cancelled = true;
    };
  }, [filteredRaw, currentUserId, paginationOffset]);

  const loadMorePosts = useCallback(() => {
    if (loadingMore) return;
    if (privacyFiltered.length >= filteredRaw.length) return;
    setLoadingMore(true);
    setTimeout(() => {
      setPaginationOffset(prev => prev + POSTS_PER_PAGE);
      setLoadingMore(false);
    }, 300);
  }, [loadingMore, privacyFiltered.length, filteredRaw.length]);

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 300));
    setPaginationOffset(20);
    await loadInitialFeed(0);
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#0A3D62" />
      </View>
    );
  }

  const searchText = (!filter && !params.location) ? 'Search' : (params.location || filter);

  return (
    <View style={styles.container}>


      <FlatList
        ref={flatListRef}
        data={privacyFiltered}
        keyExtractor={(item, index) => `post-${item.id}-${index}`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0A3D62" />}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset?.y ?? 0;
          const prevY = lastScrollYRef.current;
          lastScrollYRef.current = y;

          // Ignore tiny jitters
          const delta = y - prevY;
          if (Math.abs(delta) < 6) return;

          // Always show at top
          if (y <= 4) {
            if (headerHiddenRef.current) {
              headerHiddenRef.current = false;
              showHeader();
            }
            return;
          }

          const now = Date.now();
          if (now - lastEmitTsRef.current < 80) return;
          lastEmitTsRef.current = now;

          if (delta > 0) {
            // scrolling down
            if (!headerHiddenRef.current) {
              headerHiddenRef.current = true;
              hideHeader();
            }
          } else {
            // scrolling up -> show immediately
            if (headerHiddenRef.current) {
              headerHiddenRef.current = false;
              showHeader();
            }
          }
        }}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={7}
        removeClippedSubviews={true}
        updateCellsBatchingPeriod={50}

        ListHeaderComponent={() => (
          <View>
            <StoriesRow
              onStoryPress={(stories, initialIndex) => {
                console.log('[Home] onStoryPress called with', stories.length, 'stories, initialIndex:', initialIndex);
                setSelectedStories(stories);
                setStoryInitialIndex(initialIndex || 0);
                setShowStoriesViewer(true);
              }}
              onStoryViewerClose={() => {
                console.log('[Home] StoriesViewer closed - resetting state');
                setShowStoriesViewer(false);
                setSelectedStories([]);
                setStoryInitialIndex(0);
                setStoriesRowResetTrigger((prev: number) => prev + 1);
              }}
              refreshTrigger={storiesRefreshTrigger}
              resetTrigger={storiesRowResetTrigger}
              mirror={MIRROR_HOME}
              incomingMedia={storyMedia}
            />
            <LiveStreamsRow mirror={MIRROR_HOME} />

            <View style={styles.headerSection}>
              <TouchableOpacity
                style={[
                  styles.searchBar,
                  MIRROR_HOME ? { flexDirection: 'row-reverse', justifyContent: 'flex-start' } : null,
                ]}
                onPress={() => router.push('/search-modal')}
              >
                <Feather name="search" size={18} color="#222" />
                <Text style={[styles.searchText, MIRROR_HOME && { marginLeft: 0, marginRight: 8 }]}>{searchText}</Text>
              </TouchableOpacity>

              <ScrollView
                ref={categoriesScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                centerContent={true}
                alwaysBounceHorizontal={true}
                onContentSizeChange={() => {
                  if (!MIRROR_HOME) return;
                  if (categoriesAutoScrolledRef.current) return;
                  categoriesAutoScrolledRef.current = true;
                  requestAnimationFrame(() => {
                    try {
                      categoriesScrollRef.current?.scrollToEnd({ animated: false });
                    } catch { }
                  });
                }}
                contentContainerStyle={[
                  { paddingLeft: 16, paddingRight: 6, paddingVertical: 6, flexGrow: 1, justifyContent: 'center' },
                  MIRROR_HOME && { flexDirection: 'row-reverse' },
                ]}
              >
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.name}
                    style={[styles.chip, MIRROR_HOME && { marginRight: 0, marginLeft: 10 }]}
                    onPress={() => {
                      console.log('[Category] Clicked category:', cat.name);
                      const next = cat.name === filter ? '' : cat.name;
                      console.log('[Category] New filter:', next);
                      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                      router.push(next ? `/(tabs)/home?filter=${encodeURIComponent(next)}` : `/(tabs)/home`);
                    }}
                  >
                    <View style={[styles.chipIconWrap, filter === cat.name && styles.chipIconWrapActive]}>
                      <ExpoImage source={getCategoryImageSource(cat.name, cat.image)} style={styles.categoryImage} />
                    </View>
                    <Text style={[styles.chipText, filter === cat.name && styles.chipTextActive]}>{cat.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}
        renderItem={({ item }: { item: any }) => (
          <PostCard post={item} currentUser={currentUserData || currentUserId} showMenu={false} mirror={MIRROR_HOME} />
        )}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#ffa726" />
            </View>
          ) : privacyFiltered.length < allLoadedPosts.length ? (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}>
              <Text style={{ color: '#999' }}>Scroll for more posts</Text>
            </View>
          ) : (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}>
              <Text style={{ color: '#999' }}>No more posts</Text>
            </View>
          )
        }
        onEndReached={loadMorePosts}
        onEndReachedThreshold={0.5}
      />

      {showStoriesViewer && (
        <Modal
          visible={showStoriesViewer}
          animationType="fade"
          onRequestClose={() => {
            console.log('[Home] StoriesViewer onRequestClose');
            setShowStoriesViewer(false);
            setSelectedStories([]);
            setStoryInitialIndex(0);
            setStoriesRowResetTrigger((prev: number) => prev + 1);
          }}
        >
          <StoriesViewer
            stories={selectedStories}
            initialIndex={storyInitialIndex}
            onClose={() => {
              console.log('[Home] StoriesViewer onClose callback');
              setShowStoriesViewer(false);
              setSelectedStories([]);
              setStoryInitialIndex(0);
              setStoriesRowResetTrigger((prev: number) => prev + 1);
            }}
          />
        </Modal>
      )}
    </View>
  );
}
