import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type Highlight = {
  id: string;
  title: string;
  coverImage: string;
  stories: Array<{ id: string; image: string; }>; // Minimal story type
};

interface HighlightCarouselProps {
  highlights: Highlight[];
  onPressHighlight?: (highlight: Highlight) => void;
  isOwnProfile?: boolean;
  onAddHighlight?: () => void;
}

const HighlightCarousel: React.FC<HighlightCarouselProps> = ({ highlights, onPressHighlight, isOwnProfile, onAddHighlight }) => {
  const renderAddButton = () => {
    if (!isOwnProfile) return null;
    return (
      <TouchableOpacity style={styles.highlightBubble} onPress={onAddHighlight}>
        <View style={styles.addButton}>
          <Ionicons name="add" size={24} color="#0A3D62" />
        </View>
        <Text style={styles.title} numberOfLines={1}>New</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={highlights}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.id}
        ListHeaderComponent={renderAddButton}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.highlightBubble} onPress={() => onPressHighlight?.(item)}>
            <Image source={{ uri: item.coverImage }} style={styles.coverImage} />
            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingHorizontal: 12 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  highlightBubble: {
    alignItems: 'center',
    marginRight: 12,
    width: 65,
  },
  coverImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#0A3D62',
    marginBottom: 4,
    backgroundColor: '#f0f0f0',
  },
  addButton: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#0A3D62',
    borderStyle: 'dashed',
    marginBottom: 4,
    backgroundColor: '#fff8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 11,
    color: '#333',
    textAlign: 'center',
    maxWidth: 60,
  },
});

export default HighlightCarousel;

