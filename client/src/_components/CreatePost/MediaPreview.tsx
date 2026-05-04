import React from 'react';
import { View, Image, Dimensions, ScrollView } from 'react-native';
import { Video, ResizeMode } from 'expo-av';

const { width: windowWidth } = Dimensions.get('window');

interface MediaPreviewProps {
  uris: string[];
  thumbnails: Record<string, string>;
  isVideo: (uri: string) => boolean;
  height: number;
}

const MediaPreview: React.FC<MediaPreviewProps> = ({ uris, thumbnails, isVideo, height }) => {
  if (uris.length === 0) return null;

  return (
    <View style={{ height, width: windowWidth, backgroundColor: '#f0f0f0' }}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
        {uris.map((uri, index) => (
          <View key={uri} style={{ width: windowWidth, height }}>
            {isVideo(uri) ? (
              <Video
                source={{ uri }}
                style={{ flex: 1 }}
                useNativeControls
                resizeMode={ResizeMode.COVER}
                isLooping
                shouldPlay={index === 0}
                posterSource={thumbnails[uri] ? { uri: thumbnails[uri] } : undefined}
                usePoster={!!thumbnails[uri]}
              />
            ) : (
              <Image
                source={{ uri }}
                style={{ flex: 1 }}
                resizeMode="cover"
              />
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

export default MediaPreview;
