import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PostCard from '@/src/_components/PostCard';
import NotificationsModal from '@/src/_components/NotificationsModal';
import StoriesViewer from '@/src/_components/StoriesViewer';
import VerifiedBadge from '@/src/_components/VerifiedBadge';
import { apiService } from '@/src/_services/apiService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { feedEventEmitter } from '../../lib/feedEventEmitter';


const { width } = Dimensions.get('window');
const DEFAULT_AVATAR_URL = 'https://via.placeholder.com/200x200.png?text=Profile';

type Post = {
  id: string;
  _id?: string;
  userId: string;
  userName: string;
  userAvatar: string;
  imageUrl: string;
  imageUrls?: string[];
  videoUrl?: string;
  mediaType?: 'image' | 'video';
  caption: string;
  locationName?: string;
  location?: string | { name?: string };
  locationData?: {
    name?: string;
    address?: string;
    lat?: number;
    lon?: number;
    verified?: boolean;
    city?: string;
    country?: string;
    countryCode?: string;
    placeId?: string;
  };
  likes: string[];
  likesCount: number;
  commentsCount: number;
  createdAt: any;
};

type Story = {
  id: string;
  _id?: string;
  userId: string;
  userName: string;
  userAvatar: string;
  imageUrl: string;
  videoUrl?: string;
  mediaType?: 'image' | 'video';
  createdAt: any;
  location?: string | { name?: string };
  locationData?: {
    name?: string;
    address?: string;
  };
  views?: string[];
  likes?: string[];
  comments?: any[];
};

type SubLocation = {
  name: string;
  count: number;
  thumbnail: string;
  posts: Post[];
};

export default function LocationDetailsScreen() {
  const { placeId, locationName, locationAddress } = useLocalSearchParams();
  const router = useRouter();
  const [placeDetails, setPlaceDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stories, setStories] = useState<Story[]>([]);
  const [subLocations, setSubLocations] = useState<SubLocation[]>([]);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<Post[]>([]);
  const [selectedSubLocation, setSelectedSubLocation] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [totalVisits, setTotalVisits] = useState(0);
  const [verifiedVisits, setVerifiedVisits] = useState(0);
  const [mostLikedPostImage, setMostLikedPostImage] = useState<string>('');
  const [showStoriesViewer, setShowStoriesViewer] = useState(false);
  const [selectedStories, setSelectedStories] = useState<Story[]>([]);
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>('https://res.cloudinary.com/dinwxxnzm/image/upload/v1766418070/logo/logo.png');

  const onStoryPress = (stories: Story[], initialIndex: number) => {
    setSelectedStories(stories);
    setShowStoriesViewer(true);
  };

  // Load current user when component mounts
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        if (userId) {
          setCurrentUser({ uid: userId, id: userId });
          console.log('[Location] Current user loaded:', userId);
        }
      } catch (error) {
        console.log('[Location] Failed to load current user:', error);
      }
    };
    loadCurrentUser();
  }, []);

  // Listen for feed updates (like post deletion)
  useEffect(() => {
    const unsub = feedEventEmitter.onFeedUpdate((event) => {
      if (event.type === 'POST_DELETED' && event.postId) {
        console.log('[Location] Post deleted event received:', event.postId);
        setAllPosts(prev => prev.filter(p => (p.id || p._id) !== event.postId));
        setFilteredPosts(prev => prev.filter(p => (p.id || p._id) !== event.postId));
      }
    });
    return unsub;
  }, []);


  useEffect(() => {
    async function fetchDetails() {
      setLoading(true);
      try {
        // Use the location data passed from navigation params
        // This avoids CORS issues with Google Places Details API
        const placeDetails = {
          name: locationName as string,
          formatted_address: locationAddress as string || locationName as string,
        };
        setPlaceDetails(placeDetails);

        // Fetch posts from Firebase that match this location
        await fetchLocationPosts(locationName as string);

        // Fetch stories from Firebase that match this location
        await fetchLocationStories(locationName as string);
      } catch (e) {
        console.error('Error fetching location details:', e);
        setPlaceDetails(null);
      }
      setLoading(false);
    }
    if (locationName) fetchDetails();
  }, [placeId, locationName, locationAddress]);

  const extractSubLocationName = (locationName: string, locationAddress: string): string => {
    // Extract city/area name from location
    // If locationName is already a city (short name), use it
    // Otherwise, extract from address

    if (locationName && locationName.length < 30 && !locationName.includes(',')) {
      return locationName;
    }

    // Try to extract city from address
    const addressParts = locationAddress.split(',').map(p => p.trim());
    if (addressParts.length > 0) {
      // Return first part (usually city)
      return addressParts[0];
    }

    return locationName;
  };

  const fetchLocationPosts = async (searchLocationName: string) => {
    try {
      const viewerId = await AsyncStorage.getItem('userId');

      let metaHasVerifiedVisits = false;

      const all: any[] = [];
      const pageSize = 50;
      const maxPages = 5;

      for (let page = 0; page < maxPages; page++) {
        const skip = page * pageSize;
        const response = await apiService.getPostsByLocation(searchLocationName, skip, pageSize, viewerId || undefined);
        const next = response?.success && Array.isArray(response?.data) ? response.data : [];
        all.push(...next);
        if (next.length < pageSize) break;
      }

      // Normalize posts to ensure they have an 'id' field
      const locationPosts = all.map((post: any) => ({
        ...post,
        id: post.id || post._id,
      }));

      console.log(`[Location] Found ${locationPosts.length} posts for "${searchLocationName}"`);

      setAllPosts(locationPosts);
      setFilteredPosts(locationPosts);

      try {
        const metaRes = await apiService.getLocationMeta(searchLocationName, viewerId || undefined);
        const meta = metaRes?.success ? metaRes?.data : null;
        if (meta && typeof meta === 'object') {
          if (typeof meta.visits === 'number') setTotalVisits(meta.visits);
          else if (typeof meta.postCount === 'number') setTotalVisits(meta.postCount);
          if (typeof meta.verifiedVisits === 'number') {
            metaHasVerifiedVisits = true;
            setVerifiedVisits(meta.verifiedVisits);
          }
        } else {
          setTotalVisits(locationPosts.length);
        }
      } catch {
        setTotalVisits(locationPosts.length);
      }

      // Extract sub-locations from posts
      const subLocationMap = new Map<string, any[]>();
      locationPosts.forEach((post: Post) => {
        const locStr =
          post?.locationData?.name ||
          post?.locationName ||
          (typeof post?.location === 'string' ? post.location : post?.location?.name) ||
          '';
        const subLocName = extractSubLocationName(
          locStr,
          post?.locationData?.address || ''
        );
        if (!subLocationMap.has(subLocName)) {
          subLocationMap.set(subLocName, []);
        }
        subLocationMap.get(subLocName)?.push(post);
      });

      const subLocations = Array.from(subLocationMap.entries()).map(([name, posts]) => ({
        name,
        count: posts.length,
        thumbnail: posts[0]?.imageUrl || 'https://via.placeholder.com/60',
        posts
      }));

      setSubLocations(subLocations);

      // Count verified visits (if meta not available)
      if (!metaHasVerifiedVisits) {
        const verifiedCount = locationPosts.filter((p: any) => p?.locationData?.verified).length;
        setVerifiedVisits(verifiedCount);
      }

      // Set most liked post image for header
      if (locationPosts.length > 0) {
        const mostLiked = locationPosts.reduce((prev: any, curr: any) =>
          (curr.likesCount || 0) > (prev.likesCount || 0) ? curr : prev
        );
        if (mostLiked?.imageUrl) {
          setMostLikedPostImage(mostLiked.imageUrl);
        }
      }
    } catch (error) {
      console.error('Error fetching location posts:', error);
      setAllPosts([]);
      setFilteredPosts([]);
    }
  };

  const fetchLocationStories = async (searchLocationName: string) => {
    try {
      // Fetch stories from AsyncStorage or backend if available
      // For now, we'll attempt to fetch from a stories endpoint if it exists
      const response = await apiService.get('/stories?skip=0&limit=100');

      if (response.success && response.data) {
        // Normalize stories to ensure they have an 'id' field
        const normalizedStories = response.data.map((story: any) => ({
          ...story,
          id: story.id || story._id,
        }));

        const locationStories = normalizedStories.filter((story: any) => {
          const storyLocation =
            story?.locationData?.name ||
            story?.location ||
            '';

          return storyLocation.toLowerCase().includes(searchLocationName.toLowerCase());
        });

        console.log(`[Location] Found ${locationStories.length} stories for "${searchLocationName}"`);
        setStories(locationStories);
      } else {
        setStories([]);
      }
    } catch (error) {
      console.log('Stories endpoint not available or no stories:', error);
      setStories([]);
    }
  };

  const handleSubLocationFilter = (subLocationName: string) => {
    if (selectedSubLocation === subLocationName) {
      // Deselect - show all posts
      setSelectedSubLocation(null);
      setFilteredPosts(allPosts);
    } else {
      // Select - filter posts
      setSelectedSubLocation(subLocationName);
      const subLocation = subLocations.find(sl => sl.name === subLocationName);
      if (subLocation) {
        setFilteredPosts(subLocation.posts);
      }
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#0A3D62" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!placeDetails) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <Text style={{ margin: 24, fontSize: 16, color: '#666' }}>No details found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { justifyContent: 'space-between' }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}
        >
          <View style={{ position: 'relative', height: 32, justifyContent: 'center', minWidth: 120 }}>
            {/* Base Text Logo - Always visible immediately */}
            <Text style={{
              fontSize: 18,
              fontWeight: '900',
              color: '#0A3D62',
              letterSpacing: -0.5
            }}>
              Trave<Text style={{ color: '#667eea' }}>Social</Text>
            </Text>

            {/* Branding Image - Loads on top if available */}
            <Image
              source={{ uri: logoUrl || 'https://res.cloudinary.com/dinwxxnzm/image/upload/v1766418070/logo/logo.png' }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'transparent'
              }}
              resizeMode="contain"
            />
          </View>
        </TouchableOpacity>
        <View style={styles.headerRightIcons}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/passport' as any)}>
            <Feather name="briefcase" size={20} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/inbox' as any)}>
            <Feather name="message-square" size={20} color="#000" />
            <View style={styles.badge} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => setNotificationsModalVisible(true)}>
            <Feather name="bell" size={20} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={filteredPosts}
        keyExtractor={(item) => item.id || item._id || `post - ${Math.random()}`}
        ListHeaderComponent={
          <>
            {/* Location Header Card */}
            <View style={styles.locationHeaderCard}>
              <Image
                source={{ uri: mostLikedPostImage || 'https://via.placeholder.com/80' }}
                style={styles.locationImage}
              />
              <View style={styles.locationTextContainer}>
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={16} color="#000" />
                  <Text style={styles.locationNameText} numberOfLines={1}>
                    {placeDetails.name}
                  </Text>
                </View>
                <View style={[styles.locationRow, { marginTop: 4 }]}>
                  <Ionicons name="people-outline" size={16} color="#000" />
                  <Text style={styles.visitsText}>{totalVisits} Visits</Text>
                </View>
                {verifiedVisits > 0 && (
                  <View style={[styles.locationRow, { marginTop: 4 }]}>
                    <VerifiedBadge size={15} color="#000" />
                    <Text style={styles.verifiedText}>{verifiedVisits} Verified visits</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Stories/People Section */}
            {stories.length > 0 && (
              <View style={styles.storiesSection}>
                <Text style={styles.sectionTitle}>STORIES</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.storiesScroll}
                >
                  {stories.map((story, index) => (
                    <TouchableOpacity
                      key={story.id || story._id || `story - ${index} `}
                      style={styles.storyCard}
                      onPress={() => onStoryPress && onStoryPress(stories, index)}
                    >
                      <Image
                        source={{ uri: story.imageUrl || story.userAvatar }}
                        style={styles.storyAvatar}
                      />
                      <Text style={styles.storyUserName} numberOfLines={1}>
                        {story.userName.toLowerCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Sub Locations Section */}
            {subLocations.length > 0 && (
              <View style={styles.subLocationsSection}>
                <Text style={styles.sectionTitle}>PLACES</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.subLocationsScroll}
                >
                  {subLocations.map((subLoc) => (
                    <TouchableOpacity
                      key={subLoc.name}
                      style={[
                        styles.subLocationCard,
                        selectedSubLocation === subLoc.name && styles.subLocationCardSelected
                      ]}
                      onPress={() => handleSubLocationFilter(subLoc.name)}
                    >
                      <Image
                        source={{ uri: subLoc.thumbnail || 'https://via.placeholder.com/100' }}
                        style={styles.subLocationImage}
                      />
                      <Text style={styles.subLocationName} numberOfLines={2}>
                        {subLoc.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}


          </>
        }
        renderItem={({ item }) => (
          <PostCard post={item} currentUser={currentUser} showMenu={false} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="map-pin" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No posts from this location</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Stories Viewer Modal */}
      {showStoriesViewer && selectedStories.length > 0 && (
        <Modal
          visible={showStoriesViewer}
          transparent={false}
          animationType="fade"
          onRequestClose={() => setShowStoriesViewer(false)}
        >
          <StoriesViewer
            stories={selectedStories}
            onClose={() => setShowStoriesViewer(false)}
          />
        </Modal>
      )}

      {/* Notifications Modal */}
      <NotificationsModal
        visible={notificationsModalVisible}
        onClose={() => setNotificationsModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  headerLogoText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000',
  },
  headerRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  headerIconBtn: {
    position: 'relative',
    padding: 2,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0A3D62',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Location Header Card
  // Location Header Card
  locationHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
  },
  locationImage: {
    width: 76,
    height: 76,
    borderRadius: 26,
    marginRight: 16,
    backgroundColor: '#f0f0f0',
  },
  locationTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginLeft: 6,
  },
  visitsText: {
    fontSize: 13,
    color: '#444',
    marginLeft: 6,
  },
  verifiedText: {
    fontSize: 13,
    color: '#222',
    marginLeft: 6,
  },

  // Section Defaults
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginLeft: 20,
    marginBottom: 12,
    letterSpacing: 0.5,
  },

  // Stories Section
  storiesSection: {
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  storiesScroll: {
    paddingHorizontal: 20,
  },
  storyCard: {
    width: 68,
    marginRight: 14,
    alignItems: 'center',
  },
  storyAvatar: {
    width: 68,
    height: 68,
    borderRadius: 24,
  },
  storyUserName: {
    fontSize: 11,
    fontWeight: '500',
    color: '#222',
    textAlign: 'center',
    width: 68,
    marginTop: 6,
  },

  // Sub Locations Section
  subLocationsSection: {
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  subLocationsScroll: {
    paddingHorizontal: 20,
  },
  subLocationCard: {
    width: 68,
    marginRight: 14,
    alignItems: 'center',
  },
  subLocationCardSelected: {
    opacity: 0.7,
  },
  subLocationImage: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: '#f0f0f0',
  },
  subLocationName: {
    fontSize: 11,
    fontWeight: '500',
    color: '#222',
    textAlign: 'center',
    width: 68,
    marginTop: 6,
  },



  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
});
