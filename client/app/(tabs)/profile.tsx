import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
// Firebase removed - using Backend API
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../../lib/api';
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

import { getTaggedPosts, getUserHighlights as getUserHighlightsAPI, getUserPosts as getUserPostsAPI, getUserProfile as getUserProfileAPI, getUserSections as getUserSectionsAPI } from '@/src/_services/firebaseService';
import { getKeyboardOffset, getModalHeight } from '../../utils/responsive';
import { getPassportData } from '../../lib/firebaseHelpers/passport';
import { feedEventEmitter } from '../../lib/feedEventEmitter';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { ResizeMode, Video } from 'expo-av';

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
const DEFAULT_AVATAR_URL = 'https://firebasestorage.googleapis.com/v0/b/travel-app-3da72.firebasestorage.app/o/default%2Fdefault-pic.jpg?alt=media&token=7177f487-a345-4e45-9a56-732f03dbf65d';
const DEFAULT_IMAGE_URL = DEFAULT_AVATAR_URL;

function normalizeAvatarUri(uri: any): string | null {
  if (typeof uri !== 'string') return null;
  const trimmed = uri.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === 'null' || lower === 'undefined' || lower === 'n/a' || lower === 'na') return null;
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
  const POSTS_PER_PAGE = 12;

  // State and context
  const [storiesViewerVisible, setStoriesViewerVisible] = useState(false);
  const [userStories, setUserStories] = useState<any[]>([]);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [userMenuVisible, setUserMenuVisible] = useState(false);
  const [highlightViewerVisible, setHighlightViewerVisible] = useState(false);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const router = useRouter();
  const params = useLocalSearchParams();

  // Get current user ID from AsyncStorage (token-based auth)
  useEffect(() => {
    const getUserId = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        setCurrentUserId(userId);
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

  console.log('[Profile] viewedUserId extracted:', viewedUserId, 'currentUserId:', currentUserId, 'userIdProp:', userIdProp);

  // Determine if viewing own profile - compare IDs or check if no explicit user passed
  const isOwnProfile = (viewedUserId && currentUserId && viewedUserId === currentUserId) || (!userIdProp && !params.user && !!currentUserId);

  console.log('[Profile] isOwnProfile:', isOwnProfile, 'viewedUserId===currentUserId:', viewedUserId === currentUserId);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [approvedFollower, setApprovedFollower] = useState(false);
  const [followRequestPending, setFollowRequestPending] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [posts, setPosts] = useState<any[]>([]);
  const [passportLocationsCount, setPassportLocationsCount] = useState<number>(0);
  const [sections, setSections] = useState<{ name: string; postIds: string[]; coverImage?: string }[]>([]);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [postViewerVisible, setPostViewerVisible] = useState<boolean>(false);
  const [selectedPostIndex, setSelectedPostIndex] = useState<number>(0);
  const [segmentTab, setSegmentTab] = useState<'grid' | 'map' | 'tagged'>('grid');
  const { location: currentLocation } = useCurrentLocation();
  const [taggedPosts, setTaggedPosts] = useState<any[]>([]);
  const [editSectionsModal, setEditSectionsModal] = useState<boolean>(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [likedPosts, setLikedPosts] = useState<{ [key: string]: boolean }>({});
  const [savedPosts, setSavedPosts] = useState<{ [key: string]: boolean }>({});
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [commentModalPostId, setCommentModalPostId] = useState<string>('');
  const [commentModalAvatar, setCommentModalAvatar] = useState<string>('');
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [createHighlightModalVisible, setCreateHighlightModalVisible] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);

  // Story Upload State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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
    router.push('/story-creator' as any);
  };

  const visiblePosts = selectedSection
    ? posts.filter((p: any) => (sections.find((s: any) => s.name === selectedSection)?.postIds || []).includes(getPostId(p)))
    : posts;

  const PROFILE_MAP_ENABLED = false;

  useEffect(() => {
    if (!PROFILE_MAP_ENABLED && segmentTab === 'map') {
      setSegmentTab('grid');
    }
  }, [PROFILE_MAP_ENABLED, segmentTab]);

  // Handlers
  const handleFollowToggle = async () => {
    if (!currentUserId || !viewedUserId || followLoading || isOwnProfile) return;
    setFollowLoading(true);
    try {
      if (isPrivate) {
        const res = await sendFollowRequest(currentUserId, viewedUserId);
        if (res.success) {
          setFollowRequestPending(true);
        }
      } else {
        if (isFollowing) {
          console.log('[handleFollowToggle] Unfollowing user:', viewedUserId);
          const res = await unfollowUser(currentUserId, viewedUserId);
          console.log('[handleFollowToggle] Unfollow response:', res);
          setApprovedFollower(false);
          if (res.success) {
            // Update local state immediately
            setIsFollowing(false);
            setProfile(prev => {
              if (!prev) return prev;
              const base = typeof prev.followersCount === 'number'
                ? prev.followersCount
                : (Array.isArray(prev.followers) ? prev.followers.length : 0);
              return { ...prev, followersCount: Math.max(0, base - 1) };
            });
            // Refresh profile data from backend to get updated counts
            const profileRes = await getUserProfileAPI(viewedUserId, currentUserId || undefined);
            if (profileRes.success && profileRes.data) {
              setProfile(profileRes.data);
              console.log('[handleFollowToggle] Profile refreshed after unfollow');
            }
          }
        } else {
          console.log('[handleFollowToggle] Following user:', viewedUserId);
          const res = await followUser(currentUserId, viewedUserId);
          console.log('[handleFollowToggle] Follow response:', res);
          if (res.success) {
            // Update local state immediately
            setIsFollowing(true);
            setProfile(prev => {
              if (!prev) return prev;
              const base = typeof prev.followersCount === 'number'
                ? prev.followersCount
                : (Array.isArray(prev.followers) ? prev.followers.length : 0);
              return { ...prev, followersCount: base + 1 };
            });
            // Refresh profile data from backend to get updated counts
            const profileRes = await getUserProfileAPI(viewedUserId, currentUserId || undefined);
            if (profileRes.success && profileRes.data) {
              setProfile(profileRes.data);
              console.log('[handleFollowToggle] Profile refreshed after follow');
            }
          }
        }
      }
    } catch (err) {
      console.error('[handleFollowToggle] Error:', err);
      Alert.alert('Error', 'Failed to update follow status. Please try again.');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleMessage = () => {
    if (!viewedUserId || !profile) return;

    // Check if account is private and user is not approved follower
    if (isPrivate && !approvedFollower) {
      Alert.alert('Private Account', 'You need to be an approved follower to send messages to this user.');
      return;
    }

    router.push({
      pathname: '/dm',
      params: {
        otherUserId: viewedUserId,
        user: profile.name || 'User',
        avatar: profile.avatar || ''
      }
    });
  };

  const handleLikePost = async (post: any) => {
    if (!currentUserId || !post?.id) return;
    if (likedPosts[post.id]) {
      await unlikePost(post.id, currentUserId);
      setLikedPosts(prev => ({ ...prev, [post.id]: false }));
    } else {
      await likePost(post.id, currentUserId);
      setLikedPosts(prev => ({ ...prev, [post.id]: true }));
    }
  };

  const handleSavePost = async (post: any) => {
    if (!currentUserId || !post?.id) return;

    const isSaved = savedPosts[post.id];

    try {
      // TODO: implement save/unsave on backend API
      // For now, just update UI state
      setSavedPosts(prev => ({ ...prev, [post.id]: !isSaved }));
      console.log('Post', isSaved ? 'unsaved' : 'saved', '(local only)');
    } catch (error) {
      console.error('Error saving/unsaving post:', error);
    }
  };

  const handleSharePost = async (post: any) => {
    try {
      await sharePost(post);
    } catch (e) {
      console.log('Share error:', e);
    }
  };

  // Block user handler
  const handleBlockUser = async () => {
    if (!currentUserId || !viewedUserId || isOwnProfile) return;

    Alert.alert(
      'Block User',
      `Block ${profile?.name || 'this user'}?\n\nThey won't be able to find your profile, posts, or stories. They won't be notified that you blocked them.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              // Block user via backend API
              const success = await userService.blockUser(currentUserId, viewedUserId);

              if (success) {
                // Also unfollow if following
                if (isFollowing) {
                  await unfollowUser(currentUserId, viewedUserId);
                }

                // Remove from your followers if they follow you
                const theyFollowYou = profile?.followers?.includes(currentUserId);
                if (theyFollowYou) {
                  await unfollowUser(viewedUserId, currentUserId);
                }

                setUserMenuVisible(false);
                Alert.alert('Blocked', `${profile?.name || 'User'} has been blocked.`, [
                  { text: 'OK', onPress: () => router.back() }
                ]);
              } else {
                throw new Error('Block request failed');
              }
            } catch (error) {
              console.error('Error blocking user:', error);
              Alert.alert('Error', 'Failed to block user. Please try again.');
            }
          }
        }
      ]
    );
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
      const fetchData = async () => {
        // Don't fetch data if viewedUserId is not set yet
        if (!viewedUserId) {
          setLoading(false);
          return;
        }

        setLoading(true);
        try {
          console.log('[Profile] Fetching data for user:', viewedUserId, 'requester:', currentUserId);

          // Fetch profile with requester ID for privacy check
          const profileRes = await getUserProfileAPI(viewedUserId, currentUserId || undefined);
          console.log('[Profile] Profile response:', profileRes);
          console.log('[Profile] Full response structure:', {
            hasSuccess: isObjectLike(profileRes) && 'success' in profileRes,
            hasData: isObjectLike(profileRes) && 'data' in profileRes,
            successValue: profileRes?.success,
            dataType: typeof profileRes?.data,
            dataKeys: profileRes?.data ? Object.keys(profileRes.data) : 'N/A'
          });

          if (profileRes.success) {
            let profileData: ProfileData | null = null;
            if (isObjectLike(profileRes) && 'data' in profileRes && profileRes.data && typeof profileRes.data === 'object') {
              profileData = profileRes.data as ProfileData;
              console.log('[Profile] Extracted from profileRes.data:', {
                name: profileData?.name,
                displayName: profileData?.displayName,
                avatar: profileData?.avatar,
                photoURL: profileData?.photoURL,
                email: profileData?.email,
                uid: profileData?.uid,
                _id: (profileData as any)?._id
              });
            } else if (isObjectLike(profileRes) && 'profile' in profileRes && profileRes.profile && typeof profileRes.profile === 'object') {
              profileData = profileRes.profile as ProfileData;
              console.log('[Profile] Extracted from profileRes.profile:', {
                name: profileData?.name,
                displayName: profileData?.displayName,
                avatar: profileData?.avatar,
                photoURL: profileData?.photoURL
              });
            }
            console.log('[Profile] Final profileData being set:', profileData);
            console.log('[Profile] Profile state update - isOwnProfile:', isOwnProfile, 'viewedUserId:', viewedUserId);
            setProfile(profileData);
            const derivedIsPrivate = !!profileData?.isPrivate;
            const derivedApprovedFollower = !!profileData?.approvedFollowers?.includes(currentUserId || '');
            const canViewPrivateProfile = !derivedIsPrivate || isOwnProfile || derivedApprovedFollower;

            setIsPrivate(derivedIsPrivate);
            setApprovedFollower(derivedApprovedFollower);
            setFollowRequestPending(profileData?.followRequestPending || false);

            setPassportLocationsCount(0);
            if (viewedUserId && canViewPrivateProfile) {
              try {
                const passportRes: any = await getPassportData(viewedUserId);
                const stamps = Array.isArray(passportRes?.stamps) ? passportRes.stamps : [];
                const count = typeof passportRes?.ticketCount === 'number' ? passportRes.ticketCount : stamps.length;
                setPassportLocationsCount(count);
              } catch {
                setPassportLocationsCount(0);
              }
            }

            // Check follow status if not own profile
            if (!isOwnProfile && currentUserId && viewedUserId) {
              const { checkFollowStatus } = await import('../../lib/firebaseHelpers/follow');
              const followStatusRes = await checkFollowStatus(currentUserId, viewedUserId);
              console.log('[Profile] Follow status:', followStatusRes);
              if (followStatusRes.success) {
                setIsFollowing(followStatusRes.isFollowing || false);
              }
            }
          } else {
            console.warn('[Profile] Profile fetch failed:', profileRes.error);
            setProfile(null);
            setPassportLocationsCount(0);
          }

          // Fetch posts
          const postsRes = await getUserPostsAPI(viewedUserId, currentUserId || undefined);
          console.log('[Profile] Posts response success:', postsRes.success);

          let postsData: any[] = [];
          if (postsRes.success) {
            if (isObjectLike(postsRes) && 'data' in postsRes && Array.isArray(postsRes.data)) postsData = postsRes.data;
            else if (isObjectLike(postsRes) && 'posts' in postsRes && Array.isArray(postsRes.posts)) postsData = postsRes.posts;
            const blocked = currentUserId ? await fetchBlockedUserIds(currentUserId) : new Set<string>();
            setPosts(filterOutBlocked(postsData, blocked));
          } else {
            setPosts([]);
          }

          // Fetch sections (sorted by user's preferred order)
          let sectionsData: any[] = [];
          if (viewedUserId) {
            const sectionsRes = await getUserSectionsAPI(viewedUserId, currentUserId || undefined);
            if (sectionsRes.success) {
              if (isObjectLike(sectionsRes) && 'data' in sectionsRes && Array.isArray(sectionsRes.data)) sectionsData = sectionsRes.data;
              else if (isObjectLike(sectionsRes) && 'sections' in sectionsRes && Array.isArray(sectionsRes.sections)) sectionsData = sectionsRes.sections;
              setSections(sectionsData);
            } else {
              setSections([]);
            }
          } else {
            setSections([]);
          }

          // Fetch highlights
          const highlightsRes = await getUserHighlightsAPI(viewedUserId, currentUserId || undefined);
          let highlightsData: any[] = [];
          if (highlightsRes.success) {
            if (isObjectLike(highlightsRes) && 'data' in highlightsRes && Array.isArray(highlightsRes.data)) highlightsData = highlightsRes.data;
            else if (isObjectLike(highlightsRes) && 'highlights' in highlightsRes && Array.isArray(highlightsRes.highlights)) highlightsData = highlightsRes.highlights;
            setHighlights(highlightsData);
          } else {
            setHighlights([]);
          }

          // Fetch sections
          const sectionsRes2 = await getUserSectionsAPI(viewedUserId, currentUserId || undefined);
          let sectionsData2: any[] = [];
          if (sectionsRes2.success) {
            if (isObjectLike(sectionsRes2) && 'data' in sectionsRes2 && Array.isArray(sectionsRes2.data)) sectionsData2 = sectionsRes2.data;
            else if (isObjectLike(sectionsRes2) && 'sections' in sectionsRes2 && Array.isArray(sectionsRes2.sections)) sectionsData2 = sectionsRes2.sections;
            console.log('[Profile] useFocusEffect - Setting sections:', sectionsData2.length, 'sections');
            setSections(sectionsData2);
          } else {
            console.log('[Profile] useFocusEffect - No sections found');
            setSections([]);
          }

          // Fetch stories
          try {
            const storiesRes = await getUserStories(viewedUserId);
            if (storiesRes.success && Array.isArray(storiesRes.stories)) {
              const now = Date.now();
              // Transform stories to match StoriesViewer format
              const transformedStories = storiesRes.stories
                .filter((s: any) => {
                  const expiryTime = s.expiresAt ? new Date(s.expiresAt).getTime() : 0;
                  return expiryTime === 0 || expiryTime > now;
                })
                .map((story: any) => ({
                  ...story,
                  id: story._id || story.id,
                  userId: viewedUserId,
                  userName: profile?.username || profile?.name || 'User',
                  userAvatar: normalizeAvatarUri(profile?.avatar) || '',
                  imageUrl: story.image || story.imageUrl || story.mediaUrl,
                  videoUrl: story.video || story.videoUrl,
                  mediaType: story.video ? 'video' : 'image',
                  createdAt: story.createdAt || Date.now()
                }));
              setUserStories(transformedStories);
            } else {
              setUserStories([]);
            }
          } catch (err) {
            console.error('[Profile] Error fetching stories:', err);
            setUserStories([]);
          }

          // Fetch tagged posts
          const taggedPostsRes = await getTaggedPosts(viewedUserId, currentUserId || undefined);
          if (taggedPostsRes.success) {
            let taggedData: any[] = [];
            if (isObjectLike(taggedPostsRes) && 'data' in taggedPostsRes && Array.isArray(taggedPostsRes.data)) taggedData = taggedPostsRes.data;
            else if (isObjectLike(taggedPostsRes) && 'posts' in taggedPostsRes && Array.isArray(taggedPostsRes.posts)) taggedData = taggedPostsRes.posts;

            const blocked = currentUserId ? await fetchBlockedUserIds(currentUserId) : new Set<string>();
            setTaggedPosts(filterOutBlocked(taggedData, blocked));
          } else {
            setTaggedPosts([]);
          }

          console.log('[Profile] All data fetched successfully');
        } catch (err) {
          console.error('[Profile] Error fetching data:', err);
        }
        setLoading(false);
      };

      fetchData();
    }, [viewedUserId, currentUserId, refreshTrigger])
  );

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
              Alert.alert('Success', 'Profile picture updated!');
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
        console.log('[Profile] Post deleted event received:', event.postId);
        setPosts(prev => prev.filter(p => (p.id || p._id) !== event.postId));
      }
    });

    // Listen for general feed updates to refresh all data (including stories)
    const subscription = feedEventEmitter.addListener('feedUpdated', () => {
      console.log('[Profile] Feed updated signal received, refreshing data...');
      setRefreshTrigger(prev => prev + 1);
    });

    return () => {
      unsub();
      subscription.remove();
    };
  }, []);


  // Render helpers
  const renderSkeletonPosts = () => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 0 }}>
      {Array.from({ length: POSTS_PER_PAGE }).map((_, idx) => (
        <View key={idx} style={{ flexBasis: '33.3333%', aspectRatio: 1, padding: 1 }}>
          <View style={{ backgroundColor: '#eee', borderRadius: 8, width: '100%', height: '100%' }} />
        </View>
      ))}
    </View>
  );

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
            onPress={() => router.push('/login')}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Go to Login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Header for other users' profiles with back button and 3-dots menu */}
      {!isOwnProfile && (
        <View style={styles.profileHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBackBtn}>
            <Feather name="arrow-left" size={20} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{profile?.username || profile?.name || (profile as any)?.displayName || 'Profile'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => router.push('/passport' as any)} style={styles.headerMenuBtn}>
              <Feather name="briefcase" size={20} color="#000" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setUserMenuVisible(true)} style={styles.headerMenuBtn}>
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
      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar centered */}
        <View style={styles.avatarContainer}>
          <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
            {/* Story Ring - only show if there are stories */}
            {userStories.length > 0 && (
              <LinearGradient
                colors={['#F58529', '#DD2A7B', '#8134AF']}
                style={{
                  position: 'absolute',
                  width: 102,
                  height: 102,
                  borderRadius: 51,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: '#fff' }} />
              </LinearGradient>
            )}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (userStories.length > 0) {
                  setStoriesViewerVisible(true);
                } else if (isOwnProfile) {
                  // Fallback: If no stories and own profile, trigger avatar change
                  // or just let the handleAddStory (+) handle it
                  // For better UX, let's trigger avatar pick if no stories
                  handleAvatarPick();
                }
              }}
            >
              {(() => {
                const avatarUri =
                  normalizeAvatarUri(profile?.avatar) ||
                  normalizeAvatarUri((profile as any)?.photoURL) ||
                  normalizeAvatarUri((profile as any)?.profilePicture) ||
                  null;

                const dimmed = isPrivate && !isOwnProfile && !approvedFollower;

                if (avatarUri) {
                  return (
                    <ExpoImage
                      source={{ uri: avatarUri }}
                      style={[styles.avatar, dimmed && { opacity: 0.3 }]}
                      contentFit="cover"
                      transition={200}
                      cachePolicy="memory-disk"
                    />
                  );
                }

                const initials = getInitials(profile?.name || (profile as any)?.displayName || profile?.username || 'User');
                return (
                  <View style={[styles.avatar, styles.avatarFallback, dimmed && { opacity: 0.3 }]}>
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  </View>
                );
              })()}
              {isPrivate && !isOwnProfile && !approvedFollower && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 60 }}>
                  <Ionicons name="lock-closed" size={40} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
            {/* Add story button overlay for own profile */}
            {isOwnProfile && (
              <TouchableOpacity
                style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: '#007aff', borderRadius: 16, width: 32, height: 32, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff', zIndex: 2 }}
                onPress={handleAddStory}
              >
                <Feather name="plus" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Stats row: Locations | Posts | Followers | Following */}
        <View style={styles.statsRow}>
          {(!isPrivate || isOwnProfile || approvedFollower) ? (
            <>
              <TouchableOpacity
                style={styles.statItem}
                onPress={() => {
                  if (!viewedUserId) return;
                  router.push({
                    pathname: '/user/[userId]/locations',
                    params: { userId: String(viewedUserId) }
                  } as any);
                }}
                disabled={!viewedUserId}
              >
                <Text style={styles.statNum}>{passportLocationsCount}</Text>
                <Text style={styles.statLbl}>Locations</Text>
              </TouchableOpacity>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{posts.length}</Text>
                <Text style={styles.statLbl}>Posts</Text>
              </View>
              <TouchableOpacity
                style={styles.statItem}
                onPress={() => {
                  if (!isPrivate || isOwnProfile || approvedFollower) {
                    router.push(`/friends?userId=${viewedUserId}&tab=followers` as any);
                  }
                }}
                disabled={isPrivate && !isOwnProfile && !approvedFollower}
              >
                <Text style={styles.statNum}>{Math.max(0, Number(profile?.followersCount ?? (profile?.followers?.length || 0)) || 0)}</Text>
                <Text style={styles.statLbl}>Followers</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.statItem}
                onPress={() => {
                  if (!isPrivate || isOwnProfile || approvedFollower) {
                    router.push(`/friends?userId=${viewedUserId}&tab=following` as any);
                  }
                }}
                disabled={isPrivate && !isOwnProfile && !approvedFollower}
              >
                <Text style={styles.statNum}>{Math.max(0, Number(profile?.followingCount ?? (profile?.following?.length || 0)) || 0)}</Text>
                <Text style={styles.statLbl}>Following</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <Ionicons name="lock-closed" size={32} color="#999" />
              <Text style={{ marginTop: 8, fontSize: 14, color: '#999', textAlign: 'center' }}>This account is private</Text>
              <Text style={{ fontSize: 13, color: '#999', textAlign: 'center', marginTop: 4 }}>Follow to see their stats and posts</Text>
            </View>
          )}
        </View>

        {/* Name + Bio + Website + Location + Phone + Interests */}
        <View style={styles.infoBlock}>
          <Text style={styles.displayName}>{profile?.name || (profile as any)?.displayName || profile?.username || 'User'}</Text>
          {!!profile?.username && <Text style={styles.username}>@{profile.username}</Text>}
          
          {/* Passport Button for other users */}
          {!isOwnProfile && (
            <TouchableOpacity 
              style={styles.passportBtnLarge} 
              onPress={() => router.push({ pathname: '/passport', params: { user: viewedUserId } } as any)}
            >
              <Feather name="briefcase" size={18} color="#000" style={{ marginRight: 8 }} />
              <Text style={styles.passportBtnText}>Passport</Text>
            </TouchableOpacity>
          )}

          {!!profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}
          {!!profile?.website && (!isPrivate || isOwnProfile || approvedFollower) && (
            <View style={styles.linksBlock}>
              {splitProfileLinks(profile.website).map((rawLink) => {
                const url = normalizeExternalUrl(rawLink);
                if (!url) return null;
                const platform = detectProfileLinkPlatform(url);
                const icon = (() => {
                  if (platform === 'facebook') return <Feather name="facebook" size={16} color="#1877F2" />;
                  if (platform === 'instagram') return <Feather name="instagram" size={16} color="#C13584" />;
                  if (platform === 'twitter') return <Feather name="twitter" size={16} color="#1DA1F2" />;
                  if (platform === 'youtube') return <Feather name="youtube" size={16} color="#FF0000" />;
                  if (platform === 'linkedin') return <Feather name="linkedin" size={16} color="#0A66C2" />;
                  if (platform === 'whatsapp') return <Ionicons name={'logo-whatsapp' as any} size={17} color="#25D366" />;
                  if (platform === 'website') {
                    return (
                      <ExpoImage
                        source={{ uri: getFaviconUrl(url) }}
                        style={styles.linkFavicon}
                        contentFit="cover"
                        transition={150}
                      />
                    );
                  }
                  return <Feather name="link-2" size={16} color="#007aff" />;
                })();

                return (
                  <TouchableOpacity
                    key={url}
                    activeOpacity={0.7}
                    onPress={async () => {
                      try {
                        const canOpen = await Linking.canOpenURL(url);
                        if (!canOpen) {
                          Alert.alert('Invalid Link', 'Could not open this link.');
                          return;
                        }
                        await Linking.openURL(url);
                      } catch {
                        Alert.alert('Error', 'Failed to open link.');
                      }
                    }}
                    style={styles.linkRow}
                  >
                    <View style={styles.linkIconWrap}>{icon}</View>
                    <Text style={styles.linkText} numberOfLines={1} ellipsizeMode="tail">{rawLink}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {!!(profile as any)?.location && (!isPrivate || isOwnProfile || approvedFollower) && <Text style={styles.location}>ðŸ“ {(profile as any).location}</Text>}
          {!!(profile as any)?.phone && (!isPrivate || isOwnProfile || approvedFollower) && <Text style={styles.phone}>📱 {(profile as any).phone}</Text>}
          {!!(profile as any)?.interests && (!isPrivate || isOwnProfile || approvedFollower) && <Text style={styles.interests}>✨ {(profile as any).interests}</Text>}
        </View>

        {/* Pill buttons: Profile | Sections | Passport (only show for own profile) */}
        {isOwnProfile && (
          <View style={styles.pillRow}>
            <TouchableOpacity style={styles.pillBtn} onPress={() => router.push({ pathname: '/edit-profile', params: { userId: viewedUserId } } as any)}>
              <Ionicons name="person-outline" size={16} color="#000" style={{ marginRight: 4 }} />
              <Text style={styles.pillText}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pillBtn} onPress={() => router.push('/saved' as any)}>
              <Ionicons name="albums-outline" size={16} color="#000" style={{ marginRight: 4 }} />
              <Text style={styles.pillText}>Collections</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Highlights carousel (Instagram-style) - only show for own profile or approved followers */}
        {(!isPrivate || isOwnProfile || approvedFollower) && (
          <View style={{ marginBottom: 4, marginTop: 4 }}>
            <HighlightCarousel highlights={highlights} onPressHighlight={handlePressHighlight} isOwnProfile={isOwnProfile} onAddHighlight={() => setCreateHighlightModalVisible(true)} />
            {/* StoriesViewer for own stories */}
            {storiesViewerVisible && (
              <Modal
                visible={storiesViewerVisible}
                transparent={false}
                animationType="fade"
                onRequestClose={() => setStoriesViewerVisible(false)}
              >
                <StoriesViewer
                  stories={userStories}
                  onClose={() => setStoriesViewerVisible(false)}
                />
              </Modal>
            )}
            <HighlightViewer
              visible={highlightViewerVisible}
              highlightId={selectedHighlightId}
              onClose={() => setHighlightViewerVisible(false)}
            />
          </View>
        )}

        {/* Follow/Unfollow button for other users' profiles */}
        {!isOwnProfile && (
          <View style={styles.pillRow}>
            <TouchableOpacity
              style={[
                styles.followBtn,
                (isFollowing || followRequestPending) && styles.followingBtn
              ]}
              onPress={handleFollowToggle}
              disabled={followLoading || followRequestPending}
            >
              <Text style={[
                styles.followText,
                (isFollowing || followRequestPending) && styles.followingText
              ]}>
                {followRequestPending
                  ? 'Requested'
                  : (isFollowing
                    ? (followLoading ? 'Unfollowing...' : 'Following')
                    : (followLoading ? 'Following...' : 'Follow'))}
              </Text>
            </TouchableOpacity>
            {(!isPrivate || approvedFollower) && (
              <>
                <TouchableOpacity style={styles.pillBtn} onPress={handleMessage}>
                  <Ionicons name="chatbubble-outline" size={16} color="#000" style={{ marginRight: 4 }} />
                  <Text style={styles.pillText}>Message</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.pillBtn} onPress={() => router.push({ pathname: '/saved', params: { userId: viewedUserId } } as any)}>
                  <Ionicons name="albums-outline" size={16} color="#000" style={{ marginRight: 4 }} />
                  <Text style={styles.pillText}>Collections</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Icon-based segment control: grid | map | tagged - only show if not private or approved */}
        {(!isPrivate || isOwnProfile || approvedFollower) && (
          <View style={styles.segmentControl}>
            <TouchableOpacity
              style={[styles.segmentBtn, segmentTab === 'grid' && styles.segmentBtnActive]}
              onPress={() => {
                setSegmentTab('grid');
                setSelectedSection(null); // Clear section filter when clicking grid icon
              }}
            >
              <Ionicons name="grid-outline" size={24} color={segmentTab === 'grid' ? '#000' : '#999'} />
            </TouchableOpacity>
            {PROFILE_MAP_ENABLED && (
              <TouchableOpacity style={[styles.segmentBtn, segmentTab === 'map' && styles.segmentBtnActive]} onPress={() => setSegmentTab('map')}>
                <Ionicons name="location-outline" size={24} color={segmentTab === 'map' ? '#000' : '#999'} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.segmentBtn, segmentTab === 'tagged' && styles.segmentBtnActive]} onPress={() => setSegmentTab('tagged')}>
              <Ionicons name="pricetag-outline" size={24} color={segmentTab === 'tagged' ? '#000' : '#999'} />
            </TouchableOpacity>
          </View>
        )}

        {/* Map view - only show if not private or approved */}
        {PROFILE_MAP_ENABLED && (!isPrivate || isOwnProfile || approvedFollower) && segmentTab === 'map' && (
          <View style={styles.mapContainer}>
            {Platform.OS !== 'web' && MapView ? (
              <MapView
                style={styles.map}
                initialRegion={currentLocation ? {
                  latitude: currentLocation.latitude,
                  longitude: currentLocation.longitude,
                  latitudeDelta: 0.0922,
                  longitudeDelta: 0.0421,
                } : undefined}
                googleRenderer={Platform.OS === 'android' ? 'LATEST' : undefined}
                provider={Platform.OS === 'ios' ? 'google' : undefined}
              >
                {posts.filter(p => {
                  const lat = parseCoord(p.location?.latitude ?? p.location?.lat ?? p.lat ?? p.locationData?.lat);
                  const lon = parseCoord(p.location?.longitude ?? p.location?.lon ?? p.lon ?? p.locationData?.lon);
                  return lat !== null && lon !== null;
                }).map((post) => {
                  const lat = parseCoord(post.location?.latitude ?? post.location?.lat ?? post.lat ?? post.locationData?.lat);
                  const lon = parseCoord(post.location?.longitude ?? post.location?.lon ?? post.lon ?? post.locationData?.lon);
                  if (lat === null || lon === null) return null;
                  const imageUrl = post.imageUrl || (Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0 ? post.mediaUrls[0] : (Array.isArray(post.imageUrls) && post.imageUrls.length > 0 ? post.imageUrls[0] : DEFAULT_IMAGE_URL));
                  const avatarUrl = post.userAvatar || profile?.avatar || DEFAULT_AVATAR_URL;

                  // Marker with tracksViewChanges true until images are loaded
                  return (
                    <ProfilePostMarker
                      key={`post-${post.id}`}
                      lat={lat}
                      lon={lon}
                      imageUrl={imageUrl}
                      avatarUrl={avatarUrl}
                      onPress={() => {
                        const targetUserId = String(viewedUserId || '');
                        const tappedPostId = String(post?.id || post?._id || '');

                        if (targetUserId && tappedPostId) {
                          router.push({
                            pathname: '/user/[userId]/posts',
                            params: { userId: targetUserId, postId: tappedPostId }
                          } as any);
                          return;
                        }

                        const postIndex = posts.findIndex(p => p.id === post.id);
                        setSelectedPostIndex(postIndex);
                        setPostViewerVisible(true);
                      }}
                    />
                  );
                })}
              </MapView>
            ) : (
              <View style={[styles.map, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: '#666' }}>Map is not available on web preview.</Text>
              </View>
            )}
          </View>
        )}

        {/* Collections horizontal scroller - only show if not private or approved */}
        {(!isPrivate || isOwnProfile || approvedFollower) && segmentTab === 'grid' && sections.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 14, paddingVertical: 10 }}>
            {sections.map((s) => {
              const isActive = selectedSection === s.name;
              const coverUri = s.coverImage || posts.find(p => s.postIds?.includes?.(getPostId(p)))?.imageUrl || DEFAULT_AVATAR_URL;
              return (
                <TouchableOpacity
                  key={`section-${s.name}`}
                  activeOpacity={0.8}
                  onPress={() => setSelectedSection(isActive ? null : s.name)}
                  style={{ alignItems: 'center', width: 60 }}
                >
                  <View style={{
                    width: 60, height: 60,
                    borderRadius: 10,
                    overflow: 'hidden',
                    borderWidth: isActive ? 2 : 0,
                    borderColor: '#0A3D62',
                    backgroundColor: '#eee',
                  }}>
                    <ExpoImage
                      source={{ uri: coverUri }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      transition={200}
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{
                      marginTop: 4,
                      fontSize: 10,
                      fontWeight: isActive ? '700' : '400',
                      color: isActive ? '#0A3D62' : '#333',
                      textAlign: 'center',
                      width: 60,
                    }}
                  >{s.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Posts grid by segment tab - only show if not private or approved */}
        {(!isPrivate || isOwnProfile || approvedFollower) && segmentTab !== 'map' && (
          <View style={styles.grid}>
            {/* Posts */}
            {loading ? renderSkeletonPosts() : (segmentTab === 'grid' ? (selectedSection ? visiblePosts : posts) : taggedPosts).map((p, index) => {
              const currentPostsArray = segmentTab === 'grid' ? (selectedSection ? visiblePosts : posts) : taggedPosts;
              const postKey = p.id || p._id || `post-${index}`;
              return (
                <TouchableOpacity
                  key={postKey}
                  style={styles.gridItem}
                  activeOpacity={0.8}
                  onPress={() => {
                    const postUserId = typeof p?.userId === 'string' ? p.userId : p?.userId?._id;
                    const targetUserId = postUserId || viewedUserId || '';
                    const tappedPostId = String(p?.id || p?._id || '');

                    if (targetUserId && tappedPostId) {
                      router.push({
                        pathname: '/user/[userId]/posts',
                        params: {
                          userId: String(targetUserId),
                          postId: tappedPostId,
                          single: segmentTab === 'tagged' ? 'true' : 'false'
                        }
                      } as any);
                      return;
                    }

                    // Fallback to existing modal behavior if params are missing
                    const modalIndex = currentPostsArray.findIndex(post => (post.id || post._id) === (p.id || p._id));
                    setSelectedPostIndex(modalIndex >= 0 ? modalIndex : index);
                    setPostViewerVisible(true);
                  }}
                >
                  <ExpoImage
                    source={{ uri: p.thumbnailUrl || p.imageUrl || p.mediaUrls?.[0] || p.imageUrls?.[0] || DEFAULT_IMAGE_URL }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    transition={200}
                    cachePolicy="memory-disk"
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Instagram-style Post Viewer */}
      {React.createElement(PostViewerModal as any, {
        visible: postViewerVisible,
        onClose: () => setPostViewerVisible(false),
        posts: segmentTab === 'grid' ? (selectedSection ? visiblePosts : posts) : taggedPosts,
        selectedPostIndex: selectedPostIndex,
        profile: profile,
        authUser: currentUserId ? { uid: currentUserId } : null,
        likedPosts: likedPosts,
        savedPosts: savedPosts,
        handleLikePost: handleLikePost,
        handleSavePost: handleSavePost,
        handleSharePost: handleSharePost,
        setCommentModalPostId: (id: any) => setCommentModalPostId(id || ''),
        setCommentModalAvatar: setCommentModalAvatar,
        setCommentModalVisible: setCommentModalVisible,
      })}

      <Modal visible={commentModalVisible} animationType="slide" transparent={true} onRequestClose={() => setCommentModalVisible(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'flex-end' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={getKeyboardOffset()}
        >
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
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
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
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

      {/* Create Highlight Modal */}
      <CreateHighlightModal
        visible={createHighlightModalVisible}
        onClose={() => setCreateHighlightModalVisible(false)}
        userId={currentUserId || ''}
        onSuccess={async () => {
          // Refresh highlights after creating new one
          if (viewedUserId) {
            const highlightsRes = await getUserHighlights(viewedUserId, currentUserId || undefined);
            let highlightsData: any[] = [];
            if (highlightsRes.success) {
              if (isObjectLike(highlightsRes) && 'data' in highlightsRes && Array.isArray(highlightsRes.data)) highlightsData = highlightsRes.data;
              else if (isObjectLike(highlightsRes) && 'highlights' in highlightsRes && Array.isArray(highlightsRes.highlights)) highlightsData = highlightsRes.highlights;
              setHighlights(highlightsData);
            }
          }
        }}
      />

      {/* User Menu Modal (for other users' profiles) - Block, Report options */}
      <Modal
        visible={userMenuVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setUserMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setUserMenuVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              style={styles.menuSheet}
              contentContainerStyle={styles.menuSheetContent}
              bounces={false}
            >
              {/* Handle */}
              <View style={styles.menuHandle} />

              {/* Menu Options */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleBlockUser}
              >
                <View style={[styles.menuIconContainer, { backgroundColor: '#fee' }]}>
                  <Ionicons name="ban-outline" size={22} color="#e74c3c" />
                </View>
                <Text style={[styles.menuItemText, { color: '#e74c3c' }]}>Block</Text>
              </TouchableOpacity>

              <View style={styles.menuSeparator} />

              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleReportUser}
              >
                <View style={[styles.menuIconContainer, { backgroundColor: '#fff5e6' }]}>
                  <Ionicons name="flag-outline" size={22} color="#0A3D62" />
                </View>
                <Text style={styles.menuItemText}>Report</Text>
              </TouchableOpacity>

              <View style={styles.menuSeparator} />

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setUserMenuVisible(false);
                  shareProfile({
                    userId: String(viewedUserId || ''),
                    name: typeof profile?.name === 'string' ? profile.name : (typeof profile?.displayName === 'string' ? profile.displayName : ''),
                    username: typeof profile?.username === 'string' ? profile.username : ''
                  });
                }}
              >
                <View style={[styles.menuIconContainer, { backgroundColor: '#e8f4fd' }]}>
                  <Ionicons name="share-outline" size={22} color="#0095f6" />
                </View>
                <Text style={styles.menuItemText}>Share Profile</Text>
              </TouchableOpacity>

              <View style={styles.menuSeparator} />

              <TouchableOpacity
                style={styles.menuItem}
                onPress={async () => {
                  setUserMenuVisible(false);
                  try {
                    const id = String(viewedUserId || '');
                    const link = buildProfileWebLink(id) || buildProfileDeepLink(id);
                    await Clipboard.setStringAsync(link);
                    Alert.alert('Copied', 'Profile link copied to clipboard');
                  } catch (e) {
                    Alert.alert('Error', 'Could not copy link');
                  }
                }}
              >
                <View style={[styles.menuIconContainer, { backgroundColor: '#f0f0f0' }]}>
                  <Ionicons name="link-outline" size={22} color="#666" />
                </View>
                <Text style={styles.menuItemText}>Copy Profile URL</Text>
              </TouchableOpacity>

              {/* Cancel Button */}
              <TouchableOpacity
                style={styles.menuCancelBtn}
                onPress={() => setUserMenuVisible(false)}
              >
                <Text style={styles.menuCancelText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      {/* Story Upload Modal (Instagram Style) */}
      <Modal
        visible={showUploadModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowUploadModal(false);
          setSelectedMedia(null);
          setLocationQuery('');
          setLocationSuggestions([]);
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          >
            <View style={{ flex: 1 }}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  activeOpacity={0.6}
                  onPress={() => {
                    setShowUploadModal(false);
                    setSelectedMedia(null);
                    setLocationQuery('');
                    setLocationSuggestions([]);
                  }}
                >
                  <Feather name="x" size={24} color="#222" />
                </TouchableOpacity>

                <Text style={styles.modalTitle}>Create Story</Text>

                <View style={{ width: 40 }} />
              </View>

              <ScrollView
                contentContainerStyle={{
                  paddingHorizontal: 20,
                  paddingBottom: 40
                }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Media Preview */}
                {selectedMedia ? (
                  <View style={styles.mediaPreviewContainer}>
                    {String(selectedMedia?.type || '').toLowerCase() === 'video' ? (
                      <Video
                        source={{ uri: selectedMedia.uri }}
                        style={styles.modalImage}
                        resizeMode={ResizeMode.COVER}
                        useNativeControls
                        shouldPlay={false}
                      />
                    ) : (
                      <Image
                        source={{ uri: selectedMedia.uri }}
                        style={styles.modalImage}
                        resizeMode="cover"
                      />
                    )}
                    <TouchableOpacity
                      style={styles.changeMediaButton}
                      onPress={async () => {
                        const pickerResult = await ImagePicker.launchImageLibraryAsync({
                          mediaTypes: ['images', 'videos'],
                          allowsEditing: true,
                          aspect: [9, 16],
                          quality: 0.8
                        });
                        if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets[0]?.uri) {
                          setSelectedMedia(pickerResult.assets[0]);
                        }
                      }}
                    >
                      <Feather name="edit-2" size={16} color="#007aff" />
                      <Text style={styles.changeMediaText}>Change</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Caption Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Caption (Optional)</Text>
                  <TextInput
                    placeholder="Write something..."
                    value={selectedMedia?.caption || ''}
                    onChangeText={text => setSelectedMedia((prev: any) => prev ? { ...prev, caption: text } : prev)}
                    style={styles.inputField}
                    placeholderTextColor="#999"
                    multiline
                  />
                </View>

                {/* Location Input */}
                <View style={[styles.inputGroup, { zIndex: 10 }]}>
                  <Text style={styles.inputLabel}>Location (Optional)</Text>
                  <View style={{ position: 'relative' }}>
                    <View style={styles.locationInputContainer}>
                      <Feather name="map-pin" size={18} color="#666" />
                      <TextInput
                        placeholder="Add location..."
                        value={locationQuery}
                        onChangeText={setLocationQuery}
                        style={styles.locationInput}
                        placeholderTextColor="#999"
                      />
                    </View>
                    {locationSuggestions.length > 0 && (
                      <View style={styles.locationDropdown}>
                        <ScrollView keyboardShouldPersistTaps="handled">
                          {locationSuggestions.map((item) => (
                            <TouchableOpacity
                              key={item.placeId}
                              style={styles.locationItem}
                              onPress={() => {
                                Keyboard.dismiss();
                                setSelectedMedia((prev: any) => prev ? {
                                  ...prev,
                                  locationData: { name: item.name, address: item.address, placeId: item.placeId }
                                } : prev);
                                setLocationQuery(item.name);
                                setLocationSuggestions([]);
                              }}
                            >
                              <Feather name="map-pin" size={16} color="#007aff" style={{ marginRight: 8 }} />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.locationName}>{item.name}</Text>
                                <Text style={styles.locationAddress} numberOfLines={1}>{item.address}</Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                </View>

                {/* Upload Progress */}
                {uploading && (
                  <View style={styles.uploadingArea}>
                    <ActivityIndicator size="small" color="#007aff" style={{ marginBottom: 8 }} />
                    <Text style={styles.uploadingText}>Uploading {uploadProgress}%</Text>
                    <View style={styles.uploadingBarBg}>
                      <View style={[styles.uploadingBar, { width: `${uploadProgress}%` }]} />
                    </View>
                  </View>
                )}

                {/* Share Button */}
                <TouchableOpacity
                  style={[styles.shareButton, !selectedMedia && styles.shareButtonDisabled]}
                  disabled={!selectedMedia || uploading}
                  onPress={async () => {
                    if (!selectedMedia || !currentUserId || uploading) return;
                    setUploading(true);
                    setUploadProgress(0);
                    try {
                      let uploadUri = selectedMedia.uri;
                      const mediaType = selectedMedia.type === 'video' ? 'video' : 'image';
                      if (mediaType === 'image') {
                        const manipResult = await ImageManipulator.manipulateAsync(
                          selectedMedia.uri,
                          [{ resize: { width: 1080 } }],
                          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                        );
                        uploadUri = manipResult.uri;
                      }
                      const storyRes = await createStory(currentUserId, uploadUri, mediaType, selectedMedia.locationData, (p: number) => setUploadProgress(Math.round(p)));
                      if (storyRes?.success) {
                        setUploadProgress(100);
                        setTimeout(() => {
                          setShowUploadModal(false);
                          setSelectedMedia(null);
                          setUploading(false);
                          // Signal refresh
                          feedEventEmitter.emit('feedUpdated');
                          Alert.alert('Success', 'Story shared successfully!');
                        }, 500);
                      }
                    } catch (err) {
                      Alert.alert('Error', 'Failed to upload story');
                      setUploading(false);
                    }
                  }}
                >
                  <Text style={styles.shareButtonText}>{uploading ? 'Sharing...' : 'Share Story'}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerBackBtn: { padding: 8, marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#222', flex: 1, textAlign: 'center' },
  headerMenuBtn: { padding: 8, marginLeft: 8, marginTop: 4 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  menuSheetContent: { paddingBottom: 20, paddingTop: 8 },
  menuHandle: { width: 40, height: 4, backgroundColor: '#ccc', borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 16 },
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
  statItem: { alignItems: 'center', minWidth: 50 },
  statNum: { fontWeight: '700', fontSize: 16, color: '#222' },
  statLbl: { fontSize: 11, color: '#666', marginTop: 2 },
  infoBlock: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  displayName: { fontSize: 15, fontWeight: '600', color: '#222' },
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
  pillRow: { flexDirection: 'row', gap: 8, paddingVertical: 8, paddingHorizontal: 16 },
  pillBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5', paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#e0e0e0' },
  pillText: { fontSize: 12, fontWeight: '500', color: '#333' },
  followBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A3D62', paddingVertical: 8, borderRadius: 6 },
  followingBtn: { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0' },
  followText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  followingText: { color: '#333' },
  sectionsScroller: { paddingVertical: 8 },
  sectionCard: { alignItems: 'center', width: 70, marginRight: 4 },
  sectionCover: { width: 60, height: 60, borderRadius: 8, backgroundColor: '#eee' },
  sectionLabel: { marginTop: 4, fontSize: 10, color: '#666', textAlign: 'center' },
  sectionLabelActive: { fontWeight: '700', color: '#000' },
  segmentControl: { flexDirection: 'row', borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#e0e0e0', marginTop: 8 },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  segmentBtnActive: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: '#0A3D62' },
  card: { backgroundColor: '#f7f7f7', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#eee', marginTop: 8 },
  cardText: { color: '#333', lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 0, paddingBottom: 8 },
  gridItem: { flexBasis: '33.3333%', aspectRatio: 1, padding: 1 },
  sectionOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, alignItems: 'center' },
  sectionGridLabel: { color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  mapContainer: { width: '100%', height: 400, marginTop: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: '#ffcccc' },
  map: { width: '100%', height: '100%' },
  markerContainer: { alignItems: 'center', justifyContent: 'center', width: 60, height: 60, backgroundColor: '#FF6B6B', borderRadius: 30, borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 },
  markerAvatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#eee' },
  customMarkerWrap: {
    width: 70,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 6,
    overflow: 'visible',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  customMarkerImage: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    resizeMode: 'cover',
  },
  customMarkerAvatarWrap: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 4,
  },
  customMarkerAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  postViewerHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)' },
  postViewerHeaderContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  postViewerCloseBtn: { padding: 4 },
  postViewerUserInfo: { flexDirection: 'row', alignItems: 'center' },
  postViewerAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 8 },
  postViewerUsername: { color: '#fff', fontWeight: '700', fontSize: 15 },
  postViewerSlide: { flex: 1, backgroundColor: '#000' },
  postImageContainer: { width: '100%', aspectRatio: 1, backgroundColor: '#222' },
  postViewerImage: { width: '100%', height: undefined, aspectRatio: 1, borderRadius: 12 },
  postActionsBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actionBtn: { padding: 8 },
  captionContainer: { paddingHorizontal: 16, paddingVertical: 8 },
  captionText: { color: '#fff', fontSize: 15 },
  captionUsername: { fontWeight: '700', color: '#fff' },
  commentsContainer: { paddingHorizontal: 16, paddingBottom: 24 },
  // Profile header styles (for other users)
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  menuSeparator: {
    height: 1,
    backgroundColor: '#f0f0f0',
  },
  menuCancelBtn: {
    marginTop: 24,
    marginBottom: 4,
    marginHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#f8f8f8',
    borderRadius: 14,
    alignItems: 'center',
  },
  menuCancelText: { fontSize: 16, fontWeight: '600', color: '#000' },
  // Story Upload Modal Styles
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: responsiveValues.spacing,
    paddingHorizontal: responsiveValues.modalPadding,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  modalTitle: {
    fontSize: responsiveValues.titleSize,
    fontWeight: '700',
    color: '#222',
  },
  mediaPreviewContainer: {
    marginTop: responsiveValues.spacingLarge,
    marginBottom: responsiveValues.spacingLarge,
  },
  modalImage: {
    width: '100%',
    height: responsiveValues.imageHeight,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
  },
  changeMediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 8,
    gap: 6,
  },
  changeMediaText: {
    color: '#007aff',
    fontSize: 15,
    fontWeight: '600',
  },
  inputGroup: {
    width: '100%',
    marginBottom: responsiveValues.spacingLarge,
    zIndex: 1,
  },
  inputLabel: {
    fontWeight: '600',
    fontSize: responsiveValues.labelSize,
    marginBottom: 8,
    color: '#666',
  },
  inputField: {
    minHeight: responsiveValues.inputHeight,
    fontSize: responsiveValues.inputSize,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: responsiveValues.spacing,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    color: '#222',
  },
  locationInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: responsiveValues.spacing,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 10,
    height: responsiveValues.inputHeight,
  },
  locationInput: {
    flex: 1,
    fontSize: responsiveValues.inputSize,
    color: '#222',
    height: '100%',
  },
  uploadingArea: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  uploadingText: {
    marginBottom: 8,
    color: '#666',
    fontWeight: '600',
    fontSize: 14,
  },
  uploadingBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  uploadingBar: {
    height: 6,
    backgroundColor: '#007aff',
    borderRadius: 3,
  },
  shareButton: {
    width: '100%',
    backgroundColor: '#007aff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  shareButtonDisabled: {
    backgroundColor: '#ccc',
  },
  shareButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  locationDropdown: {
    position: 'absolute',
    top: responsiveValues.inputHeight + 4,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    maxHeight: 200,
    zIndex: 1000,
    elevation: 4,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  locationName: {
    color: '#222',
    fontSize: 14,
    fontWeight: '600',
  },
  locationAddress: {
    color: '#999',
    fontSize: 12,
  },
});
