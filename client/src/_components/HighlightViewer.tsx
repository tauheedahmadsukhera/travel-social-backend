import React, { useEffect, useState } from 'react';
import { Dimensions, Image, Modal, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getHighlightStories } from '../../lib/firebaseHelpers/index';
import { removeStoryFromHighlight } from '../../lib/firebaseHelpers/highlights';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface HighlightViewerProps {
  visible: boolean;
  highlightId: string | null;
  onClose: () => void;
  userId?: string;
}

interface Story {
  id?: string;
  _id?: string;
  imageUrl?: string;
  videoUrl?: string;
}

const HighlightViewer: React.FC<HighlightViewerProps> = ({ visible, highlightId, onClose, userId }) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (highlightId && visible) {
      setLoading(true);
      getHighlightStories(highlightId).then(res => {
        if (res?.success) {
          const storyArray = Array.isArray(res.stories) ? res.stories : (res.data || []);
          setStories(storyArray);
        } else if (res?.stories) {
          setStories(Array.isArray(res.stories) ? res.stories : []);
        } else {
          setStories([]);
        }
        setLoading(false);
        setCurrentIndex(0);
      });
    }
  }, [highlightId, visible]);

  const handleNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleDeleteStory = async () => {
    if (!highlightId || !stories[currentIndex]) return;

    Alert.alert(
      'Delete Story',
      'Remove this story from highlight?',
      [
        { text: 'Cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            setDeleting(true);
            try {
              const storyId = stories[currentIndex].id || stories[currentIndex]._id;
              const result = await removeStoryFromHighlight(highlightId, storyId);
              
              if (result.success || result.data) {
                // Remove from local state
                const newStories = stories.filter((_, idx) => idx !== currentIndex);
                setStories(newStories);
                
                if (newStories.length === 0) {
                  onClose();
                } else if (currentIndex >= newStories.length) {
                  setCurrentIndex(newStories.length - 1);
                }
              } else {
                Alert.alert('Error', 'Failed to delete story');
              }
            } catch (error: any) {
              Alert.alert('Error', 'Failed to delete story: ' + error.message);
            } finally {
              setDeleting(false);
            }
          },
          style: 'destructive'
        }
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={deleting}>
          <Ionicons name="close-circle" size={32} color="#fff" />
        </TouchableOpacity>
        {loading ? (
          <ActivityIndicator size="large" color="#fff" />
        ) : stories.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="image-outline" size={48} color="#999" />
            <Text style={styles.loadingText}>No stories in this highlight</Text>
          </View>
        ) : (
          <View style={styles.storyContainer}>
            <Image
              source={{ uri: stories[currentIndex].imageUrl || stories[currentIndex].videoUrl }}
              style={styles.storyImage}
              resizeMode="cover"
            />
            
            {/* Progress bar */}
            <View style={styles.progressBarContainer}>
              {stories.map((_, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.progressBar,
                    idx < currentIndex ? styles.progressBarActive : idx === currentIndex ? styles.progressBarCurrent : null
                  ]}
                />
              ))}
            </View>
            
            {/* Top Info */}
            <View style={styles.topInfo}>
              <Text style={styles.storyCounter}>
                {currentIndex + 1} / {stories.length}
              </Text>
              {userId && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={handleDeleteStory}
                  disabled={deleting}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="trash-outline" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              )}
            </View>
            
            {/* Navigation */}
            <View style={styles.navContainer}>
              <TouchableOpacity
                style={[styles.navBtn, styles.navBtnLeft]}
                onPress={handlePrev}
                disabled={currentIndex === 0}
              >
                <Ionicons name="chevron-back" size={28} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.navBtn, styles.navBtnRight]}
                onPress={handleNext}
              >
                <Ionicons name="chevron-forward" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.98)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 40,
    right: 24,
    zIndex: 10,
    padding: 8,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  storyContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000',
  },
  progressBarContainer: {
    flexDirection: 'row',
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 3,
    zIndex: 5,
  },
  progressBar: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
  },
  progressBarActive: {
    backgroundColor: 'rgba(255,255,255,1)',
  },
  progressBarCurrent: {
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  topInfo: {
    position: 'absolute',
    top: 90,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 5,
  },
  storyCounter: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  deleteBtn: {
    backgroundColor: 'rgba(255,59,48,0.7)',
    padding: 8,
    borderRadius: 20,
  },
  navContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    zIndex: 3,
  },
  navBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBtnLeft: {
    alignItems: 'flex-start',
  },
  navBtnRight: {
    alignItems: 'flex-end',
  },
});

export default HighlightViewer;
