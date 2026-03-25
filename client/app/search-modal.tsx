import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { getOrCreateConversation, getRegions, searchUsers } from "../lib/firebaseHelpers/index";
import { followUser, sendFollowRequest, unfollowUser } from "../lib/firebaseHelpers/follow";

// Type definitions
type Region = {
  id: string;
  name: string;
  image: string;
  order?: number;
};

type Suggestion = {
  id: string;
  title: string;
  subtitle: string;
  placeId: string;
};

type User = {
  uid: string;
  displayName?: string;
  photoURL?: string;
  bio?: string;
  isPrivate?: boolean;
};

const DEFAULT_AVATAR_URL = 'https://via.placeholder.com/200x200.png?text=Profile';

// Map and Require local assets
const REGION_IMAGES: { [key: string]: any } = {
  'America': require('../assets/region/America.jpg'),
  'Europe': require('../assets/region/Europe.jpg'),
  'France': require('../assets/region/France.jpg'),
  'Japan': require('../assets/region/Japan.jpg'),
  'London': require('../assets/region/London.jpg'),
  'New York': require('../assets/region/New York.jpg'),
  'Paris': require('../assets/region/Paris.jpg'),
  'UnitedKingdom': require('../assets/region/UnitedKingdom.jpg'),
  'Unitedstates': require('../assets/region/Unitedstates.jpg'),
  // Fallback for names not in our map (using America as a generic base)
  'World': require('../assets/region/America.jpg'),
};

// Default regions (fallback if Firebase fetch fails)
const defaultRegions: Region[] = [
  // COUNTRIES
  { id: 'us', name: 'United States', image: 'Unitedstates' },
  { id: 'france', name: 'France', image: 'France' },
  { id: 'uk', name: 'United Kingdom', image: 'UnitedKingdom' },
  // REGIONS
  { id: 'america', name: 'America', image: 'America' },
  { id: 'europe', name: 'Europe', image: 'Europe' },
  { id: 'japan', name: 'Japan', image: 'Japan' },
  // CITIES
  { id: 'london', name: 'London', image: 'London' },
  { id: 'paris', name: 'Paris', image: 'Paris' },
  { id: 'newyork', name: 'New York', image: 'New York' },
];

export default function SearchModal() {
  const [tab, setTab] = useState<'place' | 'people'>('place');
  const [q, setQ] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState<boolean>(false);
  const [users, setUsers] = useState<User[]>([]);
  const [recommendations, setRecommendations] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [regions, setRegions] = useState<Region[]>(defaultRegions);
  const [loadingRegions, setLoadingRegions] = useState<boolean>(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followingMap, setFollowingMap] = useState<{ [key: string]: boolean }>({});
  const [requestedMap, setRequestedMap] = useState<{ [key: string]: boolean }>({});
  const [followLoadingMap, setFollowLoadingMap] = useState<{ [key: string]: boolean }>({});
  const insets = useSafeAreaInsets();

  // Get current user ID and load following list on mount
  useEffect(() => {
    AsyncStorage.getItem('userId').then(async uid => {
      if (uid) {
        setCurrentUserId(uid);
        console.log('[SearchModal] Current user ID:', uid);

        // Load following list
        try {
          const { apiService } = await import('@/src/_services/apiService');
          const response = await apiService.get(`/follow/users/${uid}/following`);
          if (response.success && Array.isArray(response.data)) {
            const followingIds = response.data.map((f: any) => f.followingId);
            const map: { [key: string]: boolean } = {};
            followingIds.forEach((id: string) => {
              map[id] = true;
            });
            setFollowingMap(map);
            console.log('[SearchModal] Loaded following list:', followingIds.length, 'users');
          }
        } catch (error) {
          console.error('[SearchModal] Failed to load following list:', error);
        }
      }
    }).catch(err => console.error('[SearchModal] Failed to get userId:', err));
  }, []);

  // Fetch regions from Firebase on mount
  useEffect(() => {
    async function fetchRegions() {
      setLoadingRegions(true);
      try {
        const result = await getRegions();
        if (result.success && result.data && result.data.length > 0) {
          setRegions(result.data);
        } else {
          // Use default regions if Firebase fetch fails
          setRegions(defaultRegions);
        }
      } catch (error) {
        console.error('Error loading regions:', error);
        setRegions(defaultRegions);
      }
      setLoadingRegions(false);
    }
    fetchRegions();
  }, []);

  // Reset data when tab changes
  useEffect(() => {
    setQ('');
    setSuggestions([]);
    setUsers([]); // Only reset to empty array, never set region objects
    setRecommendations([]); // Only reset to empty array, never set region objects
    setSelectedRegion(null);
  }, [tab]);

  // Place search (Google Maps Places API)
  useEffect(() => {
    if (tab !== 'place' || q.length < 2) {
      setSuggestions([]);
      return;
    }
    setLoadingSuggest(true);
    const timer = setTimeout(async () => {
      try {
        const { mapService } = await import('../services');
        const results = await mapService.getAutocompleteSuggestions(q);
        setSuggestions(results.map((r: any) => ({
          id: r.placeId || String(Math.random()),
          title: r.description || r.mainText || 'Location',
          subtitle: r.secondaryText || '',
          placeId: r.placeId,
        })));
      } catch (err) {
        setSuggestions([]);
      } finally {
        setLoadingSuggest(false);
      }
    }, 600); // Increased from 300ms to 600ms for better debouncing
    return () => clearTimeout(timer);
  }, [q, tab]);

  // People recommendations
  useEffect(() => {
    if (tab === 'people' && recommendations.length === 0) {
      setLoadingUsers(true);
      searchUsers('', 10).then(result => {
        if (result.success && Array.isArray(result.data)) {
          const safeUsers = result.data.map((u: any) => ({
            uid: String(u?.uid || ''),
            displayName: u?.displayName || 'Unknown',
            photoURL: u?.photoURL || u?.avatar || DEFAULT_AVATAR_URL,
            bio: u?.bio || '',
            isPrivate: typeof u?.isPrivate === 'boolean' ? u.isPrivate : false,
          })).filter((u: any) => typeof u.uid === 'string' && u.uid.trim().length > 0);
          setRecommendations(safeUsers);
        } else {
          setRecommendations([]);
        }
        setLoadingUsers(false);
      });
    }
  }, [tab, recommendations.length]);

  // People search
  useEffect(() => {
    if (tab !== 'people' || q.length < 2) {
      setUsers([]);
      return;
    }
    setLoadingUsers(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await searchUsers(q, 20);
      if (cancelled) return;
      if (result.success && Array.isArray(result.data)) {
        const safeUsers = result.data.map((u: any) => ({
          uid: String(u?.uid || ''),
          displayName: u?.displayName || 'Unknown',
          photoURL: u?.photoURL || u?.avatar || DEFAULT_AVATAR_URL,
          bio: u?.bio || '',
          isPrivate: typeof u?.isPrivate === 'boolean' ? u.isPrivate : false,
        })).filter((u: any) => typeof u.uid === 'string' && u.uid.trim().length > 0);
        setUsers(safeUsers);
      } else {
        setUsers([]);
      }
      if (!cancelled) setLoadingUsers(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, tab]);

  // UI
  // Error boundary fallback UI
  if (hasError) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: 'red', fontSize: 16, marginBottom: 12 }}>Something went wrong. Please try again.</Text>
          <TouchableOpacity onPress={() => setHasError(false)} style={styles.searchBtnBar}>
            <Text style={styles.searchBtnBarText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={{ flex: 1, paddingTop: Math.max(insets.top - 12, 0) }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          {/* Header Tabs */}
          <View style={styles.headerTabsRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
              <Feather name="x" size={20} color="#333" />
            </TouchableOpacity>
            <View style={styles.tabsCenterWrap}>
              <View style={styles.tabsInline}>
                <TouchableOpacity onPress={() => setTab('place')} style={styles.tabBtnInline}>
                  <Text style={[styles.tabText, tab === 'place' && styles.tabTextActive]}>Place</Text>
                  {tab === 'place' && <View style={styles.tabUnderlineInline} />}
                </TouchableOpacity>
                <Text style={styles.dotSep}>Â·</Text>
                <TouchableOpacity onPress={() => setTab('people')} style={styles.tabBtnInline}>
                  <Text style={[styles.tabText, tab === 'people' && styles.tabTextActive]}>People</Text>
                  {tab === 'people' && <View style={styles.tabUnderlineInline} />}
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {/* Search and Region Select */}
          <View style={styles.searchRegionBorderBox}>
            <View style={styles.searchBox}>
              <Feather name="search" size={20} color="#333" style={styles.searchIcon} />
              <TextInput
                style={styles.input}
                placeholder={tab === 'people' ? 'Search for traveler' : 'Search a destination'}
                placeholderTextColor="#999"
                value={q}
                onChangeText={setQ}
                autoCapitalize="none"
                autoCorrect={false}
                importantForAutofill="no"
              />
              {q.length > 0 && (
                <TouchableOpacity onPress={() => setQ('')} style={styles.inputClear}>
                  <Feather name="x" size={16} color="#777" />
                </TouchableOpacity>
              )}
            </View>
            {/* Region Select Grid (background) */}
            {tab === 'place' && q.length < 2 && (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingTop: 8, paddingBottom: 15 }}
                showsVerticalScrollIndicator={false}
              >
                {loadingRegions ? (
                  <View style={{ alignItems: 'center', justifyContent: 'center', height: 150 }}>
                    <ActivityIndicator size="large" color="#0A3D62" />
                  </View>
                ) : (
                  <View style={styles.regionGridWrap}>
                    {/* COUNTRIES */}
                    <Text style={styles.sectionTitle}>COUNTRIES</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
                      <View style={styles.regionGridRow}>
                        {regions.slice(0, 3).map(item => (
                          <TouchableOpacity key={item.id} style={[styles.regionCard, selectedRegion === item.id && styles.regionCardActive]} onPress={() => { setSelectedRegion(item.id); setQ(item.name); }}>
                            <View style={styles.regionImageWrap}>
                              <ExpoImage
                                source={REGION_IMAGES[item.image] || REGION_IMAGES['World']}
                                style={styles.regionImage}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                              />
                            </View>
                            <Text style={styles.regionName}>{item.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>

                    {/* REGIONS */}
                    <Text style={[styles.sectionTitle, { marginTop: 8 }]}>REGIONS</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
                      <View style={styles.regionGridRow}>
                        {regions.slice(3, 6).map(item => (
                          <TouchableOpacity key={item.id} style={[styles.regionCard, selectedRegion === item.id && styles.regionCardActive]} onPress={() => { setSelectedRegion(item.id); setQ(item.name); }}>
                            <View style={styles.regionImageWrap}>
                              <ExpoImage
                                source={REGION_IMAGES[item.image] || REGION_IMAGES['World']}
                                style={styles.regionImage}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                              />
                            </View>
                            <Text style={styles.regionName}>{item.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>

                    {/* CITIES */}
                    <Text style={[styles.sectionTitle, { marginTop: 8 }]}>CITIES</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
                      <View style={styles.regionGridRow}>
                        {regions.slice(6, 9).map((item, idx) => (
                          <TouchableOpacity key={item.id + idx} style={[styles.regionCard, selectedRegion === item.id && styles.regionCardActive]} onPress={() => { setSelectedRegion(item.id); setQ(item.name); }}>
                            <View style={styles.regionImageWrap}>
                              <ExpoImage
                                source={REGION_IMAGES[item.image] || REGION_IMAGES['World']}
                                style={styles.regionImage}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                              />
                            </View>
                            <Text style={styles.regionName}>{item.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}
              </ScrollView>
            )}
            {/* Place Tab Results (Google Maps suggestions) - rendered inline */}
            {tab === 'place' && q.length >= 2 && (
              <View style={{ flex: 1, marginTop: 8 }}>
                {loadingSuggest && <Text style={{ textAlign: 'center', color: '#888', marginBottom: 8 }}>Loading suggestions...</Text>}
                <FlatList
                  data={suggestions}
                  keyExtractor={(item: Suggestion) => item.id}
                  renderItem={({ item }: { item: Suggestion }) => (
                    <TouchableOpacity
                      style={styles.suggestionCardList}
                      onPress={() => {
                        router.push({ pathname: '/location/[placeId]', params: { placeId: item.placeId, locationName: item.title, locationAddress: item.subtitle } });
                      }}
                    >
                      <View style={styles.suggestionIconList}>
                        <Feather name="map-pin" size={20} color="#666" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestionTitleList}>{item.title}</Text>
                        {!!item.subtitle && <Text style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{item.subtitle}</Text>}
                      </View>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={<Text style={{ color: '#888', marginTop: 12, textAlign: 'center' }}>No results</Text>}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingVertical: 4, paddingBottom: 20 }}
                  showsVerticalScrollIndicator={false}
                  initialNumToRender={10}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                  removeClippedSubviews={true}
                />
              </View>
            )}
            {/* People Tab Results (Firebase users) */}
            {tab === 'people' && (
              <FlatList
                data={q.length >= 2 ? users : recommendations}
                keyExtractor={(item: User) => item.uid}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }: { item: User }) => {
                  const isOwnProfile = currentUserId === item.uid;
                  console.log('[SearchModal] Rendering user:', item.displayName, 'uid:', item.uid, 'currentUserId:', currentUserId, 'isOwnProfile:', isOwnProfile);
                  return (
                    <View style={styles.userResultRow}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', flex: 1, alignItems: 'center' }}
                        onPress={() => {
                          // If own profile, navigate to Profile tab instead of user-profile
                          if (isOwnProfile) {
                            router.push('/(tabs)/profile');
                          } else {
                            router.push(`/user-profile?uid=${item.uid}`);
                          }
                        }}
                        accessibilityLabel={`Open profile for ${item.displayName || 'Traveler'}`}
                      >
                        <Image source={{ uri: item.photoURL || DEFAULT_AVATAR_URL }} style={styles.avatarImage} />
                        <View style={{ marginLeft: 16, flex: 1 }}>
                          <Text style={{ fontSize: 16, fontWeight: '400', color: '#222' }}>
                            {item.displayName || 'Traveler'}{isOwnProfile ? ' (You)' : ''}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                }}
                ListEmptyComponent={<Text style={{ color: '#888', marginTop: 12, textAlign: 'center' }}>No travelers found</Text>}
                style={{ marginTop: 16, flex: 1 }}
                contentContainerStyle={{ paddingBottom: 12 }}
                initialNumToRender={15}
                maxToRenderPerBatch={10}
                windowSize={7}
                removeClippedSubviews={true}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 0,
  },
  headerTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 4,
  },
  tabsCenterWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsInline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dotSep: { fontSize: 18, color: '#fff', marginHorizontal: 2, marginTop: 2 }, // hidden dot
  tabBtnInline: { paddingVertical: 0, paddingHorizontal: 0, marginHorizontal: 8, alignItems: 'center', justifyContent: 'center', height: 34 },
  tabText: { fontSize: 16, color: '#999', fontWeight: '500', textAlign: 'center' },
  tabTextActive: { color: '#111', fontWeight: '700', textAlign: 'center' },
  tabUnderlineInline: { position: 'absolute', bottom: -2, left: '10%', right: '10%', height: 2, backgroundColor: '#111', borderRadius: 1 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: '#eee' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#888', marginBottom: 8, letterSpacing: 0.5, marginTop: 4 },
  regionGridWrap: {
    flexDirection: 'column',
    gap: 2,
  },
  regionGridRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  regionCard: {
    width: 124,
    height: 154,
    backgroundColor: 'transparent',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  regionCardActive: {
    opacity: 0.8,
  },
  regionImageWrap: {
    width: 124,
    height: 124,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D8DCE0',
    overflow: 'hidden',
    backgroundColor: '#fafafa',
  },
  regionImage: {
    width: '100%',
    height: '100%',
  },
  regionName: {
    fontSize: 13,
    color: '#000',
    textAlign: 'left',
    fontWeight: '400',
    marginTop: 8,
    lineHeight: 16,
    width: 124,
    paddingLeft: 0,
  },
  actionBtnBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#eee',
    // Remove position absolute so it stays above keyboard and never gets cut off
    minHeight: 60,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  clearAllBtn: {
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  clearAllText: {
    fontSize: 15,
    color: '#222',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  searchBtnBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A3D62',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  searchBtnBarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 6,
  },
  searchRegionBorderBox: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 0,
    paddingHorizontal: 8,
    textAlign: 'left',
  },
  inputClear: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  clearBtn: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  searchBtn: {
    backgroundColor: '#0A3D62',
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: '500',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  suggestionListWrap: {
    marginTop: 0,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
    paddingVertical: 4,
    paddingHorizontal: 0,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  suggestionListOverlay: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eee',
    marginHorizontal: 0,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
    maxHeight: 400,
  },
  suggestionCardList: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  suggestionIconList: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f6f6f8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  suggestionTitleList: {
    fontSize: 16,
    fontWeight: '400',
    color: '#111',
  },
  userResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  userActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
});
