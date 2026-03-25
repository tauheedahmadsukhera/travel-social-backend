import { Feather, Ionicons } from '@expo/vector-icons';
import { AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
// Firebase removed - using Backend API
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteStory } from '../../lib/firebaseHelpers/deleteStory';
import { addCommentReply, addStoryToHighlight, getUserHighlights } from '../../lib/firebaseHelpers/index';
import { getKeyboardOffset } from '../../utils/responsive';
import { useUser } from './UserContext';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'expo-router';

const { width, height } = Dimensions.get('window');

interface Story {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  imageUrl: string;
  videoUrl?: string;
  mediaType?: 'image' | 'video';
  createdAt: any;
  views?: string[];
  likes?: string[];
  comments?: StoryComment[];
}

interface StoryComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  createdAt: any;
  replies?: StoryComment[];
  likes?: string[];
  likesCount?: number;
  editedAt?: any;
}

export default function StoriesViewer({ stories, onClose, initialIndex = 0 }: { stories: Story[]; onClose: () => void; initialIndex?: number }): React.ReactElement {
  // Default avatar from Firebase Storage
  const DEFAULT_AVATAR_URL = 'https://via.placeholder.com/200x200.png?text=Profile';
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [imageLoading, setImageLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [commentPanY, setCommentPanY] = useState(0);
  const commentPanResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
    onPanResponderMove: (_, gestureState) => {
      setCommentPanY(gestureState.dy);
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 40) {
        setShowComments(false);
      }
      setCommentPanY(0);
    },
  });
  const [commentText, setCommentText] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [localStories, setLocalStories] = useState(stories);
  const [videoDuration, setVideoDuration] = useState(5000); // ms
  const videoRef = useRef<Video>(null);
  const userContextUser = useUser();
  // Get current user from AsyncStorage (token-based auth) instead of UserContext
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [latestAvatar, setLatestAvatar] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [likedComments, setLikedComments] = useState<{ [key: string]: boolean }>({});
  const [commentLikesCount, setCommentLikesCount] = useState<{ [key: string]: number }>({});
  const [showHighlightModal, setShowHighlightModal] = useState(false);
  const [userHighlights, setUserHighlights] = useState<any[]>([]);
  const [loadingHighlights, setLoadingHighlights] = useState(false);

  // Robust date parsing for createdAt coming as number | string | Date | Firestore-like
  const toDate = (input: any): Date | null => {
    try {
      if (!input) return null;
      if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
      if (typeof input === 'number') {
        const d = new Date(input);
        return isNaN(d.getTime()) ? null : d;
      }
      if (typeof input === 'string') {
        const d = new Date(input);
        return isNaN(d.getTime()) ? null : d;
      }
      if (input?.toDate && typeof input.toDate === 'function') {
        const d = input.toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d : null;
      }
      if (input?._seconds != null) {
        const ms = Number(input._seconds) * 1000 + Math.floor(Number(input._nanoseconds || 0) / 1e6);
        const d = new Date(ms);
        return isNaN(d.getTime()) ? null : d;
      }
      if (input?.$date != null) {
        const d = new Date(input.$date);
        return isNaN(d.getTime()) ? null : d;
      }
      const d = new Date(input);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  const relativeTime = useMemo(() => {
    const d = toDate(localStories[currentIndex]?.createdAt);
    return d ? formatDistanceToNow(d, { addSuffix: true }) : 'Just now';
  }, [localStories, currentIndex]);

  // Load current user from AsyncStorage on mount
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        if (userId) {
          // Load full user profile
          try {
            const { apiService } = await import('@/src/_services/apiService');
            const response = await apiService.get(`/users/${userId}`);
            if (response.success && response.data) {
              setCurrentUser({
                uid: userId,
                displayName: response.data.displayName || response.data.name || 'User',
                photoURL: response.data.avatar || response.data.photoURL || null
              });
              console.log('[StoriesViewer] Loaded full user profile:', response.data.displayName);
            } else {
              // Fallback to just userId
              setCurrentUser({ uid: userId });
              console.log('[StoriesViewer] Loaded userId only:', userId);
            }
          } catch (error) {
            // Fallback to just userId
            setCurrentUser({ uid: userId });
            console.log('[StoriesViewer] Loaded userId only (profile fetch failed):', userId);
          }
        }
      } catch (error) {
        console.error('[StoriesViewer] Failed to load userId from storage:', error);
      }
    };
    loadCurrentUser();
  }, []);

  const loadUserHighlights = async () => {
    if (!currentUser?.uid) return;
    setLoadingHighlights(true);
    try {
      const result = await getUserHighlights(currentUser.uid);
      if (result.success && result.highlights) {
        setUserHighlights(result.highlights);
      }
    } catch (error) {
      console.error('Error loading highlights:', error);
    } finally {
      setLoadingHighlights(false);
    }
  };

  const handleAddToHighlight = async (highlightId: string) => {
    try {
      const result = await addStoryToHighlight(highlightId, currentStory.id);
      if (result.success) {
        Alert.alert('Success', 'Story added to highlight!');
        setShowHighlightModal(false);
      } else {
        Alert.alert('Error', result.error || 'Failed to add story to highlight');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add story to highlight');
    }
  };

  const handleOpenHighlightModal = () => {
    setShowHighlightModal(true);
    loadUserHighlights();
  };

  useEffect(() => {
    async function fetchLatestAvatar() {
      if (currentUser?.uid) {
        // TODO: Backend API to fetch user avatar
        // const response = await fetch(`/api/users/${currentUser.uid}`);
        // const data = await response.json();
        // setLatestAvatar(data.avatar || data.photoURL || null);
        setLatestAvatar(currentUser.photoURL || null);
      }
    }
    fetchLatestAvatar();
  }, [currentUser?.uid, currentUser?.photoURL]);

  // Sync localStories and currentIndex when stories or initialIndex change
  useEffect(() => {
    setLocalStories(stories);
    setCurrentIndex(initialIndex);
  }, [stories, initialIndex]);

  // Filter out stories from blocked users
  useEffect(() => {
    async function applyBlockedFilter() {
      try {
        if (!currentUser?.uid) return;
        // TODO: Implement backend API to fetch blocked users list
        // const response = await fetch(`/api/users/${currentUser.uid}/blocked`);
        // const data = await response.json();
        // const blockedIds = new Set(data.map((u: any) => u.userId));

        const blockedIds = new Set<string>();
        setLocalStories(prev => prev.filter(s => !blockedIds.has(s.userId)));
        // Adjust index if filtered list shrinks before currentIndex
        setCurrentIndex(idx => {
          const len = localStories.length;
          if (len === 0) return 0;
          return Math.min(idx, len - 1);
        });
      } catch (e) {
        // Fail open: if blocked list cannot be fetched, keep original stories
        console.warn('Failed to fetch blocked users for stories:', e);
      }
    }
    applyBlockedFilter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  // Initialize liked comments when current story changes
  useEffect(() => {
    if (currentStory.comments) {
      const likedMap: { [key: string]: boolean } = {};
      const likesCountMap: { [key: string]: number } = {};

      currentStory.comments.forEach(comment => {
        likedMap[comment.id] = Array.isArray(comment.likes) ? comment.likes.includes(currentUser?.uid || '') : false;
        likesCountMap[comment.id] = comment.likesCount || 0;

        if (comment.replies) {
          comment.replies.forEach(reply => {
            likedMap[reply.id] = Array.isArray(reply.likes) ? reply.likes.includes(currentUser?.uid || '') : false;
            likesCountMap[reply.id] = reply.likesCount || 0;
          });
        }
      });

      setLikedComments(likedMap);
      setCommentLikesCount(likesCountMap);
    }
  }, [currentIndex, localStories, currentUser?.uid]);

  useEffect(() => {
    const isVideo = currentStory?.videoUrl || currentStory?.mediaType === 'video';
    const duration = isVideo ? videoDuration : 5000;
    if (isPaused || showComments || imageLoading) return;
    const increment = 100 / (duration / 50);
    const interval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + increment;
        if (newProgress >= 100) {
          if (currentIndex < localStories.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setImageLoading(true);
            setVideoDuration(5000);
            return 0;
          } else {
            // Don't call onClose here - use useEffect to watch for end condition
            return 100;
          }
        }
        return newProgress;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [currentIndex, localStories.length, isPaused, showComments, imageLoading, videoDuration]);

  // Call onClose when story reaches end
  useEffect(() => {
    if (progress >= 100 && currentIndex >= localStories.length - 1) {
      onClose();
    }
  }, [progress, currentIndex, localStories.length, onClose]);

  const currentStory = localStories[currentIndex];
  const isLiked = currentStory.likes?.includes(currentUser?.uid || '') || false;
  const likesCount = currentStory.likes?.length || 0;

  if (!currentStory) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 16 }}>Loading story...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleLike = async () => {
    if (!currentUser) {
      Alert.alert('Please Login', 'You need to be logged in to like stories.');
      return;
    }

    const storyId = currentStory.id;
    const userId = currentUser.uid;

    // Optimistic update
    const updatedStories = [...localStories];
    const likes = updatedStories[currentIndex].likes || [];

    if (isLiked) {
      updatedStories[currentIndex].likes = likes.filter(id => id !== userId);
    } else {
      updatedStories[currentIndex].likes = [...likes, userId];
    }
    setLocalStories(updatedStories);

    // Backend call
    try {
      const { apiService } = await import('@/src/_services/apiService');
      const response = await apiService.post(`/stories/${storyId}/like`, { userId });

      if (!response.success) {
        // Revert on failure
        setLocalStories([...localStories]);
        console.error('[StoriesViewer] Like failed:', response.error);
      }
    } catch (error) {
      // Revert on error
      setLocalStories([...localStories]);
      console.error('[StoriesViewer] Like error:', error);
    }
  };

  const handleComment = async () => {
    if (!currentUser) {
      Alert.alert('Please Login', 'You need to be logged in to comment on stories.');
      return;
    }
    let avatarToSave = DEFAULT_AVATAR_URL;
    if (currentUser.photoURL && currentUser.photoURL !== DEFAULT_AVATAR_URL && currentUser.photoURL !== '') {
      avatarToSave = currentUser.photoURL;
    }
    if (replyToId) {
      // Reply to a comment
      if (!replyText.trim()) return;
      const newReply: StoryComment = {
        id: Date.now().toString(),
        userId: currentUser.uid,
        userName: currentUser.displayName || 'User',
        userAvatar: avatarToSave,
        text: replyText.trim(),
        createdAt: new Date(),
      };
      const updatedStories = [...localStories];
      updatedStories[currentIndex].comments = (updatedStories[currentIndex].comments || []).map(c => {
        if (c.id === replyToId) {
          return {
            ...c,
            replies: [...(c.replies || []), newReply]
          };
        }
        return c;
      });
      setLocalStories(updatedStories);
      setReplyText('');
      setReplyToId(null);
      // Save reply to Firestore
      await addCommentReply(
        currentStory.id,
        replyToId,
        newReply
      );
    } else {
      // New top-level comment
      if (!commentText.trim()) return;

      const storyId = currentStory.id;
      const text = commentText.trim();

      // Optimistic update
      const newComment: StoryComment = {
        id: Date.now().toString(),
        userId: currentUser.uid,
        userName: currentUser.displayName || 'User',
        userAvatar: avatarToSave,
        text,
        createdAt: new Date(),
      };
      const updatedStories = [...localStories];
      updatedStories[currentIndex].comments = [...(updatedStories[currentIndex].comments || []), newComment];
      setLocalStories(updatedStories);
      setCommentText('');

      // Backend call
      try {
        const { apiService } = await import('@/src/_services/apiService');
        const response = await apiService.post(`/stories/${storyId}/comments`, {
          userId: currentUser.uid,
          userName: currentUser.displayName || 'User',
          text
        });

        if (response.success && response.data) {
          // Update with real comment ID from backend
          const updatedWithRealId = [...localStories];
          const commentIndex = updatedWithRealId[currentIndex].comments?.findIndex(c => c.id === newComment.id);
          if (commentIndex !== undefined && commentIndex >= 0 && updatedWithRealId[currentIndex].comments) {
            updatedWithRealId[currentIndex].comments[commentIndex] = {
              ...response.data,
              id: response.data._id || response.data.id
            };
            setLocalStories(updatedWithRealId);
          }
        } else {
          console.error('[StoriesViewer] Comment failed:', response.error);
        }
      } catch (error) {
        console.error('[StoriesViewer] Comment error:', error);
      }
    }
  };

  const getTimeAgo = (timestamp: any) => {
    if (!timestamp) return '';
    const now = new Date();
    const time = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diff = now.getTime() - time.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  };

  const handleLikeComment = async (commentId: string) => {
    if (!currentUser?.uid) return;
    // Only update local state, backend like/unlike not available
    const isLiked = likedComments[commentId];
    setLikedComments(prev => ({ ...prev, [commentId]: !isLiked }));
    setCommentLikesCount(prev => ({
      ...prev,
      [commentId]: Math.max(0, (prev[commentId] || 0) + (isLiked ? -1 : 1))
    }));
  };

  const handleEditComment = async (commentId: string) => {
    if (!editingText.trim()) return;
    // Only update local state, backend edit not available
    setLocalStories(prev => prev.map(story =>
      story.id === currentStory.id
        ? {
          ...story,
          comments: story.comments?.map(c =>
            c.id === commentId ? { ...c, text: editingText.trim(), editedAt: new Date() } : c
          )
        }
        : story
    ));
    setEditingComment(null);
    setEditingText('');
  };

  const handleDeleteComment = async (commentId: string) => {
    Alert.alert(
      'Delete Comment',
      'Are you sure you want to delete this comment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Only update local state, backend delete not available
            setLocalStories(prev => prev.map(story =>
              story.id === currentStory.id
                ? {
                  ...story,
                  comments: story.comments?.filter(c => c.id !== commentId)
                }
                : story
            ));
          }
        }
      ]
    );
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setProgress(0);
      setImageLoading(true);
      setShowComments(false);
    }
  };

  const goToNext = () => {
    if (currentIndex < localStories.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setProgress(0);
      setImageLoading(true);
      setShowComments(false);
    } else {
      onClose();
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={getKeyboardOffset()}
      >
        {/* Progress Bars */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 8, gap: 2 }}>
          {localStories.map((_, index) => (
            <View
              key={index}
              style={{
                flex: 1,
                height: 3,
                backgroundColor: '#333',
                borderRadius: 1.5,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: '100%',
                  backgroundColor: '#fff',
                  width: index === currentIndex ? `${progress}%` : index < currentIndex ? '100%' : '0%',
                }}
              />
            </View>
          ))}
        </View>

        {/* Story Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'rgba(0,0,0,0.3)' }}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
            onPress={() => {
              onClose();
              if (currentStory.userId === currentUser?.uid) {
                router.push('/(tabs)/profile');
              } else {
                router.push({
                  pathname: '/user-profile',
                  params: { uid: currentStory.userId }
                });
              }
            }}
          >
            <Image
              source={{ uri: currentStory.userAvatar || DEFAULT_AVATAR_URL }}
              style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12, borderWidth: 2, borderColor: '#fff' }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{currentStory.userName}</Text>
              <Text style={{ color: '#ddd', fontSize: 12 }}>{relativeTime}</Text>
            </View>
          </TouchableOpacity>
          {(currentStory.videoUrl || currentStory.mediaType === 'video') && (
            <TouchableOpacity onPress={() => setIsMuted(m => !m)} style={{ marginRight: 12 }}>
              <Feather name={isMuted ? 'volume-x' : 'volume-2'} size={20} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setIsPaused(!isPaused)} style={{ marginRight: 12 }}>
            <Feather name={isPaused ? "play" : "pause"} size={20} color="#fff" />
          </TouchableOpacity>
          {currentUser?.uid === currentStory.userId && (
            <TouchableOpacity onPress={handleOpenHighlightModal} style={{ marginRight: 12 }}>
              <Feather name="bookmark" size={22} color="#fff" />
            </TouchableOpacity>
          )}
          {currentUser?.uid === currentStory.userId && (
            <TouchableOpacity onPress={async () => {
              Alert.alert(
                'Delete Story',
                'Are you sure you want to delete this story?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      const storyId = currentStory.id;
                      console.log('[StoriesViewer] Deleting story:', storyId);
                      const res = await deleteStory(storyId);
                      console.log('[StoriesViewer] Delete result:', res);
                      if (res.success) {
                        const updated = localStories.filter((_, idx) => idx !== currentIndex);
                        setLocalStories(updated);
                        if (updated.length === 0) onClose();
                        else if (currentIndex >= updated.length) setCurrentIndex(updated.length - 1);
                      } else {
                        Alert.alert('Error', 'Failed to delete story: ' + (res.error || 'Unknown error'));
                      }
                    }
                  }
                ]
              );
            }} style={{ marginRight: 12 }}>
              <Feather name="trash-2" size={22} color="#fff" />
            </TouchableOpacity>
          )}
          {currentUser?.uid !== currentStory.userId && (
            <TouchableOpacity
              onPress={async () => {
                if (!currentUser?.uid) return;
                try {
                  // TODO: Implement backend API to report story
                  // const response = await fetch('/api/reports', {
                  //   method: 'POST',
                  //   headers: { 'Content-Type': 'application/json' },
                  //   body: JSON.stringify({
                  //     type: 'story',
                  //     storyId: currentStory.id,
                  //     reportedUserId: currentStory.userId,
                  //     reportedBy: currentUser.uid
                  //   })
                  // });
                  if (Platform.OS === 'android') {
                    ToastAndroid.show('Story reported. Thanks!', ToastAndroid.SHORT);
                  } else {
                    Alert.alert('Reported', 'Thanks. We will review this story.');
                  }
                } catch (e) {
                  Alert.alert('Error', 'Failed to report. Try again later.');
                }
              }}
              style={{ marginRight: 12 }}
            >
              <Feather name="flag" size={22} color="#fff" />
            </TouchableOpacity>
          )}
          {currentUser?.uid !== currentStory.userId && (
            <TouchableOpacity
              onPress={async () => {
                if (!currentUser?.uid) return;
                Alert.alert('Block User', 'Hide stories from this user?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Block', style: 'destructive', onPress: async () => {
                      try {
                        // TODO: Implement backend API to block user
                        // const response = await fetch(`/api/users/${currentUser.uid}/blocked`, {
                        //   method: 'POST',
                        //   headers: { 'Content-Type': 'application/json' },
                        //   body: JSON.stringify({ blockedUserId: currentStory.userId })
                        // });
                        setLocalStories(prev => prev.filter(s => s.userId !== currentStory.userId));
                        setCurrentIndex(0);
                        if (Platform.OS === 'android') {
                          ToastAndroid.show('User blocked', ToastAndroid.SHORT);
                        } else {
                          Alert.alert('Blocked', 'You will no longer see their stories.');
                        }
                      } catch (e) {
                        Alert.alert('Error', 'Failed to block user.');
                      }
                    }
                  }
                ]);
              }}
              style={{ marginRight: 12 }}
            >
              <Feather name="slash" size={22} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Story Media with long-press to pause */}
        <Pressable
          onLongPress={() => setIsPaused(true)}
          onPressOut={() => setIsPaused(false)}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
            {imageLoading && <ActivityIndicator size="large" color="#fff" style={{ position: 'absolute', zIndex: 1 }} />}
            {(currentStory.videoUrl || currentStory.mediaType === 'video') ? (
              <Video
                ref={videoRef}
                source={{ uri: currentStory.videoUrl || currentStory.imageUrl }}
                style={{ width: width, height: height - 200 }}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={!isPaused && !showComments}
                isMuted={isMuted}
                isLooping={false}
                onLoadStart={() => setImageLoading(true)}
                onLoad={status => {
                  setImageLoading(false);
                  const isStatusObject = status !== null && typeof status === 'object';
                  if (isStatusObject && status.isLoaded && 'durationMillis' in status && typeof status.durationMillis === 'number') {
                    setVideoDuration(status.durationMillis);
                  }
                }}
                onError={() => setImageLoading(false)}
                onPlaybackStatusUpdate={(status: AVPlaybackStatus) => {
                  if (status.isLoaded && status.didJustFinish) {
                    goToNext();
                  }
                  // Pause progress if buffering/loading
                  if (!status.isLoaded || status.isBuffering) {
                    setImageLoading(true);
                  } else {
                    setImageLoading(false);
                  }
                }}
              />
            ) : (
              <Image
                source={{ uri: currentStory.imageUrl }}
                style={{ width: width, height: height - 200 }}
                resizeMode="contain"
                onLoadStart={() => setImageLoading(true)}
                onLoad={() => setImageLoading(false)}
                onError={() => setImageLoading(false)}
              />
            )}
          </View>
        </Pressable>

        {/* Action Buttons */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', gap: 20 }}>
          <TouchableOpacity onPress={handleLike} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
            <Ionicons name={isLiked ? "heart" : "heart-outline"} size={24} color={isLiked ? "#e74c3c" : "#222"} />
            <Text style={{ marginLeft: 6, fontWeight: '700', color: '#222', fontSize: 15 }}>{likesCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowComments(!showComments)} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 24 }}>
            <Feather name="message-circle" size={22} color="#222" />
            <Text style={{ marginLeft: 6, color: '#888', fontSize: 15 }}>{currentStory.comments?.length || 0}</Text>
          </TouchableOpacity>
        </View>

        {/* Comments Section as Modal */}
        <Modal visible={showComments} animationType="slide" transparent={true} onRequestClose={() => setShowComments(false)}>
          <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.18)' }}
                activeOpacity={1}
                onPress={() => setShowComments(false)}
              />
              <View
                {...commentPanResponder.panHandlers}
                style={{
                  backgroundColor: '#fff',
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  paddingTop: 18,
                  paddingHorizontal: 16,
                  height: '60%',
                  shadowColor: '#000',
                  shadowOpacity: 0.08,
                  shadowRadius: 8,
                  elevation: 8,
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <View style={{ alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ width: 40, height: 4, backgroundColor: '#eee', borderRadius: 2, marginBottom: 8 }} />
                  <Text style={{ fontWeight: '700', fontSize: 17, color: '#222' }}>Comments</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <FlatList
                    data={currentStory.comments || []}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => {
                      let avatarUrl = item.userAvatar || DEFAULT_AVATAR_URL;
                      if (currentUser && item.userId === currentUser.uid) {
                        if (latestAvatar && latestAvatar !== DEFAULT_AVATAR_URL && latestAvatar !== '') {
                          avatarUrl = latestAvatar;
                        } else if (currentUser.photoURL && currentUser.photoURL !== DEFAULT_AVATAR_URL && currentUser.photoURL !== '') {
                          avatarUrl = currentUser.photoURL;
                        } else if (item.userAvatar && item.userAvatar !== DEFAULT_AVATAR_URL) {
                          avatarUrl = item.userAvatar;
                        }
                      }
                      return (
                        <View style={{ marginBottom: 16 }}>
                          <View style={{ flexDirection: 'row', paddingHorizontal: 12, gap: 10 }}>
                            <Image
                              source={{ uri: avatarUrl }}
                              style={{ width: 32, height: 32, borderRadius: 16 }}
                            />
                            <View style={{ flex: 1 }}>
                              {editingComment === item.id ? (
                                <View>
                                  <TextInput
                                    style={{
                                      backgroundColor: '#f0f0f0',
                                      borderRadius: 8,
                                      padding: 8,
                                      fontSize: 14,
                                      color: '#222',
                                      marginBottom: 8,
                                      borderWidth: 1,
                                      borderColor: '#ddd'
                                    }}
                                    value={editingText}
                                    onChangeText={setEditingText}
                                    multiline
                                    autoFocus
                                  />
                                  <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <TouchableOpacity onPress={() => handleEditComment(item.id)}>
                                      <Text style={{ color: '#007aff', fontSize: 14, fontWeight: '600' }}>Save</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => { setEditingComment(null); setEditingText(''); }}>
                                      <Text style={{ color: '#666', fontSize: 14 }}>Cancel</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              ) : (
                                <View>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                    <Text style={{ color: '#222', fontWeight: '600', fontSize: 13, marginRight: 8 }}>{item.userName}</Text>
                                    <Text style={{ color: '#666', fontSize: 11 }}>
                                      {getTimeAgo(item.createdAt)}{item.editedAt ? ' â€¢ edited' : ''}
                                    </Text>
                                  </View>
                                  <Text style={{ color: '#333', fontSize: 14, lineHeight: 18, marginBottom: 8 }}>{item.text}</Text>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                                    <TouchableOpacity onPress={() => handleLikeComment(item.id)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                      <Ionicons
                                        name={likedComments[item.id] ? 'heart' : 'heart-outline'}
                                        size={16}
                                        color={likedComments[item.id] ? '#e74c3c' : '#666'}
                                      />
                                      {(commentLikesCount[item.id] || 0) > 0 && (
                                        <Text style={{ color: '#666', fontSize: 12, marginLeft: 4 }}>
                                          {commentLikesCount[item.id] || 0}
                                        </Text>
                                      )}
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setReplyToId(item.id)}>
                                      <Text style={{ color: '#007aff', fontSize: 13 }}>Reply</Text>
                                    </TouchableOpacity>
                                    {item.userId === currentUser?.uid && (
                                      <TouchableOpacity onPress={() => {
                                        Alert.alert(
                                          'Comment Options',
                                          '',
                                          [
                                            { text: 'Cancel', style: 'cancel' },
                                            {
                                              text: 'Edit',
                                              onPress: () => {
                                                setEditingComment(item.id);
                                                setEditingText(item.text);
                                              }
                                            },
                                            {
                                              text: 'Delete',
                                              style: 'destructive',
                                              onPress: () => handleDeleteComment(item.id)
                                            }
                                          ]
                                        );
                                      }}>
                                        <Ionicons name="ellipsis-horizontal" size={16} color="#666" />
                                      </TouchableOpacity>
                                    )}
                                  </View>
                                </View>
                              )}
                            </View>
                          </View>

                          {/* Replies */}
                          {item.replies && item.replies.length > 0 && (
                            <View style={{ marginLeft: 54, marginTop: 12 }}>
                              {item.replies.map((r) => {
                                let replyAvatar = r.userAvatar || DEFAULT_AVATAR_URL;
                                if (currentUser && r.userId === currentUser.uid) {
                                  if (latestAvatar && latestAvatar !== DEFAULT_AVATAR_URL && latestAvatar !== '') {
                                    replyAvatar = latestAvatar;
                                  } else if (currentUser.photoURL && currentUser.photoURL !== DEFAULT_AVATAR_URL && currentUser.photoURL !== '') {
                                    replyAvatar = currentUser.photoURL;
                                  } else if (r.userAvatar && r.userAvatar !== DEFAULT_AVATAR_URL) {
                                    replyAvatar = r.userAvatar;
                                  }
                                }
                                return (
                                  <View key={r.id} style={{ marginBottom: 8 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                      <Image source={{ uri: replyAvatar }} style={{ width: 24, height: 24, borderRadius: 12, marginRight: 8 }} />
                                      <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                                          <Text style={{ fontWeight: '600', color: '#222', fontSize: 13, marginRight: 6 }}>{r.userName}</Text>
                                          <Text style={{ color: '#666', fontSize: 11 }}>
                                            {getTimeAgo(r.createdAt)}
                                          </Text>
                                        </View>
                                        <Text style={{ color: '#222', fontSize: 13, lineHeight: 16, marginBottom: 4 }}>{r.text}</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                          <TouchableOpacity onPress={() => handleLikeComment(r.id)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Ionicons
                                              name={likedComments[r.id] ? 'heart' : 'heart-outline'}
                                              size={14}
                                              color={likedComments[r.id] ? '#e74c3c' : '#666'}
                                            />
                                            {(commentLikesCount[r.id] || 0) > 0 && (
                                              <Text style={{ color: '#666', fontSize: 11, marginLeft: 2 }}>
                                                {commentLikesCount[r.id] || 0}
                                              </Text>
                                            )}
                                          </TouchableOpacity>
                                          {r.userId === currentUser?.uid && (
                                            <TouchableOpacity onPress={() => {
                                              Alert.alert(
                                                'Reply Options',
                                                '',
                                                [
                                                  { text: 'Delete', style: 'destructive', onPress: () => handleDeleteComment(r.id) }
                                                ]
                                              );
                                            }}>
                                              <Ionicons name="ellipsis-horizontal" size={14} color="#666" />
                                            </TouchableOpacity>
                                          )}
                                        </View>
                                      </View>
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      );
                    }}
                    ListEmptyComponent={
                      <View style={{ padding: 20, alignItems: 'center' }}>
                        <Text style={{ color: '#888', fontSize: 14 }}>No comments yet</Text>
                      </View>
                    }
                  />
                </View>
                <View style={{ flexDirection: 'row', padding: 12, gap: 10, borderTopWidth: 1, borderTopColor: '#eee' }}>
                  <TextInput
                    value={replyToId ? replyText : commentText}
                    onChangeText={replyToId ? setReplyText : setCommentText}
                    placeholder={replyToId ? "Reply to comment..." : "Add a comment..."}
                    placeholderTextColor="#888"
                    style={{ flex: 1, color: '#222', fontSize: 14, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f5f5f5', borderRadius: 20 }}
                  />
                  <TouchableOpacity onPress={handleComment} disabled={replyToId ? !replyText.trim() : !commentText.trim()}>
                    <Feather name="send" size={24} color={(replyToId ? replyText.trim() : commentText.trim()) ? "#007aff" : "#888"} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Navigation */}
        {!showComments && (
          <View style={{ position: 'absolute', top: 100, left: 0, right: 0, bottom: 100, flexDirection: 'row' }}>
            <TouchableOpacity
              onPress={goToPrevious}
              style={{ flex: 1 }}
              activeOpacity={1}
            />
            <TouchableOpacity
              onPress={goToNext}
              style={{ flex: 1 }}
              activeOpacity={1}
            />
          </View>
        )}

        {isPaused && !showComments && (
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Paused</Text>
            </View>
          </View>
        )}

        {/* Highlight Selection Modal */}
        <Modal visible={showHighlightModal} animationType="slide" transparent onRequestClose={() => setShowHighlightModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => setShowHighlightModal(false)}
            />
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 20, maxHeight: height * 0.7 }}>
              {/* Handle bar */}
              <View style={{ width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />

              <Text style={{ fontSize: 20, fontWeight: '700', color: '#222', textAlign: 'center', marginBottom: 20 }}>
                Add to Highlight
              </Text>

              {loadingHighlights ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#0A3D62" />
                </View>
              ) : userHighlights.length === 0 ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <Feather name="bookmark" size={48} color="#ccc" />
                  <Text style={{ fontSize: 16, color: '#666', marginTop: 16, textAlign: 'center' }}>
                    No highlights yet
                  </Text>
                  <Text style={{ fontSize: 14, color: '#999', marginTop: 8, textAlign: 'center' }}>
                    Create a highlight from your profile
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={userHighlights}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => handleAddToHighlight(item.id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 12,
                        paddingHorizontal: 20,
                        borderBottomWidth: 1,
                        borderBottomColor: '#f0f0f0',
                      }}
                    >
                      <Image
                        source={{ uri: item.coverImage || DEFAULT_AVATAR_URL }}
                        style={{
                          width: 50,
                          height: 50,
                          borderRadius: 25,
                          marginRight: 14,
                          borderWidth: 2,
                          borderColor: '#0A3D62',
                        }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: '#222' }}>
                          {item.name}
                        </Text>
                        <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                          {item.storyIds?.length || 0} stories
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={20} color="#999" />
                    </TouchableOpacity>
                  )}
                  contentContainerStyle={{ paddingBottom: 20 }}
                />
              )}

              <TouchableOpacity
                onPress={() => setShowHighlightModal(false)}
                style={{
                  marginHorizontal: 20,
                  marginTop: 12,
                  padding: 16,
                  backgroundColor: '#f5f5f5',
                  borderRadius: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#666' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

