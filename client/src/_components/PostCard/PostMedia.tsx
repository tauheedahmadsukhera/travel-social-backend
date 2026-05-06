import React, { useEffect } from 'react';
import { View, FlatList, TouchableOpacity, Dimensions, NativeSyntheticEvent, NativeScrollEvent, Text } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from '@react-navigation/native';
import { styles } from './PostCard.styles';
import { BACKEND_URL } from '../../../lib/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── INSTAGRAM ASPECT RATIO LOGIC ───────────────────────────────────────────
// This is the SINGLE source of truth for ratio calculation.
// Instagram clamps all media between 4:5 (portrait) and 1.91:1 (landscape).
// The container height EXACTLY matches this ratio, so NO black bars appear.
export const getDisplayRatio = (aspectRatio?: number): number => {
  const ratio = aspectRatio || 1; // fallback to square
  // Support from 9:16 (vertical) to 2:1 (wide cinematic)
  return Math.max(0.56, Math.min(ratio, 2.0));
};

export const getMediaHeight = (aspectRatio?: number): number => {
  return SCREEN_WIDTH / getDisplayRatio(aspectRatio);
};
// ────────────────────────────────────────────────────────────────────────────

interface MediaItem {
  url: string;
  type?: 'image' | 'video' | string;
  field?: string;
  aspectRatio?: number;
}

interface PostMediaProps {
  media: MediaItem[];
  mediaHeight?: number;
  activeIndex: number;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onMediaPress: (index: number) => void;
  onDoubleTap?: () => void;
  isMuted: boolean;
  toggleMute: () => void;
  videoRef: React.RefObject<Video>;
}

const PostMedia: React.FC<PostMediaProps> = ({
  media,
  mediaHeight,
  activeIndex,
  onScroll,
  onMediaPress,
  isMuted,
  toggleMute,
  videoRef,
  onDoubleTap,
}) => {
  const isFocused = useIsFocused();
  const [isPlaying, setIsPlaying] = React.useState(true);
  const lastTap = React.useRef<number>(0);
  const flatListRef = React.useRef<FlatList>(null);
  const [isInitialScrollDone, setIsInitialScrollDone] = React.useState(false);
  const [localActiveIndex, setLocalActiveIndex] = React.useState(0);

  // Auto-pause when screen loses focus (switching tabs)
  useEffect(() => {
    if (!isFocused) {
      setIsPlaying(false);
    }
  }, [isFocused]);

  const handlePress = (index: number, isVideo: boolean = false) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (lastTap.current && (now - lastTap.current) < DOUBLE_TAP_DELAY) {
      onDoubleTap?.();
    } else if (!isVideo) {
      onMediaPress(index);
    }
    lastTap.current = now;
  };

  const getMediaUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('file:')) {
      // Force high quality for Cloudinary
      if (url.includes('cloudinary.com') && url.includes('/upload/') && !url.includes('/q_')) {
        return url.replace('/upload/', '/upload/q_auto:best,f_auto/');
      }
      return url;
    }
    const baseUrl = BACKEND_URL.endsWith('/') ? BACKEND_URL.slice(0, -1) : BACKEND_URL;
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${baseUrl}${path}`;
  };

  // ─── RENDER ITEM FOR CAROUSEL ────────────────────────────────────────────
  const renderItem = ({ item, index }: { item: MediaItem; index: number }) => {
    const isVideo = item.type === 'video'
      || item.url?.toLowerCase().includes('.mp4')
      || item.url?.toLowerCase().includes('.mov')
      || item.url?.includes('video/upload');

    // Each item in the carousel uses the FIRST media's ratio for consistent height
    const containerHeight = mediaHeight || getMediaHeight(media[0]?.aspectRatio);
    const mediaUri = getMediaUrl(item.url);

    if (isVideo) {
      // Auto-play logic: play if it's the active index and screen is focused
      const shouldAutoPlay = isFocused && index === localActiveIndex;

      return (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {
            setIsPlaying(prev => !prev);
            handlePress(index, true);
          }}
          style={{ width: SCREEN_WIDTH, height: containerHeight }}
        >
          <Video
            ref={videoRef}
            source={{ uri: mediaUri }}
            style={{ width: SCREEN_WIDTH, height: containerHeight }}
            resizeMode={ResizeMode.COVER}
            isLooping
            shouldPlay={shouldAutoPlay && isPlaying}
            isMuted={isMuted}
            useNativeControls={false}
            progressUpdateIntervalMillis={500}
            onPlaybackStatusUpdate={(status: any) => {
              if (status.isLoaded && status.isPlaying !== isPlaying && shouldAutoPlay) {
                // Keep local state in sync if needed
              }
            }}
          />
          {/* Mute/Play Overlay */}
          <View style={styles.videoOverlay} pointerEvents="box-none">
            {!isPlaying && (
               <View style={{ position: 'absolute', alignSelf: 'center', top: '45%' }}>
                 <Ionicons name="play" size={50} color="rgba(255,255,255,0.8)" />
               </View>
            )}
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.muteButtonMini}
              onPress={() => toggleMute()}
            >
              <Ionicons
                name={isMuted ? "volume-mute" : "volume-high"}
                size={16}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    }

    // Image item
    return (
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={() => handlePress(index)}
        style={{ width: SCREEN_WIDTH, height: containerHeight }}
      >
        <ExpoImage
          source={{ uri: mediaUri }}
          style={{ width: SCREEN_WIDTH, height: containerHeight }}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority={index === 0 ? "high" : "normal"}
          recyclingKey={item.url}
          transition={0}
        />
      </TouchableOpacity>
    );
  };
  // ─────────────────────────────────────────────────────────────────────────

  // 3-set infinite scroll trick
  const loopedMedia = React.useMemo(() => {
    if (media.length <= 1) return media;
    return [...media, ...media, ...media];
  }, [media]);

  // Jump to middle set on mount (silent, no visible jump)
  useEffect(() => {
    if (media.length > 1 && flatListRef.current && !isInitialScrollDone) {
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({
          offset: media.length * SCREEN_WIDTH,
          animated: false,
        });
        setIsInitialScrollDone(true);
      }, 50);
    }
  }, [media.length, isInitialScrollDone]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    const totalContentWidth = media.length * SCREEN_WIDTH;

    // Silent jump for infinite scroll
    if (media.length > 1) {
      if (x >= totalContentWidth * 2) {
        flatListRef.current?.scrollToOffset({ offset: x - totalContentWidth, animated: false });
      } else if (x <= totalContentWidth / 2 && x > 0) {
        flatListRef.current?.scrollToOffset({ offset: x + totalContentWidth, animated: false });
      }
    }

    const index = Math.round((x % totalContentWidth) / SCREEN_WIDTH) % media.length;
    if (index !== localActiveIndex) {
      setLocalActiveIndex(index);
    }
    onScroll(event);
  };

  const [detectedRatio, setDetectedRatio] = React.useState<number | null>(null);
  const firstItem = media[0];
  
  // Use detected ratio if available, otherwise fallback to item ratio, then square
  const displayRatio = getDisplayRatio(detectedRatio || firstItem?.aspectRatio);
  const displayHeight = mediaHeight || (SCREEN_WIDTH / displayRatio);

  if (media.length === 1) {
    const item = firstItem;
    const isVideo = item.type === 'video'
      || item.url?.toLowerCase().includes('.mp4')
      || item.url?.toLowerCase().includes('.mov')
      || item.url?.includes('video/upload');
    const mediaUri = getMediaUrl(item.url);

    if (isVideo) {
      return (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setIsPlaying(prev => !prev)}
          style={{ width: SCREEN_WIDTH, height: displayHeight, backgroundColor: '#000' }}
        >
          <Video
            ref={videoRef}
            source={{ uri: mediaUri }}
            style={{ width: SCREEN_WIDTH, height: displayHeight }}
            resizeMode={ResizeMode.CONTAIN}
            isLooping
            shouldPlay={isFocused && isPlaying}
            isMuted={isMuted}
            useNativeControls={false}
            onPlaybackStatusUpdate={(status: any) => {
              if (status.isLoaded) {
                if (status.isPlaying !== isPlaying) {
                  setIsPlaying(status.isPlaying);
                }
                // FALLBACK: Detect original size if not provided by backend
                if (!detectedRatio && status.naturalSize && status.naturalSize.height > 0) {
                   const ratio = status.naturalSize.width / status.naturalSize.height;
                   setDetectedRatio(ratio);
                }
              }
            }}
          />
          {/* Mute Button */}
          <View style={styles.videoOverlay} pointerEvents="box-none">
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.muteButtonMini}
              onPress={() => toggleMute()}
            >
              <Ionicons
                name={isMuted ? "volume-mute" : "volume-high"}
                size={16}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    }

    // Single image
    return (
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={() => handlePress(0)}
        style={{ width: SCREEN_WIDTH, height: displayHeight }}
      >
        <ExpoImage
          source={{ uri: mediaUri }}
          style={{ width: SCREEN_WIDTH, height: displayHeight }}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="high"
          recyclingKey={item.url}
          transition={0}
        />
      </TouchableOpacity>
    );
  }

  // ─── MULTIPLE MEDIA CAROUSEL ──────────────────────────────────────────────
  return (
    <View style={{ width: SCREEN_WIDTH, height: displayHeight }}>
      <FlatList
        ref={flatListRef}
        data={loopedMedia}
        renderItem={renderItem}
        horizontal
        pagingEnabled={false}
        decelerationRate="normal"
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyExtractor={(item, index) => `${item.url || index}-${index}`}
        initialNumToRender={3}
        windowSize={5}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />
      {/* Image counter badge */}
      <View style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        zIndex: 10,
      }}>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
          {localActiveIndex + 1}/{media.length}
        </Text>
      </View>
    </View>
  );
};

export default React.memo(PostMedia);
