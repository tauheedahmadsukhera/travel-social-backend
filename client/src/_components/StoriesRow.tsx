import { Feather } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ResizeMode, Video } from 'expo-av';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
// import {} from "../../lib/firebaseHelpers";
import { createStory, getAllStoriesForFeed, getUserProfile } from "../../lib/firebaseHelpers/index";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Responsive values
const isSmallDevice = SCREEN_HEIGHT < 700;
const isMediumDevice = SCREEN_HEIGHT >= 700 && SCREEN_HEIGHT < 850;

const responsiveValues = {
  // Image preview height
  imageHeight: isSmallDevice ? 240 : isMediumDevice ? 300 : 340,

  // Font sizes
  titleSize: isSmallDevice ? 16 : 18,
  labelSize: isSmallDevice ? 13 : 14,
  inputSize: isSmallDevice ? 14 : 15,

  // Spacing
  spacing: isSmallDevice ? 12 : 16,
  spacingLarge: isSmallDevice ? 16 : 20,

  // Input heights
  inputHeight: isSmallDevice ? 44 : 48,

  // Padding
  modalPadding: isSmallDevice ? 16 : 20,
};

interface StoryUser {
  userId: string;
  userName: string;
  userAvatar: string;
  stories: any[];
  hasUnseen?: boolean;
  bubblePreviewUrl?: string;
  bubbleMediaType?: 'image' | 'video';
}

function isRecord(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object';
}

function getStoryBubbleThumbnail(storyUser: StoryUser, defaultAvatarUrl: string): string {
  return storyUser?.bubblePreviewUrl || storyUser?.userAvatar || defaultAvatarUrl;
}

function StoriesRowComponent({ onStoryPress, onStoryViewerClose, refreshTrigger, resetTrigger, mirror = false, incomingMedia }: { onStoryPress?: (stories: any[], initialIndex: number) => void; onStoryViewerClose?: () => void; refreshTrigger?: number; resetTrigger?: number; mirror?: boolean; incomingMedia?: { uri: string; type: string } | null }): React.ReactElement {
  const router = useRouter();
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [currentUserAvatar, setCurrentUserAvatar] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);
  const [isViewingStories, setIsViewingStories] = useState(false);
  const scrollRef = React.useRef<ScrollView>(null);
  const autoScrolledRef = React.useRef(false);

  // Use ref to prevent picker from opening during transitions
  const pickerBlockedRef = React.useRef(false);

  // Default avatar placeholder
  const DEFAULT_AVATAR_URL = 'https://via.placeholder.com/200x200.png?text=Profile';
  const STORY_RING_UNSEEN = ['#F58529', '#DD2A7B', '#8134AF'] as const;
  const STORY_RING_SEEN = '#D1D5DB';

  // Get current user from AsyncStorage (token-based auth)
  useEffect(() => {
    const getUserData = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        if (userId) {
          setAuthUser({ uid: userId });
        }
      } catch (error) {
        console.error('[StoriesRow] Failed to get userId from storage:', error);
      }
    };
    getUserData();
  }, []);

  // Reset modal state when screen comes into focus (to prevent media picker from auto-opening)
  useFocusEffect(
    useCallback(() => {
      // When screen comes into focus, ensure modal is closed
      return () => {
        // Cleanup when screen loses focus - optional
      };
    }, [])
  );

  useEffect(() => {
    loadStories();
    loadCurrentUserAvatar();
  }, [refreshTrigger]);

  useEffect(() => {
    if (!authUser?.uid) return;
    loadCurrentUserAvatar();
  }, [authUser?.uid]);

  useEffect(() => {
    if (!mirror) return;
    // Ensure the horizontal list starts from the right (Option A)
    requestAnimationFrame(() => {
      try {
        scrollRef.current?.scrollToEnd({ animated: false });
      } catch { }
    });
  }, [mirror, storyUsers.length, authUser?.uid]);

  useEffect(() => {
    autoScrolledRef.current = false;
  }, [mirror, storyUsers.length, authUser?.uid]);

  // Auto-open upload modal when story-creator sends back selected media
  useEffect(() => {
    if (!incomingMedia?.uri) return;
    setSelectedMedia({ uri: incomingMedia.uri, type: incomingMedia.type });
    setShowUploadModal(true);
  }, [incomingMedia?.uri]);

  // Mark a user's stories as seen (persist + update local ring state)
  const markUserStoriesSeen = useCallback(async (userId: string, stories: any[]) => {
    try {
      const ids = Array.isArray(stories) ? stories.map((s: any) => String(s?._id || s?.id || '')) : [];
      const raw = await AsyncStorage.getItem('seenStoryIds');
      const arr = raw ? JSON.parse(raw) : [];
      const set = new Set<string>(Array.isArray(arr) ? arr.map((x: any) => String(x)) : []);
      ids.forEach(id => { if (id) set.add(id); });
      await AsyncStorage.setItem('seenStoryIds', JSON.stringify(Array.from(set)));
      // Update local state so ring color changes instantly
      setStoryUsers(prev => prev.map(u => u.userId === userId ? { ...u, hasUnseen: false } : u));
    } catch { }
  }, []);

  // Reset state when StoriesViewer closes
  useEffect(() => {
    const resetViewerState = () => {
      console.log('[StoriesRow] ðŸ”„ Resetting viewer state from parent signal');
      setIsViewingStories(false);
      pickerBlockedRef.current = false;
    };

    // If callback is provided, we can use it to know when viewer closes
    // For now, we reset based on state changes
    return () => {
      resetViewerState();
    };
  }, []);

  // Listen for reset trigger from parent (when StoriesViewer closes)
  useEffect(() => {
    if (resetTrigger && resetTrigger > 0) {
      console.log('[StoriesRow] ðŸ”„ Reset trigger received:', resetTrigger);
      setIsViewingStories(false);
      pickerBlockedRef.current = false;
    }
  }, [resetTrigger]);

  // Fetch location suggestions from Google Places API
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
    }, 600); // Increased from 400ms to 600ms for better debouncing
    return () => clearTimeout(timer);
  }, [locationQuery]);

  const loadCurrentUserAvatar = async () => {
    // Try to get avatar from stored profile
    if (authUser && authUser.uid) {
      try {
        const userProfile = await getUserProfile(authUser.uid);
        const avatar = userProfile?.data?.avatar || userProfile?.data?.photoURL;
        if (avatar) {
          setCurrentUserAvatar(String(avatar));
          return;
        }
      } catch (err) {
        console.error('[StoriesRow] Error fetching user profile:', err);
      }
    }
  };

  const loadStories = async () => {
    try {
      console.log('[StoriesRow] ðŸ“¥ Loading stories...');
      const result = await getAllStoriesForFeed();
      console.log('[StoriesRow] API Response received:', JSON.stringify(result).substring(0, 200));
      console.log('[StoriesRow] Got result.success:', result.success, 'result.data type:', typeof result.data, 'length:', result.data?.length);
      let seenSet = new Set<string>();
      try {
        const raw = await AsyncStorage.getItem('seenStoryIds');
        const arr = raw ? JSON.parse(raw) : [];
        if (Array.isArray(arr)) {
          seenSet = new Set(arr.map((x: any) => String(x)));
        }
      } catch { }

      if (result.success && result.data && Array.isArray(result.data)) {
        const now = Date.now();
        const users: StoryUser[] = [];

        // Group stories by userId (API returns flat array, we need to group them)
        const storyMap = new Map<string, any[]>();

        for (const story of result.data) {
          // Filter out expired stories (robust check)
          const expiryTime = story.expiresAt ? new Date(story.expiresAt).getTime() : 0;
          if (expiryTime > 0 && expiryTime <= now) {
            console.log('[StoriesRow] Skipping expired story:', story._id);
            continue;
          }

          const userId = story.userId;
          if (!storyMap.has(userId)) {
            storyMap.set(userId, []);
          }
          storyMap.get(userId)!.push(story);
        }

        console.log('[StoriesRow] Grouped stories into', storyMap.size, 'users');

        // Collect user IDs to fetch profiles for
        const userIdsToFetch = Array.from(storyMap.keys());
        console.log('[StoriesRow] Need to fetch profiles for', userIdsToFetch.length, 'users');

        // Batch fetch all user profiles at once
        const avatarMap = new Map<string, string>();
        const profilePromises = userIdsToFetch.map(async (userId) => {
          try {
            const profileRes = await getUserProfile(userId);
            if (isRecord(profileRes) && profileRes.success && 'data' in profileRes && profileRes.data) {
              return { userId, avatar: profileRes.data.avatar };
            }
          } catch (e) {
            console.log('[StoriesRow] Error fetching profile for', userId, e);
          }
          return { userId, avatar: DEFAULT_AVATAR_URL };
        });

        const profiles = await Promise.all(profilePromises);
        profiles.forEach(({ userId, avatar }) => avatarMap.set(userId, avatar));

        // Build users array with cached avatars
        for (const [userId, stories] of storyMap.entries()) {
          const firstStory = stories[0];

          // Transform stories to match StoriesViewer format (image -> imageUrl, video -> videoUrl)
          const transformedStories = stories.map((story: any) => ({
            ...story,
            id: story._id || story.id,
            imageUrl: story.image || story.imageUrl || story.mediaUrl,
            videoUrl: story.video || story.videoUrl,
            thumbnailUrl: story.thumbnail || story.thumbnailUrl,
            mediaType: story.video ? 'video' : 'image'
          }));
          const hasUnseen = transformedStories.some((s: any) => !seenSet.has(String(s.id)));

          // Pick bubble preview: first unseen story, else latest by createdAt, else first
          const firstUnseen = transformedStories.find((s: any) => !seenSet.has(String(s.id)));
          const latest = transformedStories.reduce((acc: any, cur: any) => {
            const accTs = Number(new Date(acc?.createdAt || 0));
            const curTs = Number(new Date(cur?.createdAt || 0));
            return curTs > accTs ? cur : acc;
          }, transformedStories[0]);
          const previewStory = firstUnseen || latest || transformedStories[0];
          const bubbleMediaType: 'image' | 'video' = previewStory?.mediaType === 'video' ? 'video' : 'image';
          const bubblePreviewUrl = bubbleMediaType === 'video'
            ? (previewStory?.thumbnailUrl || previewStory?.imageUrl || '')
            : (previewStory?.imageUrl || previewStory?.thumbnailUrl || '');

          users.push({
            userId: userId,
            userName: firstStory.userName || 'Anonymous',
            userAvatar: avatarMap.get(userId) || DEFAULT_AVATAR_URL,
            stories: transformedStories as any[],
            hasUnseen,
            bubblePreviewUrl,
            bubbleMediaType
          });
        }

        console.log('[StoriesRow] âœ… Setting storyUsers:', users.length, 'users');
        setStoryUsers(users);
      } else {
        console.log('[StoriesRow] âŒ Result not success or no data');
      }
    } catch (error) {
      console.error('[StoriesRow] âŒ Error loading stories:', error);
    }
    setLoading(false);
  };

  async function handleAddStory() {
    // CRITICAL: Block picker if we're transitioning to view stories
    if (pickerBlockedRef.current || isViewingStories || showUploadModal) {
      console.log('[StoriesRow] ðŸš« Picker BLOCKED:', { pickerBlocked: pickerBlockedRef.current, isViewingStories, showUploadModal });
      return;
    }
    if (!authUser?.uid) {
      Alert.alert('Login required', 'Please login to create a story');
      return;
    }

    // Navigate to Instagram-style story creator screen
    router.push('/story-creator' as any);
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', height: 90 }]}>
        <ActivityIndicator size="small" color="#0A3D62" />
      </View>
    );
  }

  // Check if current user has a story
  const myUser = authUser && authUser.uid ? storyUsers.find(u => u.userId === authUser.uid) : undefined;
  const hasMyStory = !!(myUser && myUser.stories && myUser.stories.length > 0);
  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() => {
          if (!mirror) return;
          if (autoScrolledRef.current) return;
          autoScrolledRef.current = true;
          requestAnimationFrame(() => {
            try {
              scrollRef.current?.scrollToEnd({ animated: false });
            } catch { }
          });
        }}
        contentContainerStyle={[{ paddingHorizontal: 14 }, mirror && { flexDirection: 'row-reverse', flexGrow: 1 }]}
      >
        {/* â”€â”€ Current user: single tile (Instagram-style) â”€â”€ */}
        <View style={[styles.storyWrapper, mirror && { marginRight: 0, marginLeft: 4 }]}>
          <View style={styles.currentUserTile}>
            <TouchableOpacity
              style={styles.storyButton}
              activeOpacity={0.8}
              disabled={showUploadModal}
              onPress={async () => {
                if (hasMyStory && myUser) {
                  // View own story
                  await markUserStoriesSeen(String(myUser.userId), myUser.stories);
                  if (onStoryPress) onStoryPress(myUser.stories, 0);
                } else {
                  handleAddStory();
                }
              }}
            >
              {hasMyStory && myUser ? (
                // Show story thumbnail with gradient ring
                <LinearGradient
                  colors={myUser.hasUnseen ? STORY_RING_UNSEEN : ([STORY_RING_SEEN, STORY_RING_SEEN] as const)}
                  style={styles.gradientBorder}
                >
                  <View style={styles.storyAvatarWrapper}>
                    <ExpoImage
                      source={{ uri: getStoryBubbleThumbnail(myUser, DEFAULT_AVATAR_URL) }}
                      style={styles.storyAvatar}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  </View>
                  {myUser.bubbleMediaType === 'video' ? (
                    <View style={styles.overlayTypePill}>
                      <Feather name={'video'} size={12} color="#fff" />
                    </View>
                  ) : null}
                </LinearGradient>
              ) : (
                // No story yet â€” show plain avatar
                <View style={[styles.gradientBorder, styles.ctaNoRingBorder]}>
                  <View style={[styles.storyAvatarWrapper, styles.ctaAvatarWrapper]}>
                    <ExpoImage
                      source={{ uri: currentUserAvatar || DEFAULT_AVATAR_URL }}
                      style={styles.storyAvatar}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  </View>
                </View>
              )}
            </TouchableOpacity>

            {/* + button always visible to add/add more */}
            <TouchableOpacity
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={styles.addButton}
              onPress={handleAddStory}
              activeOpacity={0.9}
              disabled={showUploadModal}
            >
              <Feather name="plus" size={10} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={[styles.userName, !hasMyStory && styles.userNameCta]} numberOfLines={1}>
            {hasMyStory ? 'Your story' : 'Add story'}
          </Text>
        </View>

        {/* Other users' stories */}
        {authUser && authUser.uid ? storyUsers.filter(u => u.userId !== authUser.uid).map((user, idx) => (
          <View style={[styles.storyWrapper, mirror && { marginRight: 0, marginLeft: 4 }]} key={user.userId}>
            <TouchableOpacity
              style={styles.storyButton}
              activeOpacity={0.8}
              onPress={async () => {
                await markUserStoriesSeen(String(user.userId), user.stories);
                onStoryPress && onStoryPress(user.stories, 0);
              }}
            >
              <LinearGradient
                colors={user.hasUnseen ? STORY_RING_UNSEEN : ([STORY_RING_SEEN, STORY_RING_SEEN] as const)}
                style={styles.gradientBorder}
              >
                <View style={styles.storyAvatarWrapper}>
                  <ExpoImage
                    source={{ uri: getStoryBubbleThumbnail(user, DEFAULT_AVATAR_URL) }}
                    style={styles.storyAvatar}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                </View>
                {user.bubbleMediaType === 'video' ? (
                  <View style={[styles.overlayTypePill, mirror && { left: undefined, right: 6 }]}>
                    <Feather name={'video'} size={12} color="#fff" />
                  </View>
                ) : null}
              </LinearGradient>
            </TouchableOpacity>
            <Text style={styles.userName} numberOfLines={1}>{user.userName}</Text>
          </View>
        )) : null}
      </ScrollView>
      {/* Simple & Clean Story Upload Modal */}
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
                    console.log('[StoriesRow] Close button pressed');
                    setShowUploadModal(false);
                    setSelectedMedia(null);
                    setLocationQuery('');
                    setLocationSuggestions([]);
                  }}
                >
                  <Feather name="x" size={24} color="#222" />
                </TouchableOpacity>

                {/* Title in center */}
                <Text style={styles.modalTitle}>Create Story</Text>

                {/* Profile pic on right - can be tapped to view stories */}
                <TouchableOpacity
                  activeOpacity={0.5}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={() => {
                    console.log('[StoriesRow] âœ… Profile pic clicked - viewing stories...');

                    // ðŸš« BLOCK PICKER IMMEDIATELY AND KEEP IT BLOCKED
                    pickerBlockedRef.current = true;
                    setIsViewingStories(true);

                    // Close upload modal
                    setShowUploadModal(false);
                    setSelectedMedia(null);
                    setLocationQuery('');
                    setLocationSuggestions([]);

                    // Find own stories
                    const myUser = storyUsers.find(u => u.userId === authUser?.uid);
                    console.log('[StoriesRow] My user:', myUser?.userId, 'Stories count:', myUser?.stories?.length);

                    if (myUser && myUser.stories && myUser.stories.length > 0 && onStoryPress) {
                      console.log('[StoriesRow] âœ… Opening stories viewer for', myUser.stories.length, 'stories');

                      // Open viewer after modal close animation (give time for modal to close first)
                      setTimeout(() => {
                        console.log('[StoriesRow] Calling onStoryPress callback...');
                        onStoryPress(myUser.stories, 0);

                        // Don't unblock yet - wait for StoriesViewer to actually close
                        // This will be handled by the parent when StoriesViewer closes
                      }, 300);

                      // Call the close callback if provided (for resetting parent state)
                      if (onStoryViewerClose) {
                        // The close callback should be called from parent when viewer closes
                        console.log('[StoriesRow] Note: Parent should reset state when StoriesViewer closes');
                      }
                    } else {
                      console.log('[StoriesRow] âŒ No stories to view:', { hasUser: !!myUser, storiesCount: myUser?.stories?.length });
                      // Reset immediately if no stories
                      pickerBlockedRef.current = false;
                      setIsViewingStories(false);
                    }
                  }}
                >
                  <ExpoImage
                    source={{ uri: currentUserAvatar || DEFAULT_AVATAR_URL }}
                    style={{ width: 40, height: 40, borderRadius: 20 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                </TouchableOpacity>
              </View>

              <ScrollView
                contentContainerStyle={{
                  paddingHorizontal: responsiveValues.modalPadding,
                  paddingBottom: isSmallDevice ? 30 : 40
                }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
                bounces={false}
              >
                {/* Media Preview */}
                {selectedMedia ? (
                  <View style={styles.mediaPreviewContainer}>
                    {String(selectedMedia?.type || '').toLowerCase() === 'video' || String(selectedMedia?.mimeType || '').toLowerCase().includes('video') ? (
                      <Video
                        source={{ uri: selectedMedia.uri }}
                        style={styles.modalImage}
                        resizeMode={ResizeMode.COVER}
                        useNativeControls
                        shouldPlay={false}
                        isLooping={false}
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
                ) : (
                  <TouchableOpacity
                    style={styles.imagePickerArea}
                    disabled={isViewingStories || pickerBlockedRef.current}
                    onPress={async () => {
                      if (isViewingStories || pickerBlockedRef.current) {
                        console.log('[StoriesRow] ðŸš« Picker disabled:', { isViewingStories, pickerBlocked: pickerBlockedRef.current });
                        return;
                      }
                      console.log('[StoriesRow] Opening image picker...');
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
                    <Feather name="image" size={48} color="#007aff" />
                    <Text style={styles.imagePickerText}>Select Photo or Video</Text>
                  </TouchableOpacity>
                )}

                {/* Caption Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Caption (Optional)</Text>
                  <TextInput
                    placeholder="Write something..."
                    value={selectedMedia?.caption || ''}
                    onChangeText={text => setSelectedMedia((prev: any) => prev ? { ...prev, caption: text } : prev)}
                    style={styles.inputField}
                    maxLength={120}
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
                        returnKeyType="done"
                        blurOnSubmit={true}
                      />
                    </View>
                    {locationSuggestions.length > 0 && (
                      <View style={styles.locationDropdown}>
                        <ScrollView
                          nestedScrollEnabled={true}
                          showsVerticalScrollIndicator={true}
                          keyboardShouldPersistTaps="handled"
                        >
                          {locationSuggestions.map((item) => (
                            <TouchableOpacity
                              key={item.placeId}
                              style={styles.locationItem}
                              onPress={() => {
                                console.log('Location selected:', item);
                                Keyboard.dismiss();
                                setSelectedMedia((prev: any) => prev ? {
                                  ...prev,
                                  locationData: {
                                    name: item.name,
                                    address: item.address,
                                    placeId: item.placeId,
                                  }
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
                    {loadingLocations && (
                      <View style={styles.locationLoading}>
                        <ActivityIndicator size="small" color="#007aff" />
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
                    if (!selectedMedia || !authUser || uploading) return;
                    setUploading(true);
                    setUploadProgress(0);

                    let didSucceed = false;
                    try {
                      let uploadUri = selectedMedia.uri;
                      const mediaType = selectedMedia.type === 'video' ? 'video' : 'image';

                      // Compress image before upload (handle errors gracefully)
                      if (mediaType === 'image') {
                        try {
                          console.log('[StoriesRow] Attempting to compress image:', selectedMedia.uri);
                          const manipResult = await ImageManipulator.manipulateAsync(
                            selectedMedia.uri,
                            [{ resize: { width: 1080 } }],
                            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                          );
                          uploadUri = manipResult.uri;
                          console.log('[StoriesRow] âœ… Image compressed successfully');
                        } catch (err) {
                          // Fallback to original if compression fails
                          console.warn('[StoriesRow] âš ï¸ Image compression failed, using original:', err);
                          uploadUri = selectedMedia.uri;
                        }
                      }

                      // Pass location data + real progress callback to createStory
                      const storyRes = await createStory(
                        typeof authUser?.uid === 'string' ? authUser.uid : '',
                        uploadUri,
                        mediaType,
                        selectedMedia.locationData,
                        (percent: number) => {
                          setUploadProgress((prev) => {
                            const clamped = Math.max(0, Math.min(100, Math.round(percent)));
                            const next = Math.min(99, Math.max(prev, clamped));
                            return next;
                          });
                        }
                      );

                      if (!storyRes?.success) {
                        throw new Error('Failed to upload story');
                      }

                      didSucceed = true;
                      setUploadProgress(100);

                      await loadStories();
                      setTimeout(() => {
                        setUploading(false);
                        setShowUploadModal(false);
                        setSelectedMedia(null);
                        setLocationQuery('');
                        setLocationSuggestions([]);
                        setUploadProgress(0);
                      }, 600);
                    } catch (error: any) {
                      console.error('[StoriesRow] âŒ Story upload failed:', error);
                      setUploadProgress(0);
                      Alert.alert('Error', error?.message || 'Failed to upload story');
                    } finally {
                      if (!didSucceed) {
                        setUploading(false);
                      }
                    }
                  }}
                >
                  <Text style={styles.shareButtonText}>
                    {uploading ? 'Sharing...' : 'Share Story'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

export default React.memo(StoriesRowComponent, (prevProps, nextProps) => {
  return prevProps.refreshTrigger === nextProps.refreshTrigger;
});

const styles = StyleSheet.create({
  uploadModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  uploadModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 0,
    backgroundColor: '#fff',
  },
  currentUserImage: {
    width: '100%',
    height: '100%',
    borderRadius: 9,
  },
  addButton: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#0095F6',
    borderRadius: 12,
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    zIndex: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  currentUserTile: {
    position: 'relative',
    overflow: 'visible',
  },
  ctaGradientBorder: {
    borderWidth: 0,
  },
  ctaNoRingBorder: {
    padding: 0,
    backgroundColor: 'transparent',
  },
  ctaAvatarWrapper: {
    borderWidth: 0,
  },
  storyWrapper: {
    alignItems: 'center',
    marginRight: 12,
  },
  storyButton: {
    marginBottom: 0,
  },
  gradientBorder: {
    width: 70,
    height: 70,
    borderRadius: 14,
    padding: 2.5,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  storyAvatarWrapper: {
    width: '100%',
    height: '100%',
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: '#fff',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  storyAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 11,
  },
  overlayTypePill: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  overlayAvatarChip: {
    position: 'absolute',
    top: 2,
    left: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fff',
    overflow: 'hidden',
    backgroundColor: '#e9eef5',
    zIndex: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  overlayAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  userName: {
    fontSize: 12,
    fontWeight: '500',
    width: 70,
    textAlign: 'center',
    color: '#333',
    marginTop: 4,
  },
  userNameCta: {
    color: '#111',
    fontWeight: '600',
  },
  uploadModalCard: {
    flex: 1,
    backgroundColor: '#fff',
    width: '100%',
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 2,
    borderTopColor: '#FFB800',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: responsiveValues.spacing,
    paddingHorizontal: responsiveValues.modalPadding,
    borderBottomWidth: 2,
    borderBottomColor: '#FFB800',
    backgroundColor: '#fffbf5',
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
    borderRadius: 16,
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
  imagePickerArea: {
    width: '100%',
    height: responsiveValues.imageHeight,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    backgroundColor: '#fafafa',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: responsiveValues.spacingLarge,
    marginBottom: responsiveValues.spacingLarge,
  },
  imagePickerText: {
    color: '#007aff',
    marginTop: 12,
    fontWeight: '600',
    fontSize: responsiveValues.inputSize,
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
    maxHeight: isSmallDevice ? 80 : 100,
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
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 10,
    minHeight: responsiveValues.inputHeight,
  },
  locationInput: {
    flex: 1,
    fontSize: responsiveValues.inputSize,
    color: '#222',
    padding: 0,
  },
  uploadingArea: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 12,
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
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  shareButtonDisabled: {
    backgroundColor: '#e0e0e0',
  },
  shareButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  locationDropdown: {
    position: 'absolute',
    top: responsiveValues.inputHeight + 8,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    maxHeight: isSmallDevice ? 160 : 200,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: isSmallDevice ? 12 : 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  locationName: {
    color: '#222',
    fontSize: responsiveValues.labelSize,
    fontWeight: '600',
  },
  locationAddress: {
    color: '#999',
    fontSize: isSmallDevice ? 11 : 12,
    marginTop: 2,
  },
  locationLoading: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
});


