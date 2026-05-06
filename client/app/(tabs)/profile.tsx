import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
// Firebase removed - using Backend API
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { safeRouterBack } from '@/lib/safeRouterBack';
import { useAppDialog } from '@/src/_components/AppDialogProvider';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL, BACKEND_URL } from '../../lib/api';
import { useCurrentLocation } from '../../hooks/useCurrentLocation';
import { createStory, getUserHighlights, getUserSectionsSorted, getUserStories } from '../../lib/firebaseHelpers';
import { followUser, sendFollowRequest, unfollowUser } from '../../lib/firebaseHelpers/follow';
import { likePost, unlikePost } from '../../lib/firebaseHelpers/post';
import { getOptimizedImageUrl } from '../../lib/imageHelpers';
import { buildProfileDeepLink, buildProfileWebLink, sharePost, shareProfile } from '../../lib/postShare';

import { userService } from '../../lib/userService';
import { fetchBlockedUserIds, filterOutBlocked } from '../../services/moderation';
import CommentSection from '@/src/_components/CommentSection';
import CreateHighlightModal from '@/src/_components/CreateHighlightModal';
import EditSectionsModal from '@/src/_components/EditSectionsModal';
import HighlightCarousel from '@/src/_components/HighlightCarousel';
import HighlightViewer from '@/src/_components/HighlightViewer';
import PostViewerModal from '@/src/_components/PostViewerModal';
import StoriesViewer from '@/src/_components/StoriesViewer';
import * as Clipboard from 'expo-clipboard';
import { useHeaderVisibility, useHeaderHeight } from './_layout';

import { getTaggedPosts, getUserHighlights as getUserHighlightsAPI, getUserPosts as getUserPostsAPI, getUserProfile as getUserProfileAPI, getUserSections as getUserSectionsAPI } from '@/src/_services/firebaseService';
import { apiService } from '@/src/_services/apiService';
import { getKeyboardOffset, getModalHeight } from '../../utils/responsive';
import { getPassportData } from '../../lib/firebaseHelpers/passport';
import { feedEventEmitter } from '@/lib/feedEventEmitter';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { ResizeMode, Video } from 'expo-av';
import { resolveCanonicalUserId } from '../../lib/currentUser';
import { hapticLight, hapticMedium } from '../../lib/haptics';
import { getCachedData, setCachedData, useNetworkStatus, useOfflineBanner } from '../../hooks/useOffline';
import ProfileHeader from '@/src/_components/profile/ProfileHeader';
import ProfileStats from '@/src/_components/profile/ProfileStats';
import ProfileActions from '@/src/_components/profile/ProfileActions';
import ProfileTabs from '@/src/_components/profile/ProfileTabs';
import ProfileGridItem from '@/src/_components/profile/ProfileGridItem';
import ProfileSections from '@/src/_components/profile/ProfileSections';
import { UploadStoryModal } from '@/src/_components/profile/UploadStoryModal';
import { CollectionsModal, UserMenuModal } from '@/src/_components/profile/ProfileModals';
import { useProfileActions } from '@/hooks/useProfileActions';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const isSmallDevice = SCREEN_HEIGHT < 700;

const responsiveValues = {
  imageHeight: isSmallDevice ? 240 : 340,
  titleSize: isSmallDevice ? 16 : 18,
  labelSize: isSmallDevice ? 13 : 14,
  inputSize: isSmallDevice ? 14 : 15,
  spacing: isSmallDevice ? 12 : 16,
  spacingLarge: isSmallDevice ? 16 : 20,
  inputHeight: isSmallDevice ? 44 : 48,
  modalPadding: isSmallDevice ? 20 : 20,
};


let MapView: any = null;
let Marker: any = null;
if (Platform.OS !== 'web') {
  const RNMaps = require('react-native-maps');
  MapView = RNMaps.default ?? RNMaps;
  Marker = RNMaps.Marker;
}

// Default avatar URL
import { DEFAULT_AVATAR_URL } from '@/lib/api';
const DEFAULT_IMAGE_URL = DEFAULT_AVATAR_URL;
const DEFAULT_AVATAR_SOURCE = { uri: DEFAULT_AVATAR_URL };

function normalizeAvatarUri(uri: any): string | null {
  if (typeof uri === 'object' && uri !== null) {
    const candidate = (uri as any).url || (uri as any).uri || (uri as any).secure_url || '';
    if (typeof candidate === 'string') uri = candidate;
  }
  if (typeof uri !== 'string') return null;
  const trimmed = uri.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === 'null' || lower === 'undefined' || lower === 'n/a' || lower === 'na') return null;
  if (lower.includes('via.placeholder.com/200x200.png?text=profile')) return null;
  if (lower.includes('/default%2fdefault-pic.jpg') || lower.includes('/default/default-pic.jpg')) return null;
  if (lower.startsWith('http://')) return `https://${trimmed.slice(7)}`;
  if (lower.startsWith('//')) return `https:${trimmed}`;
  return trimmed;
}

function getInitials(nameOrUsername: any): string {
  if (typeof nameOrUsername !== 'string') return 'U';
  const cleaned = nameOrUsername.trim();
  if (!cleaned) return 'U';

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
}

function normalizeExternalUrl(input: any): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return raw;
  return `https://${raw}`;
}

function isObjectLike(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object';
}

type ProfileLinkPlatform =
  | 'facebook'
  | 'instagram'
  | 'twitter'
  | 'whatsapp'
  | 'youtube'
  | 'linkedin'
  | 'website'
  | 'unknown';

function splitProfileLinks(raw: any): string[] {
  if (typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function getUrlHost(url: string): string | null {
  try {
    const normalized = normalizeExternalUrl(url) || url;
    const withoutProto = normalized.replace(/^https?:\/\//i, '');
    const host = withoutProto.split('/')[0]?.trim();
    return host || null;
  } catch {
    return null;
  }
}

function detectProfileLinkPlatform(url: string): ProfileLinkPlatform {
  const host = (getUrlHost(url) || '').toLowerCase();
  if (!host) return 'unknown';
  if (host.includes('facebook.com') || host.includes('fb.com') || host.includes('fb.me')) return 'facebook';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
  if (host.includes('whatsapp.com') || host.includes('wa.me')) return 'whatsapp';
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
  if (host.includes('linkedin.com')) return 'linkedin';
  return 'website';
}

function getFaviconUrl(url: string): string {
  return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;
}

// Utility to parse/sanitize coordinates
function parseCoord(val: any): number | null {
  if (typeof val === 'number' && isFinite(val)) return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    return isFinite(n) ? n : null;
  }
  return null;
}

function isVideoUrl(url: any): boolean {
  if (typeof url !== 'string' || !url) return false;
  const lower = url.toLowerCase();

  // If it has a clear image extension, it's NOT a video
  if (/\.(jpg|jpeg|png|heic|heif|webp|gif)(\?|$)/i.test(lower)) {
    return false;
  }

  // Standard extensions
  const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.quicktime'];
  // Check for extension, 'video' in path, or signed cloud URLs that often contain 'video'
  return videoExtensions.some(ext => lower.includes(ext)) || 
         lower.startsWith('content://media/external/video/') ||
         lower.includes('/video/') ||
         lower.includes('ext-video') ||
         (lower.startsWith('http') && (lower.includes('video') || lower.includes('mp4') || lower.includes('m4v')));
}

// Types
type Highlight = {
  id: string;
  title: string;
  coverImage: string;
  stories: { id: string; image: string }[];
};

// Marker component to keep map re-rendering until images load (or timeout)
const ProfilePostMarker: React.FC<{ lat: number; lon: number; imageUrl: string; avatarUrl: string; onPress: () => void }> = ({ lat, lon, imageUrl, avatarUrl, onPress }) => {
  const [tracks, setTracks] = useState(true);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setTracks(false), 20000); // allow very slow networks to finish
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (imgLoaded && avatarLoaded) setTracks(false);
  }, [imgLoaded, avatarLoaded]);

  // Use thumbnail for profile map markers (200px for small markers)
  const markerImageUrl = getOptimizedImageUrl(imageUrl, 'map-marker');
  const markerAvatarUrl = getOptimizedImageUrl(avatarUrl, 'thumbnail');

  return (
    Marker ? (
      <Marker coordinate={{ latitude: lat, longitude: lon }} tracksViewChanges={tracks} onPress={onPress}>
        <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={{ backgroundColor: 'transparent' }}>
          <View style={{ position: 'relative', width: 48, height: 48 }}>
            <View style={{ width: 48, height: 48, borderRadius: 12, borderWidth: 2, borderColor: '#ffa726', overflow: 'hidden', backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 3 }}>
              <ExpoImage
                source={{ uri: markerImageUrl }}
                style={{ width: 44, height: 44, borderRadius: 10 }}
                contentFit="cover"
                cachePolicy="memory-disk"
                priority="high"
                transition={150}
                onLoad={() => setImgLoaded(true)}
                onError={() => setImgLoaded(true)}
              />
            </View>
            <View style={{ position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#fff', backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 4 }}>
              <ExpoImage
                source={{ uri: markerAvatarUrl }}
                style={{ width: 16, height: 16, borderRadius: 8 }}
                contentFit="cover"
                cachePolicy="memory-disk"
                priority="high"
                onLoad={() => setAvatarLoaded(true)}
                onError={() => setAvatarLoaded(true)}
              />
            </View>
          </View>
        </TouchableOpacity>
      </Marker>
    ) : null
  );
};

type ProfileData = {
  id: string;
  uid: string;
  name?: string;
  displayName?: string;  // Backend returns displayName, not name
  username?: string;
  email: string;
  avatar?: string;
  photoURL?: string;  // Firebase field name
  bio?: string;
  website?: string;
  location?: string;
  phone?: string;
  interests?: string;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  locationsCount?: number;
  followers?: string[];
  following?: string[];
  isPrivate?: boolean;
  approvedFollowers?: string[];
  isApprovedFollower?: boolean;
  followRequestPending?: boolean;
  firebaseUid?: string;  // Backend field
};

function getPostId(post: any): string {
  if (!post) return '';
  const id = post.id ?? post._id;
  return typeof id === 'string' ? id : String(id ?? '');
}

export default function Profile({ userIdProp }: any) {
  // Constants
  const insets = useSafeAreaInsets();
  const POSTS_PER_PAGE = 12;

  // State and context
  const [storiesViewerVisible, setStoriesViewerVisible] = useState(false);
  const [userStories, setUserStories] = useState<any[]>([]);
  /** Instagram-style: tap profile photo to view full-screen (when not opening stories). */
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [userMenuVisible, setUserMenuVisible] = useState(false);
  const [highlightViewerVisible, setHighlightViewerVisible] = useState(false);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserUidAlias, setCurrentUserUidAlias] = useState<string | null>(null);
  const [currentUserFirebaseAlias, setCurrentUserFirebaseAlias] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const router = useRouter();
  const { showSuccess } = useAppDialog();
  const params = useLocalSearchParams();

  // Get current user ID from AsyncStorage (token-based auth)
  useEffect(() => {
    const getUserId = async () => {
      try {
        const userId = await resolveCanonicalUserId();
        setCurrentUserId(userId);
        const [uidAlias, firebaseAlias] = await Promise.all([
          AsyncStorage.getItem('uid'),
          AsyncStorage.getItem('firebaseUid'),
        ]);
        setCurrentUserUidAlias(uidAlias);
        setCurrentUserFirebaseAlias(firebaseAlias);
      } catch (error) {
        console.error('[Profile] Failed to get userId from storage:', error);
      }
    };
    getUserId();
  }, []);

  // Extract viewedUserId - handle both cases
  let viewedUserId: string | undefined;
  if (userIdProp) {
    viewedUserId = userIdProp;
  } else if (params.user) {
    // params.user could be an array or string
    viewedUserId = Array.isArray(params.user) ? params.user[0] : params.user;
  } else {
    viewedUserId = currentUserId || undefined;
  }

  // Avoid noisy logs on a hot screen

  // Determine if viewing own profile - compare IDs or check if no explicit user passed
  const selfIds = new Set(
    [currentUserId, currentUserUidAlias, currentUserFirebaseAlias]
      .filter(Boolean)
      .map((v) => String(v))
  );
  const isOwnProfile = (viewedUserId && selfIds.has(String(viewedUserId))) || (!userIdProp && !params.user && selfIds.size > 0);

  if (viewedUserId && selfIds.has(String(viewedUserId)) && currentUserId && viewedUserId !== currentUserId) {
    viewedUserId = currentUserId;
  }

  // Avoid noisy logs on a hot screen

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileAvatarFailed, setProfileAvatarFailed] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [approvedFollower, setApprovedFollower] = useState(false);
  const [followRequestPending, setFollowRequestPending] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [posts, setPosts] = useState<any[]>([]);
  const [savedSectionPosts, setSavedSectionPosts] = useState<any[]>([]);
  const [passportLocationsCount, setPassportLocationsCount] = useState<number>(0);
  const [sections, setSections] = useState<{ name: string; postIds: string[]; coverImage?: string; visibility?: 'public' | 'private' | 'specific'; collaborators?: any[] }[]>([]);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [postViewerVisible, setPostViewerVisible] = useState<boolean>(false);
  const [selectedPostIndex, setSelectedPostIndex] = useState<number>(0);
  const [segmentTab, setSegmentTab] = useState<'grid' | 'map' | 'tagged' | 'saved'>('grid');
  const { location: currentLocation } = useCurrentLocation();
  const [taggedPosts, setTaggedPosts] = useState<any[]>([]);
  const [editSectionsModal, setEditSectionsModal] = useState<boolean>(false);
  const [viewCollectionsModal, setViewCollectionsModal] = useState<boolean>(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [likedPosts, setLikedPosts] = useState<{ [key: string]: boolean }>({});
  const [savedPosts, setSavedPosts] = useState<{ [key: string]: boolean }>({});
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [commentModalPostId, setCommentModalPostId] = useState<string>('');
  const [commentModalAvatar, setCommentModalAvatar] = useState<string>('');
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const { isOnline } = useNetworkStatus();
  const { showBanner } = useOfflineBanner();
  const PROFILE_CACHE_KEY = useMemo(
    () => `profile_v3_${String(viewedUserId || 'unknown')}_${String(currentUserId || 'anon')}`,
    [viewedUserId, currentUserId]
  );

  // Story Upload State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const hasLoadedOnceRef = useRef(false);
  const isProfileLoadingRef = useRef(false);
  const lastProfileLoadAtRef = useRef(0);
  const lastRefreshEventAtRef = useRef(0);
  const MIN_PROFILE_RELOAD_MS = 2500;
  const MIN_REFRESH_EVENT_GAP_MS = 1200;
  const { hideHeader, showHeader } = useHeaderVisibility();
  const [refreshing, setRefreshing] = useState(false);
  
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshTrigger(prev => prev + 1);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  // Header padding is handled by Tabs sceneStyle (see (tabs)/_layout.tsx)
  const headerHeight = 0;

  // Always show the TopMenu when this tab gains focus
  // (fixes: header stays hidden if Home screen hid it before user switches to Profile)
  useFocusEffect(
    useCallback(() => {
      showHeader();
      headerHiddenRef.current = false;
    }, [showHeader])
  );

  const lastScrollYRef = useRef(0);
  const lastEmitTsRef = useRef(0);
  const headerHiddenRef = useRef(false);

  // Handle return from story-creator
  useEffect(() => {
    const uri = params?.storyMediaUri != null ? String(params.storyMediaUri) : '';
    const type = params?.storyMediaType != null ? String(params.storyMediaType) : 'photo';
    if (!uri) return;
    setSelectedMedia({ uri, type });
    setShowUploadModal(true);
  }, [params?.storyMediaUri]);

  // Location suggestions for stories
  useEffect(() => {
    if (locationQuery.length < 2) {
      setLocationSuggestions([]);
      return;
    }
    setLoadingLocations(true);
    const timer = setTimeout(async () => {
      try {
        const { mapService } = await import('../../services');
        const suggestions = await mapService.getAutocompleteSuggestions(locationQuery);
        const predictions = suggestions.map((s: any) => ({
          placeId: s.placeId,
          name: s.mainText || s.description || 'Location',
          address: s.description || '',
        }));
        setLocationSuggestions(predictions);
      } catch (err) {
        setLocationSuggestions([]);
      } finally {
        setLoadingLocations(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [locationQuery]);

  const handleAddStory = () => {
    if (!currentUserId) {
      Alert.alert('Login required', 'Please login to create a story');
      return;
    }
    hapticLight();
    router.push('/story-creator' as any);
  };

  const sectionSourcePosts = useMemo(() => {
    const merged = [...posts, ...savedSectionPosts];
    const byId = new Map<string, any>();
    for (const p of merged) {
      const id = getPostId(p);
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, p);
    }
    return Array.from(byId.values());
  }, [posts, savedSectionPosts]);

  const visiblePosts = selectedSection
    ? sectionSourcePosts.filter((p: any) => (sections.find((s: any) => s.name === selectedSection)?.postIds || []).includes(getPostId(p)))
    : posts;

  const PROFILE_MAP_ENABLED = false;

  useEffect(() => {
    if (!PROFILE_MAP_ENABLED && segmentTab === 'map') {
      setSegmentTab('grid');
    }
  }, [PROFILE_MAP_ENABLED, segmentTab]);

  // Hook for actions
  const {
    followLoading: actionFollowLoading,
    handleFollowToggle,
    handleMessage: hookHandleMessage,
    handleLikePost,
    handleBlockUser
  } = useProfileActions({
    currentUserId,
    viewedUserId: viewedUserId ?? null,
    isOwnProfile,
    isPrivate,
    isFollowing,
    setIsFollowing,
    setProfile,
    setApprovedFollower,
    setFollowRequestPending,
    likedPosts,
    setLikedPosts,
    savedPosts,
    setSavedPosts,
    router
  });

  // Sync loading state
  useEffect(() => {
    setFollowLoading(actionFollowLoading);
  }, [actionFollowLoading]);

  const handleMessage = () => {
    hookHandleMessage(profile, approvedFollower);
  };

  const handleSavePost = async (post: any) => {
    if (!currentUserId || !post?.id) return;
    const isSaved = savedPosts[post.id];
    setSavedPosts((prev: any) => ({ ...prev, [post.id]: !isSaved }));
  };

  const handleSharePost = async (post: any) => {
    try {
      await sharePost(post);
    } catch (e) {
      if (__DEV__) console.log('Share error:', e);
    }
  };

  // Report user handler
  const handleReportUser = () => {
    setUserMenuVisible(false);
    Alert.alert(
      'Report User',
      'What would you like to report?',
      [
        { text: 'Spam', onPress: () => submitReport('spam') },
        { text: 'Inappropriate Content', onPress: () => submitReport('inappropriate') },
        { text: 'Harassment', onPress: () => submitReport('harassment') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const submitReport = async (reason: string) => {
    if (!currentUserId || !viewedUserId) return;

    try {
      // Report user via backend API
      const success = await userService.reportUser(
        viewedUserId,
        currentUserId,
        reason
      );

      if (success) {
        Alert.alert('Report Submitted', 'Thank you for your report. We will review it shortly.');
      } else {
        throw new Error('Report request failed');
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    }
  };

  // Add missing highlight handler
  const handlePressHighlight = (highlight: Highlight) => {
    setSelectedHighlightId(highlight.id);
    setHighlightViewerVisible(true);
  };

  // Effects
  useFocusEffect(
    React.useCallback(() => {
      const forceReload = refreshTrigger > 0;
      const fetchData = async () => {
        // Don't fetch data if viewedUserId is not set yet
        if (!viewedUserId) {
          setLoading(false);
          return;
        }

        if (isProfileLoadingRef.current) return;

        const shouldThrottle =
          !forceReload &&
          hasLoadedOnceRef.current &&
          Date.now() - lastProfileLoadAtRef.current < MIN_PROFILE_RELOAD_MS;

        if (shouldThrottle) {
          return;
        }

        isProfileLoadingRef.current = true;

        let cacheHydratedNow = false;
        if (!forceReload && !hasLoadedOnceRef.current) {
          try {
            const snap = await getCachedData<any>(PROFILE_CACHE_KEY);
            if (snap?.profile) {
              cacheHydratedNow = true;
              setProfile(snap.profile);
              setIsPrivate(!!snap.isPrivate);
              setApprovedFollower(!!snap.approvedFollower);
              setFollowRequestPending(!!(snap.profile as any)?.followRequestPending);
              if (Array.isArray(snap.posts)) setPosts(snap.posts);
              if (Array.isArray(snap.sections)) setSections(snap.sections);
              if (Array.isArray(snap.highlights)) setHighlights(snap.highlights);
              if (Array.isArray(snap.userStories)) setUserStories(snap.userStories);
              if (Array.isArray(snap.taggedPosts)) setTaggedPosts(snap.taggedPosts);
              if (Array.isArray(snap.savedSectionPosts)) setSavedSectionPosts(snap.savedSectionPosts);
              setLoading(false);
            }
          } catch {
            // ignore cache hydrate errors
          }
        }

        if (!hasLoadedOnceRef.current && !cacheHydratedNow) {
          setLoading(true);
        }

        try {
          const timestamp = Date.now();
          const [blockedSet, profileRes] = await Promise.all([
            currentUserId ? fetchBlockedUserIds(currentUserId) : Promise.resolve(new Set<string>()),
            apiService.get(`/users/${viewedUserId}/aggregated`, { requesterUserId: currentUserId, _t: timestamp }),
          ]);

          if (!profileRes.success || !profileRes.data) {
            console.warn('[Profile] Aggregated fetch failed:', profileRes.error);
            setProfile(null);
            return;
          }

          const profileData = profileRes.data;
          setProfile(profileData);
          
          // Hydrate stats and permissions from aggregated data
          setIsPrivate(!!profileData.isPrivate);
          setApprovedFollower(!!profileData.isApprovedFollower);
          setFollowRequestPending(!!profileData.followRequestPending);
          setIsFollowing(!!profileData.isFollowing);
          setPassportLocationsCount(profileData.passportCount || 0);

          const canViewPrivateProfile = !!profileData.hasAccess;
          setLoading(false);

          // Fetch only secondary media/lists in parallel
          const secondaryPromises = [
            canViewPrivateProfile ? apiService.getUserPosts(viewedUserId, { viewerId: currentUserId, _t: timestamp }).catch(() => null) : Promise.resolve(null),
            canViewPrivateProfile ? apiService.get(`/users/${viewedUserId}/sections`, { viewerId: currentUserId, _t: timestamp }).catch(() => null) : Promise.resolve(null),
            canViewPrivateProfile ? getUserHighlights(viewedUserId, currentUserId || undefined).catch(() => null) : Promise.resolve(null),
            canViewPrivateProfile ? getUserStories(viewedUserId).catch(() => null) : Promise.resolve(null),
          ];

          const [postsRes, sectionsRes, highlightsRes, storiesRes] = await Promise.all(secondaryPromises);

          // Hydrate state
          let postsData: any[] = [];
          if ((postsRes as any)?.success) {
            postsData = Array.isArray((postsRes as any).data) ? (postsRes as any).data : ((postsRes as any).posts || []);
          }
          
          if (__DEV__ && postsData.length > 0) {
            console.log('[Profile] Sample Post Enrichment:', {
              id: postsData[0]._id || postsData[0].id,
              isLiked: postsData[0].isLiked,
              isSaved: postsData[0].isSaved,
              saved: postsData[0].saved
            });
          }

          const filteredPosts = filterOutBlocked(postsData, blockedSet);
          setPosts(filteredPosts.slice(0, 36));

          let sectionsData: any[] = [];
          if ((sectionsRes as any)?.success) {
            sectionsData = Array.isArray((sectionsRes as any).data) ? (sectionsRes as any).data : ((sectionsRes as any).sections || []);
          }
          setSections(sectionsData);

          let highlightsData: any[] = [];
          if ((highlightsRes as any)?.success) {
            highlightsData = Array.isArray((highlightsRes as any).data) ? (highlightsRes as any).data : ((highlightsRes as any).highlights || []);
          }
          const normalizedHighlights = highlightsData.map((h: any) => ({
            ...h,
            id: String(h?.id || h?._id || ''),
            title: h?.title || h?.name || 'Highlight',
            coverImage: h?.coverImage || h?.image || h?.cover || '',
          })).filter((h: any) => !!h.id);
          setHighlights(normalizedHighlights);

          let userStoriesForCache: any[] = [];
          if ((storiesRes as any)?.success && Array.isArray((storiesRes as any)?.stories)) {
            const nowTime = Date.now();
            userStoriesForCache = (storiesRes as any).stories
              .filter((s: any) => !s.expiresAt || new Date(s.expiresAt).getTime() > nowTime)
              .map((story: any) => ({
                ...story,
                id: story._id || story.id,
                userId: viewedUserId,
                userName: profileData?.username || profileData?.name || 'User',
                userAvatar: normalizeAvatarUri(profileData?.avatar) || '',
                imageUrl: story.image || story.imageUrl || story.mediaUrl,
                videoUrl: story.video || story.videoUrl,
                mediaType: story.video ? 'video' : 'image',
                createdAt: story.createdAt || Date.now()
              }));
            userStoriesForCache.sort((a, b) => (Date.parse(String(a.createdAt)) || 0) - (Date.parse(String(b.createdAt)) || 0));
            setUserStories(userStoriesForCache);
          }

          // Lazy load tagged and saved will be handled by useEffect below


          // Cache snapshot
          try {
            await setCachedData(PROFILE_CACHE_KEY, {
              profile: profileData,
              isPrivate: !!profileData.isPrivate,
              approvedFollower: !!profileData.isApprovedFollower,
              posts: filteredPosts.slice(0, 36),
              sections: sectionsData,
              highlights: normalizedHighlights,
              userStories: userStoriesForCache,
              taggedPosts: [],
              savedSectionPosts: [],
            }, { ttl: 24 * 60 * 60 * 1000 });
          } catch {}

          if (__DEV__) console.log('[Profile] All data fetched successfully');
        } catch (err) {
          console.error('[Profile] Error fetching data:', err);
        } finally {
          isProfileLoadingRef.current = false;
          lastProfileLoadAtRef.current = Date.now();
          setLoading(false);
          hasLoadedOnceRef.current = true;
        }
      };

      fetchData();
    }, [viewedUserId, currentUserId, currentUserUidAlias, currentUserFirebaseAlias, isOwnProfile, refreshTrigger])
  );

  useEffect(() => {
    setProfileAvatarFailed(false);
  }, [profile?.avatar, (profile as any)?.photoURL, (profile as any)?.profilePicture]);

  // Lazy Load Tab Content
  useEffect(() => {
    if (segmentTab === 'tagged' && taggedPosts.length === 0 && !loading && !isPrivate && viewedUserId) {
      getTaggedPosts(viewedUserId, currentUserId || undefined).then(res => {
        if (res?.success) setTaggedPosts(filterOutBlocked(Array.isArray(res.data) ? res.data : (res.posts || []), new Set()));
      });
    }
    if (segmentTab === 'saved' && isOwnProfile && savedSectionPosts.length === 0 && !loading && viewedUserId) {
      apiService.get(`/users/${viewedUserId}/saved`, { viewerId: currentUserId }).then(res => {
        const data = res?.data || res;
        if (Array.isArray(data)) setSavedSectionPosts(filterOutBlocked(data, new Set()));
      });
    }
  }, [segmentTab, viewedUserId, currentUserId, isOwnProfile, isPrivate, loading]);

  const handleAvatarPick = async () => {
    try {
      // Pick image
      const picker = await import('expo-image-picker');
      const result = await picker.launchImageLibraryAsync({
        mediaTypes: picker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: false
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri && currentUserId) {
        try {
          // Upload image
          const { uploadImage: uploadImageFn, updateUserProfile } = await import('../../lib/firebaseHelpers');
          const imageUri = result.assets[0].uri;

          if (!imageUri) {
            Alert.alert('Error', 'Image URI is invalid');
            return;
          }

          const uploadRes = await uploadImageFn(imageUri, `avatars/${currentUserId}`);

          if (uploadRes.success && uploadRes.url) {
            // Update backend profile
            const updateRes = await updateUserProfile(currentUserId, { avatar: uploadRes.url });
            if (updateRes.success) {
              setProfile(prev => prev ? { ...prev, avatar: uploadRes.url ?? '' } : prev);
              await AsyncStorage.setItem('userAvatar', String(uploadRes.url));
              showSuccess('Profile picture updated!');
            } else {
              Alert.alert('Error', 'Failed to update profile avatar: ' + (updateRes.error || 'Unknown error'));
            }
          } else {
            Alert.alert('Error', 'Image upload failed: ' + (uploadRes.error || 'Unknown error'));
          }
        } catch (uploadError: any) {
          console.error('Avatar upload error:', uploadError);
          Alert.alert('Error', 'Error uploading image: ' + uploadError.message);
        }
      }
    } catch (error: any) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Error picking image: ' + error.message);
    }
  };

  // Listen for feed updates (like post deletion)
  useEffect(() => {
    const unsub = feedEventEmitter.onFeedUpdate((event) => {
      if (event.type === 'POST_DELETED' && event.postId) {
        if (__DEV__) console.log('[Profile] Post deleted event received:', event.postId);
        // 1. Update local states
        const targetId = String(event.postId).split('-loop')[0];
        const filterFn = (prev: any[]) => (Array.isArray(prev) ? prev.filter(p => {
          const pid = String(p?.id || p?._id || '').split('-loop')[0];
          return pid !== targetId;
        }) : []);

        setPosts(prev => filterFn(prev));
        setTaggedPosts(prev => filterFn(prev));
        setSavedSectionPosts(prev => filterFn(prev));
        
        // 2. Aggressively update all related profile caches to prevent "ghost" post on restart
        (async () => {
          try {
            const allKeys = await AsyncStorage.getAllKeys();
            const profileKeys = allKeys.filter(k => k.includes('profile_v2_') || k.includes('profile_cache_'));
            
            for (const fullKey of profileKeys) {
              try {
                const cached = await AsyncStorage.getItem(fullKey);
                if (cached) {
                  let entry = JSON.parse(cached);
                  let snap = entry.data || entry; // handle both raw and CacheEntry formats
                  let changed = false;

                  if (snap && Array.isArray(snap.posts)) {
                    const originalLen = snap.posts.length;
                    snap.posts = snap.posts.filter((p: any) => {
                      const pid = String(p?.id || p?._id || '').split('-loop')[0];
                      return pid !== targetId;
                    });
                    if (snap.posts.length !== originalLen) changed = true;
                  }

                  if (snap && Array.isArray(snap.taggedPosts)) {
                    const originalLen = snap.taggedPosts.length;
                    snap.taggedPosts = snap.taggedPosts.filter((p: any) => {
                      const pid = String(p?.id || p?._id || '').split('-loop')[0];
                      return pid !== targetId;
                    });
                    if (snap.taggedPosts.length !== originalLen) changed = true;
                  }

                  if (snap && Array.isArray(snap.savedSectionPosts)) {
                    const originalLen = snap.savedSectionPosts.length;
                    snap.savedSectionPosts = snap.savedSectionPosts.filter((p: any) => {
                      const pid = String(p?.id || p?._id || '').split('-loop')[0];
                      return pid !== targetId;
                    });
                    if (snap.savedSectionPosts.length !== originalLen) changed = true;
                  }

                  if (changed) {
                    if (entry.data) entry.data = snap; else entry = snap;
                    await AsyncStorage.setItem(fullKey, JSON.stringify(entry));
                  }
                }
              } catch (e) {
                await AsyncStorage.removeItem(fullKey);
              }
            }
          } catch (e) {
            if (__DEV__) console.warn('[Profile] Failed to aggressively clear caches:', e);
          }
        })();
        
        // 3. Refresh profile stats (to update post count 7 -> 6)
        if (viewedUserId) {
          apiService.get(`/users/${viewedUserId}/aggregated`, { requesterUserId: currentUserId })
            .then(res => {
              if (res.success && res.data) {
                setProfile(res.data);
                setIsPrivate(!!res.data.isPrivate);
                setApprovedFollower(!!res.data.isApprovedFollower);
              }
            }).catch(() => {});
        }
      }
      if (event.type === 'POST_UPDATED' && event.postId) {
        const patch = event.data && typeof event.data === 'object' ? event.data : {};
        const apply = (p: any) => {
          if (!p) return p;
          const ids = [String(p.id || ''), String(p._id || ''), String((p as any).postId || '')].filter(Boolean);
          if (!ids.includes(String(event.postId))) return p;
          return {
            ...p,
            ...patch,
            updatedAt: new Date().toISOString(),
          };
        };
        setPosts(prev => (Array.isArray(prev) ? prev.map(apply) : prev));
        setTaggedPosts(prev => (Array.isArray(prev) ? prev.map(apply) : prev));
        setSavedSectionPosts(prev => (Array.isArray(prev) ? prev.map(apply) : prev));
      }
      if (event.type === 'HIGHLIGHT_DELETED' && (event as any).highlightId) {
        const hid = String((event as any).highlightId);
        setHighlights((prev) => (Array.isArray(prev) ? prev.filter((h: any) => String(h?.id || h?._id || '') !== hid) : prev));
      }
    });

    // Listen for general feed updates to refresh all data (including stories)
    const subscription = feedEventEmitter.addListener('feedUpdated', () => {
      const now = Date.now();
      if (now - lastRefreshEventAtRef.current < MIN_REFRESH_EVENT_GAP_MS) {
        return;
      }
      lastRefreshEventAtRef.current = now;
      if (__DEV__) console.log('[Profile] Feed updated signal received, refreshing data...');
      setRefreshTrigger(prev => prev + 1);
    });

    return () => {
      unsub();
      subscription.remove();
    };
  }, []);


  const renderProfileHeader = useMemo(() => {
    return (
      <View style={styles.content}>
        <ProfileHeader 
          profile={profile}
          userStories={userStories}
          isOwnProfile={isOwnProfile}
          isPrivate={isPrivate}
          approvedFollower={approvedFollower}
          onPressAvatar={() => {
            hapticLight();
            if (userStories.length > 0) {
              setStoriesViewerVisible(true);
            } else if (isOwnProfile) {
              handleAvatarPick();
            }
          }}
          onAddStory={handleAddStory}
          onPressPassport={() => {
            hapticLight();
            router.push({ pathname: '/passport', params: { user: viewedUserId } } as any);
          }}
        />

        <ProfileStats 
          locationsCount={passportLocationsCount}
          postsCount={Number(profile?.postsCount ?? posts.length)}
          followersCount={Math.max(0, Number(profile?.followersCount ?? profile?.followers ?? 0))}
          followingCount={Math.max(0, Number(profile?.followingCount ?? profile?.following ?? 0))}
          onPressLocations={() => {
            if (!viewedUserId) return;
            router.push({
              pathname: '/user/[userId]/locations',
              params: { userId: String(viewedUserId) }
            } as any);
          }}
          onPressFollowers={() => {
            router.push(`/friends?userId=${viewedUserId}&tab=followers` as any);
          }}
          onPressFollowing={() => {
            router.push(`/friends?userId=${viewedUserId}&tab=following` as any);
          }}
          isPrivate={isPrivate}
          isOwnProfile={isOwnProfile}
          approvedFollower={approvedFollower}
        />

        <ProfileActions 
          isOwnProfile={isOwnProfile}
          isFollowing={isFollowing}
          followRequestPending={followRequestPending}
          followLoading={followLoading}
          isPrivate={isPrivate}
          approvedFollower={approvedFollower}
          onFollowToggle={handleFollowToggle}
          onMessage={handleMessage}
          onEditProfile={() => {
            hapticLight();
            router.push({ pathname: '/edit-profile', params: { userId: viewedUserId } } as any);
          }}
          onViewCollections={() => {
            hapticLight();
            if (isOwnProfile) {
              router.push('/(tabs)/saved' as any);
            } else {
              setViewCollectionsModal(true);
            }
          }}
        />

        {(!isPrivate || isOwnProfile || approvedFollower) && (
          <View style={{ marginBottom: 12 }}>
            <HighlightCarousel 
              highlights={highlights} 
              onPressHighlight={handlePressHighlight} 
              isOwnProfile={isOwnProfile} 
            />
            <HighlightViewer
              visible={highlightViewerVisible}
              highlightId={selectedHighlightId}
              onClose={() => setHighlightViewerVisible(false)}
              userId={isOwnProfile ? (currentUserId || undefined) : undefined}
              userName={profile?.displayName || profile?.name}
              userAvatar={profile?.avatar || profile?.photoURL || undefined}
            />
          </View>
        )}

        {(!isPrivate || isOwnProfile || approvedFollower) && (
          <ProfileTabs 
            activeTab={segmentTab}
            onChangeTab={(tab) => {
              setSegmentTab(tab);
              if (tab !== 'grid') setSelectedSection(null);
            }}
            mapEnabled={PROFILE_MAP_ENABLED}
          />
        )}

        {(!isPrivate || isOwnProfile || approvedFollower) && segmentTab === 'grid' && (
          <ProfileSections
            sections={sections}
            selectedSection={selectedSection}
            onSelectSection={setSelectedSection}
            sectionSourcePosts={sectionSourcePosts}
            getPostId={getPostId}
            isOwnProfile={isOwnProfile}
            currentUserId={currentUserId}
          />
        )}
      </View>
    );
  }, [profile, userStories, isOwnProfile, isPrivate, approvedFollower, passportLocationsCount, posts.length, highlights, highlightViewerVisible, selectedHighlightId, segmentTab, sections, selectedSection, isFollowing, followRequestPending, followLoading, viewedUserId]);

  const currentPostsArray = segmentTab === 'grid' 
    ? (selectedSection ? visiblePosts : posts) 
    : (segmentTab === 'saved' ? savedSectionPosts : taggedPosts);

  const normalizeMediaUrl = useCallback((url: string) => {
    if (!url) return '';
    const trimmed = url.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//') || trimmed.startsWith('data:') || trimmed.startsWith('file:') || trimmed.startsWith('ph:')) {
      return trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
    }
    if (trimmed.includes('cloudinary.com')) {
      return `https://${trimmed.replace(/^\/+/, '')}`;
    }
    const cleanUrl = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return `${BACKEND_URL}${cleanUrl}`;
  }, []);

  const renderGridItem = useCallback(({ item, index }: { item: any, index: number }) => {
    return (
      <ProfileGridItem
        item={item}
        index={index}
        onPress={(item, idx) => {
          const modalIndex = currentPostsArray.findIndex(p => (p.id || p._id) === (item.id || item._id));
          setSelectedPostIndex(modalIndex >= 0 ? modalIndex : idx);
          setPostViewerVisible(true);
        }}
        normalizeMediaUrl={normalizeMediaUrl}
        isVideoUrl={isVideoUrl}
        DEFAULT_IMAGE_URL={DEFAULT_IMAGE_URL}
      />
    );
  }, [currentPostsArray, normalizeMediaUrl]);

  // UI
  // Show loading while auth is initializing
  if (authLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#007aff" />
          <Text style={{ marginTop: 10, color: '#999' }}>Loading auth...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show error if not logged in on own profile tab
  if (!currentUserId && isOwnProfile) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 18, color: '#999', marginBottom: 20 }}>Please log in to view your profile</Text>
          <TouchableOpacity
            style={{ backgroundColor: '#007aff', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 8 }}
            onPress={() => {
              hapticLight();
              router.push('/login' as any);
            }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Go to Login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {showBanner && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>You’re offline — showing cached profile</Text>
        </View>
      )}

      {/* Header for other users' profiles */}
      {!isOwnProfile && (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: '#f0f0f0',
          backgroundColor: '#fff',
        }}>
          <TouchableOpacity
            onPress={() => {
              hapticLight();
              safeRouterBack();
            }}
            style={styles.headerBackBtn}
          >
            <Feather name="arrow-left" size={20} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {profile?.username || profile?.name || (profile as any)?.displayName || 'Profile'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => { hapticLight(); router.push('/passport' as any); }} style={styles.headerMenuBtn}>
              <Feather name="briefcase" size={20} color="#000" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { hapticLight(); setUserMenuVisible(true); }} style={styles.headerMenuBtn}>
              <Feather name="more-vertical" size={20} color="#000" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loading && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#007aff" />
        </View>
      )}

      {(!isPrivate || isOwnProfile || approvedFollower) ? (
        <FlashList
          data={currentPostsArray}
          keyExtractor={(item, index) => item.id || item._id || `post-${index}`}
          renderItem={renderGridItem}
          numColumns={3}
          estimatedItemSize={SCREEN_WIDTH / 3}
          ListHeaderComponent={renderProfileHeader}
          ListEmptyComponent={() => (
            !loading && (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Ionicons name="grid-outline" size={48} color="#ccc" />
                <Text style={{ marginTop: 10, color: '#999' }}>No posts yet</Text>
              </View>
            )
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          onRefresh={onRefresh}
          refreshing={refreshing}
          scrollEventThrottle={16}
          removeClippedSubviews={Platform.OS === 'android'}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {renderProfileHeader}
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Ionicons name="lock-closed" size={48} color="#ccc" />
            <Text style={{ marginTop: 10, color: '#999' }}>This account is private</Text>
            <Text style={{ textAlign: 'center', color: '#999', marginTop: 4 }}>Follow to see their posts and photos.</Text>
          </View>
        </ScrollView>
      )}

      {/* Collections View Sheet */}
      <CollectionsModal
        visible={viewCollectionsModal}
        onClose={() => setViewCollectionsModal(false)}
        sections={sections}
        selectedSection={selectedSection}
        onSelectSection={setSelectedSection}
      />

      {/* Instagram-style Post Viewer */}
      {React.createElement(PostViewerModal as any, {
        visible: postViewerVisible,
        onClose: () => setPostViewerVisible(false),
        posts: segmentTab === 'grid' ? (selectedSection ? visiblePosts : posts) : taggedPosts,
        selectedPostIndex: selectedPostIndex,
        profile: profile,
        authUser: currentUserId ? { _id: currentUserId, id: currentUserId, uid: currentUserId, firebaseUid: currentUserFirebaseAlias } : null,
        likedPosts: likedPosts,
        savedPosts: savedPosts,
        handleLikePost: (post: any) => handleLikePost(post?.id || post?._id || ''),
        handleSavePost: handleSavePost,
        title: "Post",
        handleSharePost: handleSharePost,
        setCommentModalPostId: (id: any) => setCommentModalPostId(id || ''),
        setCommentModalAvatar: setCommentModalAvatar,
        setCommentModalVisible: setCommentModalVisible,
      })}

      {/* Full-screen profile photo (Instagram-style) */}
      <Modal
        visible={!!avatarPreviewUri}
        transparent
        animationType="fade"
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => setAvatarPreviewUri(null)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.94)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => setAvatarPreviewUri(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setAvatarPreviewUri(null)}
            style={{ position: 'absolute', top: Math.max(insets.top, 12) + 4, right: 16, zIndex: 20, padding: 8 }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={34} color="#fff" />
          </TouchableOpacity>
          {!!avatarPreviewUri && (
            <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}>
              <ExpoImage
                source={{ uri: avatarPreviewUri }}
                style={{
                  width: Math.min(SCREEN_WIDTH - 32, SCREEN_HEIGHT * 0.72),
                  height: Math.min(SCREEN_WIDTH - 32, SCREEN_HEIGHT * 0.72),
                }}
                contentFit="contain"
                transition={150}
                cachePolicy="memory-disk"
              />
            </Pressable>
          )}
          {isOwnProfile && !!avatarPreviewUri && (
            <TouchableOpacity
              style={{
                position: 'absolute',
                bottom: Math.max(insets.bottom, 16) + 8,
                alignSelf: 'center',
                backgroundColor: 'rgba(255,255,255,0.15)',
                paddingVertical: 12,
                paddingHorizontal: 22,
                borderRadius: 24,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: 'rgba(255,255,255,0.35)',
              }}
              onPress={() => {
                setAvatarPreviewUri(null);
                handleAvatarPick();
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Change profile photo</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Modal>

      <Modal visible={commentModalVisible} animationType="slide" transparent={true} onRequestClose={() => setCommentModalVisible(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? getKeyboardOffset() : 0}
        >
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => setCommentModalVisible(false)}
            />
            <View
              style={{
                backgroundColor: '#fff',
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingTop: 18,
                paddingHorizontal: 16,
                maxHeight: getModalHeight(0.9),
                shadowColor: '#000',
                shadowOpacity: 0.08,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              <View style={{ alignItems: 'center', marginBottom: 8 }}>
                <View style={{ width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2, marginBottom: 8 }} />
                <Text style={{ fontWeight: '700', fontSize: 17, color: '#222' }}>Comments</Text>
              </View>
              {!!commentModalPostId && (
                <CommentSection
                  postId={commentModalPostId}
                  postOwnerId={posts.find(p => p.id === commentModalPostId)?.userId || ''}
                  currentAvatar={commentModalAvatar}
                  currentUser={currentUserId ? { uid: currentUserId } : undefined}
                />
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit sections modal */}
      {viewedUserId && (
        <EditSectionsModal
          visible={editSectionsModal}
          onClose={() => setEditSectionsModal(false)}
          userId={viewedUserId}
          currentUserId={currentUserId || ''}
          sections={sections}
          posts={posts}
          onSectionsUpdate={setSections}
        />
      )}

      {/* Create Highlight Modal removed as per user request */}

      {/* User Menu Modal (for other users' profiles) - Block, Report options */}
      <UserMenuModal
        visible={userMenuVisible}
        onClose={() => setUserMenuVisible(false)}
        isOwnProfile={isOwnProfile}
        onBlock={() => handleBlockUser(profile?.name || profile?.displayName || 'this user')}
        onReport={handleReportUser}
        onShare={() => {
          setUserMenuVisible(false);
          shareProfile({
            userId: String(viewedUserId || ''),
            name: typeof profile?.name === 'string' ? profile.name : (typeof profile?.displayName === 'string' ? profile.displayName : ''),
            username: typeof profile?.username === 'string' ? profile.username : ''
          });
        }}
      />
      {/* Story Upload Modal */}
      <UploadStoryModal
        visible={showUploadModal}
        onClose={() => {
          setShowUploadModal(false);
          setSelectedMedia(null);
          setLocationQuery('');
          setLocationSuggestions([]);
        }}
        selectedMedia={selectedMedia}
        setSelectedMedia={setSelectedMedia}
        currentUserId={currentUserId}
        locationQuery={locationQuery}
        setLocationQuery={setLocationQuery}
        locationSuggestions={locationSuggestions}
        setLocationSuggestions={setLocationSuggestions}
        uploading={uploading}
        setUploading={setUploading}
        uploadProgress={uploadProgress}
        setUploadProgress={setUploadProgress}
        showSuccess={showSuccess}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 2,
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    opacity: 0.92,
  },
  offlineBannerText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  headerBackBtn: { padding: 8, marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#222', flex: 1, textAlign: 'center' },
  headerMenuBtn: { padding: 8, marginLeft: 8, marginTop: 4 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  menuSheetContent: { paddingBottom: 20 },
  handleContainer: { width: '100%', alignItems: 'center', paddingTop: 10, paddingBottom: 10 },
  menuHandle: { width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20 },
  menuIconContainer: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  menuItemText: { fontSize: 16, color: '#222', fontWeight: '500' },
  container: { flex: 1, backgroundColor: '#fff' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0', justifyContent: 'space-between' },
  topIcon: { padding: 4 },
  topTitle: { fontSize: 16, fontWeight: '600', color: '#000' },
  content: { paddingHorizontal: 0, paddingBottom: 0 },
  avatarContainer: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#eee', borderWidth: 2, borderColor: '#0A3D62' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  avatarInitials: { fontSize: 26, fontWeight: '800', color: '#667085' },
  statsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, gap: 24 },
  statItem: { alignItems: 'center', minWidth: 60, gap: 4 },
  statNum: { fontWeight: '700', fontSize: 18, color: '#000' },
  statLbl: { fontSize: 12, color: '#444', marginTop: 4, fontWeight: '600' },
  infoBlock: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  displayName: { fontSize: 16, fontWeight: '700', color: '#000' },
  username: { fontSize: 13, color: '#667eea', marginTop: 2, fontWeight: '500' },
  bio: { fontSize: 13, color: '#555', marginTop: 4, textAlign: 'center', lineHeight: 18 },
  linksBlock: { marginTop: 6, width: '100%' },
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  linkIconWrap: { width: 22, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  linkFavicon: { width: 16, height: 16, borderRadius: 4 },
  linkText: { flex: 1, fontSize: 12, color: '#007aff' },
  location: { fontSize: 12, color: '#666', marginTop: 3 },
  phone: { fontSize: 12, color: '#666', marginTop: 3 },
  interests: { fontSize: 12, color: '#666', marginTop: 3, fontStyle: 'italic' },
  passportBtnLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 24,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: '#fff',
    minWidth: 140,
  },
  passportBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  pillRow: { flexDirection: 'row', gap: 8, paddingVertical: 8, paddingHorizontal: 16, marginBottom: 0 },
  pillBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5', paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#e0e0e0' },
  pillText: { fontSize: 12, fontWeight: '500', color: '#333' },
  followBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A3D62', paddingVertical: 8, borderRadius: 6 },
  followingBtn: { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0' },
  followText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  followingText: { color: '#333' },
});
