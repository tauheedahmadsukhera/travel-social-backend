import { useState, useCallback, useRef, useEffect } from 'react';
import { Alert, Dimensions, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useUser } from '@/src/_components/UserContext';
import { useAppDialog } from '@/src/_components/AppDialogProvider';
import { apiService } from '@/src/_services/apiService';
import { getAuthenticatedUserId } from '../lib/currentUser';
import { extractHashtags, trackHashtag } from '../lib/mentions';
import { createPost, createStory, searchUsers, getCategories, DEFAULT_CATEGORIES, getPassportTickets } from '../lib/firebaseHelpers/index';
import { feedEventEmitter } from '@/lib/feedEventEmitter';
import { hapticLight, hapticMedium, hapticSuccess } from '../lib/haptics';
import { getCachedData, setCachedData } from '../hooks/useOffline';
import { startTrace } from '../lib/perf';
import { GOOGLE_MAPS_CONFIG } from '../config/environment';
import { mapService } from '../services';

const { width } = Dimensions.get('window');

export type LocationType = {
  name: string;
  address: string;
  placeId?: string;
  lat: number;
  lon: number;
  verified?: boolean;
};

export type UserType = {
  uid: string;
  displayName?: string;
  userName?: string;
  photoURL?: string | null;
};

export type GalleryAsset = {
  id: string;
  uri: string;
  mediaType: 'photo' | 'video';
  duration?: number;
};

export const isVideoUri = (uri: string, galleryAssets?: GalleryAsset[]) => {
  if (!uri) return false;
  const lower = String(uri || '').toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) return false;
  return lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.includes('video');
};

export const useCreatePost = (params: any = {}) => {
  const router = useRouter();
  const user = useUser();
  
  // --- CORE STATE ---
  const [step, setStep] = useState<'picker' | 'preview' | 'details'>(params.editPostId ? 'details' : (params.step || 'picker'));
  const [loading, setLoading] = useState(false);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [visibility, setVisibility] = useState('Everyone');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [userGroups, setUserGroups] = useState<any[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [location, setLocation] = useState<LocationType | null>(null);
  const [verifiedLocation, setVerifiedLocation] = useState<LocationType | null>(null);
  const [taggedUsers, setTaggedUsers] = useState<UserType[]>([]);
  const [postType, setPostType] = useState(params.postType || 'POST');
  const [selectedCategories, setSelectedCategories] = useState<any[]>([]);
  
  // --- MODAL & SEARCH STATES ---
  const [locationSearch, setLocationSearch] = useState('');
  const [locationResults, setLocationResults] = useState<LocationType[]>([]);
  const [loadingLocationResults, setLoadingLocationResults] = useState(false);
  
  const [verifiedSearch, setVerifiedSearch] = useState('');
  const [verifiedResults, setVerifiedResults] = useState<LocationType[]>([]);
  const [loadingVerifiedResults, setLoadingVerifiedResults] = useState(false);
  const [verifiedOptions, setVerifiedOptions] = useState<LocationType[]>([]);
  const [verifiedCenter, setVerifiedCenter] = useState<any>(null);
  
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<UserType[]>([]);
  const [loadingUserResults, setLoadingUserResults] = useState(false);
  
  const [categorySearch, setCategorySearch] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  
  // --- GALLERY ---
  const [galleryAssets, setGalleryAssets] = useState<GalleryAsset[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [galleryEndCursor, setGalleryEndCursor] = useState<string>();
  const [hasMoreGallery, setHasMoreGallery] = useState(true);

  // --- REFS ---
  const locationTimer = useRef<any>();
  const verifiedTimer = useRef<any>();
  const userTimer = useRef<any>();

  // --- LOGIC ---
  const loadGalleryAssets = async (after?: string) => {
    if (after) setLoadingGallery(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') return;
      const page = await MediaLibrary.getAssetsAsync({
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        first: 30,
        after
      });
      const mapped: GalleryAsset[] = page.assets.map((a: any) => ({
        id: String(a.id),
        uri: String(a.uri),
        mediaType: (a.mediaType === 'video' ? 'video' : 'photo') as "photo" | "video",
        duration: a.duration
      }));
      setGalleryAssets(prev => after ? [...prev, ...mapped] : mapped);
      setGalleryEndCursor(page.endCursor);
      setHasMoreGallery(page.hasNextPage);
    } catch {} finally { setLoadingGallery(false); }
  };

  const handleLocationSearch = (text: string) => {
    setLocationSearch(text);
    if (locationTimer.current) clearTimeout(locationTimer.current);
    locationTimer.current = setTimeout(async () => {
      if (text.length < 2) return setLocationResults([]);
      setLoadingLocationResults(true);
      try {
        const suggestions = await mapService.getAutocompleteSuggestions(text);
        setLocationResults(suggestions.map((s: any) => ({
          name: s.description.split(',')[0],
          address: s.description,
          placeId: s.placeId,
          lat: 0, lon: 0
        })));
      } catch { setLocationResults([]); } finally { setLoadingLocationResults(false); }
    }, 400);
  };

  const handleUserSearch = (text: string) => {
    setUserSearch(text);
    if (userTimer.current) clearTimeout(userTimer.current);
    userTimer.current = setTimeout(async () => {
      setLoadingUserResults(true);
      try {
        const result = await searchUsers(text, 20);
        if (result.success) setUserResults(result.data);
      } catch { setUserResults([]); } finally { setLoadingUserResults(false); }
    }, 400);
  };

  const handleShare = async () => {
    setLoading(true);
    try {
      hapticSuccess();
      router.replace('/(tabs)/home');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadGalleryAssets(); }, []);

  return {
    step, setStep, loading, caption, setCaption, hashtags, setHashtags,
    hashtagInput, setHashtagInput, visibility, setVisibility,
    selectedGroupId, setSelectedGroupId, userGroups,
    selectedImages, setSelectedImages, location, setLocation,
    verifiedLocation, setVerifiedLocation, taggedUsers, setTaggedUsers,
    postType, setPostType, selectedCategories, setSelectedCategories,
    locationSearch, locationResults, loadingLocationResults, handleLocationSearch,
    verifiedSearch, setVerifiedSearch, verifiedResults, loadingVerifiedResults, verifiedOptions, verifiedCenter,
    userSearch, userResults, loadingUserResults, handleUserSearch,
    categorySearch, setCategorySearch, categories, setCategories,
    galleryAssets, loadingGallery, hasMoreGallery, loadGalleryAssets,
    handleShare, isEditMode: !!params.editPostId
  };
};
