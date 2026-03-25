import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  Path,
  Rect,
  Text as SvgText,
  TextPath,
  SvgUri,
} from 'react-native-svg';
import { addPassportStamp, getPassportData, Stamp } from '../lib/firebaseHelpers/passport';
import { BACKEND_URL } from '../lib/api';
import { reverseGeocode } from '../services/locationService';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import CountryFlag from '@/src/_components/CountryFlag';

const { width } = Dimensions.get('window');
const STAMP_W = width - 48;
const STAMP_H = STAMP_W * 0.76;
const CX = STAMP_W / 2;
const CY = STAMP_H / 2;
const RX = STAMP_W * 0.46;
const RY = STAMP_H * 0.44;

type FilterTab = 'All' | 'Countries' | 'Cities' | 'Places';

// ── Components ──────────────────────────────────────────────────────────────

const PassportStamp = ({ stamp, size = 140, type = 'circular' }: { stamp: Stamp, size?: number, type?: 'circular' | 'oval' }) => {
  const [useExternal, setUseExternal] = useState(stamp.type === 'country');
  const colorMap: Record<string, string> = {
    country: '#0E9F6E',
    city: '#1E63D7',
    place: '#7A3DB8',
  };
  const color = colorMap[stamp.type] || '#D64545';
  const stampUri = `${BACKEND_URL}/stamps/${stamp.name}.svg`;
  const created = new Date(stamp.createdAt);
  const dateText = Number.isNaN(created.getTime())
    ? 'UNVERIFIED DATE'
    : created.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  const safeId = String(stamp._id || stamp.name).replace(/[^A-Za-z0-9_-]/g, '_');
  const title = stamp.name.toUpperCase();
  const subTitle = stamp.type === 'country' ? 'IMMIGRATION' : (stamp.type === 'city' ? 'CITY ENTRY' : 'PLACE CHECK-IN');
  const hash = Array.from(safeId).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const tilt = (hash % 7) - 3;
  const grainOpacity = 0.06 + ((hash % 5) * 0.01);
  const ringDash = `${6 + (hash % 3)} ${3 + (hash % 2)}`;

  if (useExternal && stamp.type === 'country') {
    return (
      <View style={[styles.stampCircle, { width: size, height: size, backgroundColor: 'transparent' }]}>
        <SvgUri
          uri={stampUri}
          width={size}
          height={size}
          onError={() => setUseExternal(false)}
        />
        {stamp.count > 1 && (
          <View style={[styles.counterBadge, { backgroundColor: color }]}>
            <Text style={styles.counterText}>x{stamp.count}</Text>
          </View>
        )}
      </View>
    );
  }

  if (type === 'oval') {
    return (
      <View style={[styles.stampOval, { width: width * 0.83, height: width * 0.47, backgroundColor: 'transparent', transform: [{ rotate: `${tilt * 0.35}deg` }] }]}>
        <Svg width="100%" height="100%" viewBox="0 0 320 180">
          <Defs>
            <Path id={`topArc_${safeId}`} d="M 30 98 A 130 70 0 0 1 290 98" fill="none" />
            <Path id={`bottomArc_${safeId}`} d="M 290 108 A 130 70 0 0 1 30 108" fill="none" />
          </Defs>

          <Ellipse cx="160" cy="90" rx="150" ry="82" fill={color} fillOpacity={0.03} stroke={color} strokeWidth="3" strokeDasharray={ringDash} />
          <Ellipse cx="160" cy="90" rx="136" ry="70" fill="none" stroke={color} strokeWidth="2" />
          <Ellipse cx="160" cy="90" rx="122" ry="58" fill="none" stroke={color} strokeWidth="1.2" strokeDasharray="3 3" />

          <Line x1="58" y1="56" x2="262" y2="124" stroke={color} strokeOpacity={0.16} strokeWidth="1.2" />
          <Line x1="262" y1="56" x2="58" y2="124" stroke={color} strokeOpacity={0.12} strokeWidth="1.2" />
          <Circle cx="82" cy="86" r="2" fill={color} fillOpacity={grainOpacity} />
          <Circle cx="240" cy="100" r="2.4" fill={color} fillOpacity={grainOpacity} />
          <Circle cx="170" cy="140" r="1.8" fill={color} fillOpacity={grainOpacity} />

          <SvgText fill={color} fontSize="12" fontWeight="800" letterSpacing="1">
            <TextPath href={`#topArc_${safeId}`} startOffset="50%" textAnchor="middle">
              VERIFIED TRAVEL STAMP
            </TextPath>
          </SvgText>

          <Rect x="58" y="70" width="204" height="40" rx="8" fill={color} fillOpacity={0.04} stroke={color} strokeWidth="2" />
          <SvgText x="160" y="95" fill={color} fontSize="17" fontWeight="900" textAnchor="middle">
            {title.length > 22 ? `${title.slice(0, 22)}...` : title}
          </SvgText>

          <SvgText fill={color} fontSize="11" fontWeight="800" letterSpacing="0.8">
            <TextPath href={`#bottomArc_${safeId}`} startOffset="50%" textAnchor="middle">
              {`${subTitle} * ${dateText}`}
            </TextPath>
          </SvgText>
        </Svg>
      </View>
    );
  }

  return (
    <View style={[styles.stampCircle, { width: size, height: size, backgroundColor: 'transparent', transform: [{ rotate: `${tilt}deg` }] }]}>
      <Svg width={size} height={size} viewBox="0 0 160 160">
        <Defs>
          <Path id={`ring_${safeId}`} d="M 80,80 m -56,0 a 56,56 0 1,1 112,0 a 56,56 0 1,1 -112,0" fill="none" />
        </Defs>

        <Circle cx="80" cy="80" r="74" fill={color} fillOpacity={0.03} stroke={color} strokeWidth="3" strokeDasharray={ringDash} />
        <Circle cx="80" cy="80" r="66" fill="none" stroke={color} strokeWidth="2" />
        <Circle cx="80" cy="80" r="54" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="3 2" />
        <Circle cx="45" cy="88" r="2" fill={color} fillOpacity={grainOpacity} />
        <Circle cx="112" cy="50" r="2.2" fill={color} fillOpacity={grainOpacity} />
        <Circle cx="120" cy="96" r="1.8" fill={color} fillOpacity={grainOpacity} />

        <SvgText fill={color} fontSize="9.5" fontWeight="900" letterSpacing="1.2">
          <TextPath href={`#ring_${safeId}`} startOffset="50%" textAnchor="middle">
            {` ${subTitle} * ${subTitle} * `}
          </TextPath>
        </SvgText>

        <Rect x="36" y="64" width="88" height="32" rx="6" fill={color} fillOpacity={0.04} stroke={color} strokeWidth="2" />
        <SvgText x="80" y="84" fill={color} fontSize="13" fontWeight="900" textAnchor="middle">
          {title.length > 13 ? `${title.slice(0, 13)}...` : title}
        </SvgText>
        <SvgText x="80" y="107" fill={color} fontSize="8.5" fontWeight="700" textAnchor="middle" letterSpacing="0.6">
          {dateText}
        </SvgText>
      </Svg>

      {stamp.count > 1 && (
        <View style={[styles.counterBadge, { backgroundColor: color }]}> 
          <Text style={styles.counterText}>x{stamp.count}</Text>
        </View>
      )}
    </View>
  );
};

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function PassportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const userId = (params.user as string) || currentUserId;
  const isOwner = !!(currentUserId && userId && currentUserId === userId);

  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All');
  const [suggestion, setSuggestion] = useState<any>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  // When a country is selected, we filter by that country's children
  const handleBack = () => {
    if (selectedCountry) {
      setSelectedCountry(null);
      setActiveFilter('All');
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/profile' as any);
    }
  };

  useEffect(() => {
    const init = async () => {
      const storedUid = await AsyncStorage.getItem('userId');
      setCurrentUserId(storedUid);

      // Check for GPS suggestions
      const suggestionStr = await AsyncStorage.getItem('passport_suggestion');
      if (suggestionStr) {
        const sugg = JSON.parse(suggestionStr);
        // Only show if it's recent (last 30 mins)
        if (Date.now() - sugg.timestamp < 30 * 60 * 1000) {
          setSuggestion(sugg);
        }
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (userId) loadPassportData();
  }, [userId]);

  const loadPassportData = async () => {
    try {
      setLoading(true);
      if (!userId) return;
      const data = await getPassportData(userId);
      setStamps(data.stamps || []);
    } catch (err) {
      console.error('Error loading passport:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFromBanner = async () => {
    if (!suggestion || isAdding || !userId) return;

    try {
      setIsAdding(true);
      // Add all suggested hierarchy (Country -> City -> Place)
      for (const item of suggestion.suggestions) {
        await addPassportStamp(userId, item);
      }

      Alert.alert('✅ Success', 'Stamps added to your passport!');
      setSuggestion(null);
      await AsyncStorage.removeItem('passport_suggestion');
      await loadPassportData();
    } catch (err) {
      Alert.alert('Error', 'Failed to add stamps.');
    } finally {
      setIsAdding(false);
    }
  };

  const getFilteredStamps = () => {
    let list = stamps;
    if (selectedCountry) {
      list = list.filter(s => s.parentCountry === selectedCountry);
      if (activeFilter === 'Cities') return list.filter(s => s.type === 'city');
      if (activeFilter === 'Places') return list.filter(s => s.type === 'place');
      return list;
    }
    
    if (activeFilter === 'Countries') return list.filter(s => s.type === 'country');
    if (activeFilter === 'Cities') return list.filter(s => s.type === 'city');
    if (activeFilter === 'Places') return list.filter(s => s.type === 'place');
    return list;
  };

  const filtered = getFilteredStamps();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={handleBack}>
          <Feather name="arrow-left" size={20} color="#000" />
        </TouchableOpacity>
        
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerSubtitle}>{selectedCountry || ''}</Text>
          <Text style={styles.headerTitle}>{selectedCountry ? selectedCountry : (isOwner ? 'My stamps' : 'Stamps')}</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* Badge Icon (Screenshot gem) */}
          <TouchableOpacity style={[styles.headerBtn, { marginRight: 8, backgroundColor: '#E3F2FD' }]}>
            <LinearGradient
              colors={['#42A5F5', '#1976D2']}
              style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
            >
              <Feather name="award" size={14} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn}>
            <Feather name="search" size={20} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Verification Info Banner */}
        <View style={styles.verifiedBanner}>
          <View style={styles.verifiedRow}>
            <View style={styles.checkCircle}>
              <Feather name="check" size={10} color="#fff" />
            </View>
            <Text style={styles.verifiedText}>All locations are 100% verified</Text>
          </View>
          <View style={[styles.verifiedRow, { marginTop: 6 }]}>
            <Feather name="shield" size={12} color="#000" style={{ marginRight: 6 }} />
            <Text style={styles.verifiedText}>Our system detects VPNs so no cheating</Text>
          </View>
        </View>

        {/* Discovery / Suggestion Banner */}
        {isOwner && suggestion && !selectedCountry && (
          <TouchableOpacity
            style={styles.suggestionBox}
            onPress={handleAddFromBanner}
            activeOpacity={0.9}
          >
            <View style={styles.suggestionInner}>
              <View style={styles.suggestionLeft}>
                <View style={styles.stampIconContainer}>
                  <Feather name="map" size={20} color="#000" />
                </View>
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.suggestionTitle}>Welcome to {suggestion.mainSuggestion.name}!</Text>
                  <Text style={styles.suggestionSub}>Click here to add this to your stamps.</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={20} color="#CCC" />
            </View>
          </TouchableOpacity>
        )}

        {/* Tabs */}
        {!loading && (
          <View style={styles.tabBar}>
            {(['All', 'Countries', 'Cities', 'Places'] as FilterTab[])
              .filter(tab => !selectedCountry || tab !== 'Countries')
              .map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabItem, activeFilter === tab && styles.tabItemActive]}
                onPress={() => setActiveFilter(tab)}
              >
                <Text style={[styles.tabText, activeFilter === tab && styles.tabTextActive]}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Stamps Grid */}
        {loading ? (
          <ActivityIndicator style={{ marginTop: 50 }} color="#0A3D62" />
        ) : (
          <View style={selectedCountry ? styles.stampsList : styles.stampsGrid}>
            {filtered.map((stamp, i) => (
              <TouchableOpacity 
                key={stamp._id} 
                style={selectedCountry ? styles.stampListItem : styles.stampOuter}
                onPress={() => {
                  if (stamp.type === 'country') setSelectedCountry(stamp.name);
                }}
              >
                <PassportStamp 
                  stamp={stamp} 
                  type={selectedCountry && stamp.type !== 'country' ? 'oval' : 'circular'} 
                />
                
                {/* Metadata Pills */}
                <View style={[styles.pillsRow, selectedCountry && { marginTop: 15 }]}>
                  <View style={styles.pill}>
                    <Feather name="map-pin" size={10} color="#666" />
                    <Text style={styles.pillText}>{stamp.parentCountry || stamp.name}</Text>
                  </View>
                  <View style={styles.pill}>
                    <Feather name="calendar" size={10} color="#666" />
                    <Text style={styles.pillText}>
                      {new Date(stamp.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>{stamp.postCount || 0} posts</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}

            {filtered.length === 0 && (
              <View style={styles.emptyState}>
                <Feather name="map" size={40} color="#ddd" />
                <Text style={styles.emptyText}>No {activeFilter.toLowerCase()} stamps yet</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Manual Add FAB */}
      {isOwner && (
        <TouchableOpacity style={styles.fab} onPress={() => Alert.alert('GPS Detection', 'Travel to a new location to get a stamp automatically!')}>
          <Feather name="crosshair" size={24} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center',
  },
  headerTitleContainer: { flex: 1, alignItems: 'center' },
  headerSubtitle: { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },

  verifiedBanner: {
    marginHorizontal: 20,
    marginTop: 10,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  verifiedRow: { flexDirection: 'row', alignItems: 'center' },
  checkCircle: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#000', alignItems: 'center', justifyContent: 'center',
    marginRight: 8,
  },
  verifiedText: { fontSize: 13, color: '#666', fontWeight: '500' },

  suggestionBox: { marginHorizontal: 20, marginTop: 15, borderRadius: 16, overflow: 'hidden' },
  suggestionGradient: { padding: 16, backgroundColor: '#F8F9FA', borderRadius: 16 },
  suggestionContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  suggestionSub: { color: '#888', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  suggestionTitle: { color: '#000', fontSize: 16, fontWeight: '700', marginTop: 2 },
  addCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#000', alignItems: 'center', justifyContent: 'center',
  },

  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 20,
    justifyContent: 'space-between',
  },
  statBox: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 18, fontWeight: '800', color: '#111' },
  statLab: { fontSize: 12, color: '#888', marginTop: 2 },

  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginTop: 25,
    marginBottom: 15,
  },
  tabItem: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#eee',
  },
  tabItemActive: { backgroundColor: '#fff', borderColor: '#000' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#666' },
  tabTextActive: { color: '#000' },

  stampsGrid: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  stampsList: {
    paddingHorizontal: 20,
  },
  stampOuter: {
    width: '100%',
    marginBottom: 40,
    alignItems: 'center',
  },
  stampListItem: {
    width: '100%',
    marginBottom: 40,
    alignItems: 'center',
  },
  stampCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  stampOval: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: '#f9f9f9',
    borderRadius: 100,
  },
  counterBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    elevation: 3,
  },
  counterText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  pillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 15,
    gap: 4,
    borderWidth: 1,
    borderColor: '#eee',
  },
  pillText: { fontSize: 11, color: '#444', fontWeight: '600' },

  suggestionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  suggestionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stampIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  emptyState: { alignItems: 'center', width: '100%', marginTop: 40 },
  emptyText: { fontSize: 14, color: '#999', marginTop: 10 },

  fab: {
    position: 'absolute', bottom: 30, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#000', alignItems: 'center', justifyContent: 'center',
    elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 6,
  },
});
