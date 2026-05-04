import React from 'react';
import { View, TouchableOpacity, Image, Text, Dimensions, FlatList } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GalleryAsset, isVideoUri } from '../../../hooks/useCreatePost';

const { width } = Dimensions.get('window');
const GRID_ITEM_SIZE = width / 3;

interface MediaPickerProps {
  assets: GalleryAsset[];
  selectedImages: string[];
  onSelect: (uri: string) => void;
  onCamera: () => void;
  onLoadMore: () => void;
  loading: boolean;
}

const MediaPicker: React.FC<MediaPickerProps> = ({ assets, selectedImages, onSelect, onCamera, onLoadMore, loading }) => {
  const renderItem = ({ item }: { item: GalleryAsset }) => {
    const isSelected = selectedImages.includes(item.uri);
    const index = selectedImages.indexOf(item.uri);

    return (
      <TouchableOpacity
        onPress={() => onSelect(item.uri)}
        style={{ width: GRID_ITEM_SIZE, height: GRID_ITEM_SIZE, padding: 1 }}
      >
        <Image source={{ uri: item.uri }} style={{ flex: 1 }} />
        {item.mediaType === 'video' && (
          <View style={{ position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2, flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="video" size={10} color="#fff" />
            {typeof item.duration === 'number' && (
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600', marginLeft: 3 }}>
                {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, '0')}
              </Text>
            )}
          </View>
        )}
        {isSelected && (
          <View style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: '#0095f6', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{index + 1}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 0.5, borderBottomColor: '#efefef' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold' }}>Recent</Text>
        <TouchableOpacity onPress={onCamera} style={{ backgroundColor: '#f0f0f0', padding: 8, borderRadius: 20 }}>
          <Feather name="camera" size={20} color="#000" />
        </TouchableOpacity>
      </View>
      <FlatList
        data={assets}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={3}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loading ? <View style={{ padding: 20 }}><Text>Loading...</Text></View> : null}
      />
    </View>
  );
};

export default MediaPicker;
