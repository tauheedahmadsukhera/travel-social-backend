import React from 'react';
import { TouchableOpacity, View, StyleSheet, Dimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { hapticLight } from '@/lib/haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ProfileGridItemProps {
  item: any;
  index: number;
  onPress: (item: any, index: number) => void;
  normalizeMediaUrl: (url: string) => string;
  isVideoUrl: (url: string) => boolean;
  DEFAULT_IMAGE_URL: string;
}

const ProfileGridItem: React.FC<ProfileGridItemProps> = ({
  item,
  index,
  onPress,
  normalizeMediaUrl,
  isVideoUrl,
  DEFAULT_IMAGE_URL
}) => {
  const rawMedia = [
    item?.mediaUrls,
    item?.media,
    item?.imageUrls,
    item?.videoUrls,
    item?.images,
    item?.videos
  ].find(arr => Array.isArray(arr) && arr.length > 0);

  const singleUrl = item?.imageUrl || item?.url || item?.mediaUrl || item?.videoUrl || item?.image || item?.video || (typeof item?.media === 'string' ? item.media : null);
  
  let firstMedia = '';
  if (Array.isArray(rawMedia) && rawMedia.length > 0) {
    const first = rawMedia[0];
    firstMedia = typeof first === 'string' ? first : (first?.url || first?.uri || first?.secure_url || '');
  } else if (typeof singleUrl === 'string') {
    firstMedia = singleUrl;
  }

  const normalizedFirstMedia = normalizeMediaUrl(firstMedia);
  const isVideo = isVideoUrl(normalizedFirstMedia) || item.postType === 'video' || item.mediaType === 'video' || !!item.videoUrl;
  const thumbnailUrl = normalizeMediaUrl(item.thumbnailUrl || item.imageUrl || firstMedia);
  const hasThumbnailImage = !!thumbnailUrl && !isVideoUrl(thumbnailUrl);

  return (
    <TouchableOpacity
      style={styles.gridItem}
      activeOpacity={0.8}
      onPress={() => {
        hapticLight();
        onPress(item, index);
      }}
    >
      {isVideo && !hasThumbnailImage ? (
        <View style={styles.videoContainer}>
          <Video
            source={{ uri: normalizedFirstMedia }}
            style={styles.video}
            resizeMode={ResizeMode.COVER}
            shouldPlay={false}
            isMuted={true}
            useNativeControls={false}
          />
          <View style={styles.playIconOverlay}>
            <Ionicons name="play" size={24} color="rgba(255,255,255,0.6)" />
          </View>
        </View>
      ) : (
        <ExpoImage
          source={{ uri: hasThumbnailImage ? thumbnailUrl : (isVideo ? '' : (normalizedFirstMedia || DEFAULT_IMAGE_URL)) }}
          style={styles.image}
          contentFit="cover"
          transition={0}
        />
      )}
      {isVideo && hasThumbnailImage && (
        <View style={styles.playIconSmall}>
          <Ionicons name="play" size={14} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  gridItem: {
    width: SCREEN_WIDTH / 3,
    aspectRatio: 1,
    padding: 1,
  },
  videoContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  playIconOverlay: {
    zIndex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: '#eee',
  },
  playIconSmall: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 4,
    borderRadius: 12,
  }
});

export default React.memo(ProfileGridItem);
