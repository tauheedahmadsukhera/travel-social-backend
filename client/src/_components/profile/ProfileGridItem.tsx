import React from 'react';
import { TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getVideoThumbnailUrl } from '../../../lib/imageHelpers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_SIZE = SCREEN_WIDTH / 3;

interface ProfileGridItemProps {
  item: any;
  index: number;
  onPress: (item: any, index: number) => void;
  normalizeMediaUrl: (url: string) => string;
  isVideoUrl: (url: string) => boolean;
  DEFAULT_IMAGE_URL: string;
}

export const ProfileGridItem = React.memo(({
  item,
  index,
  onPress,
  normalizeMediaUrl,
  isVideoUrl,
  DEFAULT_IMAGE_URL
}: ProfileGridItemProps) => {
  const isVideo = item.mediaType === 'video' || isVideoUrl(item.imageUrl || item.mediaUrl);
  const mediaUrl = item.thumbnailUrl || 
                   (isVideo ? getVideoThumbnailUrl(item.imageUrl || item.mediaUrl || '') : (item.imageUrl || (Array.isArray(item.mediaUrls) && item.mediaUrls[0]) || (Array.isArray(item.imageUrls) && item.imageUrls[0]))) || 
                   '';
  
  const normalizedUrl = normalizeMediaUrl(mediaUrl) || DEFAULT_IMAGE_URL;

  return (
    <TouchableOpacity
      style={styles.gridItem}
      onPress={() => onPress(item, index)}
      activeOpacity={0.8}
    >
      <ExpoImage
        source={{ uri: normalizedUrl }}
        style={styles.gridImage}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
      />
      {isVideo && (
        <Ionicons
          name="play-circle-outline"
          size={24}
          color="#fff"
          style={styles.videoIcon}
        />
      )}
      {(Array.isArray(item.imageUrls) && item.imageUrls.length > 1) || 
       (Array.isArray(item.mediaUrls) && item.mediaUrls.length > 1) ? (
        <Ionicons
          name="copy-outline"
          size={18}
          color="#fff"
          style={styles.multiIcon}
        />
      ) : null}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  gridItem: {
    width: GRID_SIZE,
    height: GRID_SIZE,
    borderWidth: 0.5,
    borderColor: '#fff',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  videoIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  multiIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
});
