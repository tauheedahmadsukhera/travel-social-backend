import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Keyboard,
  Platform,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';

// Hooks
import { useLiveStream } from '../hooks/useLiveStream';

// Components
import ZeegocloudLiveHost from '@/src/_components/ZeegocloudLiveHost';
import { LiveSetupView } from '@/src/_components/live/LiveSetupView';
import { LiveStreamingOverlay } from '@/src/_components/live/LiveStreamingOverlay';
import { LiveCommentsPanel } from '@/src/_components/live/LiveCommentsPanel';
import { LiveViewersPanel } from '@/src/_components/live/LiveViewersPanel';
import { LiveLocationMap } from '@/src/_components/live/LiveLocationMap';

// Utils
import { logger } from '../utils/logger';
import { safeRouterBack } from '@/lib/safeRouterBack';

const MapView = Platform.OS === 'web' ? null : require('react-native-maps').default;
const Marker = Platform.OS === 'web' ? null : require('react-native-maps').Marker;
const { height } = Dimensions.get('window');

function getSafeCoordinate(coord: { latitude?: number; longitude?: number } | null, fallback = { latitude: 51.5074, longitude: -0.1278 }) {
  const lat = typeof coord?.latitude === 'number' && isFinite(coord.latitude) ? coord.latitude : fallback.latitude;
  const lon = typeof coord?.longitude === 'number' && isFinite(coord.longitude) ? coord.longitude : fallback.longitude;
  return { latitude: lat, longitude: lon };
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

interface Comment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  timestamp: any;
}

export default function GoLiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const {
    isStreaming,
    isInitializing,
    roomId,
    streamTitle,
    setStreamTitle,
    currentUser,
    viewerCount,
    viewers,
    streamDuration,
    startStream,
    endStream,
  } = useLiveStream();

  // Location State
  const [location, setLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [manualLocation, setManualLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [manualLocationLabel, setManualLocationLabel] = useState<string>('');
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [pickerLocation, setPickerLocation] = useState<{latitude: number; longitude: number}>(getSafeCoordinate(null));
  const [pickerLocationLabel, setPickerLocationLabel] = useState<string>('');
  const [isResolvingPickerLabel, setIsResolvingPickerLabel] = useState(false);

  // Controls State
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isUsingFrontCamera, setIsUsingFrontCamera] = useState(true);

  // UI Panels State
  const [showComments, setShowComments] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [canToggleComments, setCanToggleComments] = useState(false);

  // Comments State
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [lastReadTs, setLastReadTs] = useState(0);
  const commentsListRef = useRef<FlatList<Comment> | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const unreadCount = comments.reduce((acc, c) => acc + ((Number(c?.timestamp) || 0) > lastReadTs ? 1 : 0), 0);

  // Effects
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvent as any, (e: any) => setKeyboardHeight(e?.endCoordinates?.height || 0));
    const subHide = Keyboard.addListener(hideEvent as any, () => setKeyboardHeight(0));
    return () => { subShow.remove(); subHide.remove(); };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setCanToggleComments(true), 350);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!showComments) return;
    const latest = comments.reduce((m, c) => Math.max(m, Number(c?.timestamp) || 0), 0);
    setLastReadTs(latest);
  }, [showComments, comments]);

  const getLiveLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (loc?.coords) {
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setLocation(coords);
        return coords;
      }
    } catch (e) { logger.error('Error getting location:', e); }
    return null;
  }, []);

  useEffect(() => { getLiveLocation(); }, [getLiveLocation]);

  const resolvePickerLabel = useCallback(async (coord: { latitude: number; longitude: number }) => {
    try {
      setIsResolvingPickerLabel(true);
      const results = await Location.reverseGeocodeAsync(coord);
      const first = results[0];
      const label = [(first as any)?.city || (first as any)?.subregion, (first as any)?.country].filter(Boolean).join(', ');
      setPickerLocationLabel(label || `${coord.latitude.toFixed(4)}, ${coord.longitude.toFixed(4)}`);
    } catch {
      setPickerLocationLabel(`${coord.latitude.toFixed(4)}, ${coord.longitude.toFixed(4)}`);
    } finally { setIsResolvingPickerLabel(false); }
  }, []);

  const handleStartStreamInternal = async () => {
    if (!streamTitle.trim()) { Alert.alert('Error', 'Please enter a stream title'); return; }
    const effectiveLocation = location || manualLocation;
    const success = await startStream(currentUser?.uid, streamTitle, effectiveLocation);
    if (!success) Alert.alert('Error', 'Failed to start stream');
  };

  const handleEndStreamInternal = () => {
    Alert.alert('End Stream', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Stream', style: 'destructive', onPress: async () => {
        await endStream();
        safeRouterBack();
      }}
    ]);
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: `Watch my live stream: ${streamTitle}\nhttps://yourapp.com/watch-live?roomId=${roomId}` });
    } catch (e) { logger.error('Share error:', e); }
  };

  const handleSendComment = () => {
    if (!newComment.trim()) return;
    const comment: Comment = {
      id: Date.now().toString(),
      userId: currentUser?.uid || 'anonymous',
      userName: currentUser?.displayName || 'Anonymous',
      userAvatar: currentUser?.photoURL || '',
      text: newComment.trim(),
      timestamp: Date.now(),
    };
    setComments(prev => [...prev, comment]);
    setNewComment('');
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!isStreaming) {
    return (
      <LiveSetupView
        streamTitle={streamTitle}
        setStreamTitle={setStreamTitle}
        isInitializing={isInitializing}
        location={location}
        manualLocation={manualLocation}
        manualLocationLabel={manualLocationLabel}
        onStartStream={handleStartStreamInternal}
        onOpenLocationPicker={() => {
          const base = location || manualLocation || getSafeCoordinate(null);
          setPickerLocation(base);
          setShowLocationPicker(true);
          resolvePickerLabel(base);
        }}
        onRetryLocation={getLiveLocation}
        onBack={() => safeRouterBack()}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.videoContainer}>
        <ZeegocloudLiveHost
          roomID={roomId}
          userID={currentUser?.uid || 'anonymous'}
          userName={currentUser?.displayName || 'Anonymous'}
          onLeave={handleEndStreamInternal}
          isCameraOn={isCameraOn}
          isMuted={isMuted}
          isUsingFrontCamera={isUsingFrontCamera}
        />
      </View>

      <LiveStreamingOverlay
        viewers={viewers}
        viewerCount={viewerCount}
        onEndStream={handleEndStreamInternal}
        onShowViewers={setShowViewers}
        onShowStats={setShowStats}
        showStats={showStats}
        formatDuration={formatDuration}
        streamDuration={streamDuration}
        commentsCount={comments.length}
        hasLocation={!!(location || manualLocation)}
        onToggleCameraFacing={() => setIsUsingFrontCamera(!isUsingFrontCamera)}
        onShare={handleShare}
        onToggleComments={() => canToggleComments && setShowComments(v => !v)}
        unreadCount={unreadCount}
        showComments={showComments}
        showMap={showMap}
        showViewers={showViewers}
        canToggleComments={canToggleComments}
        onToggleMap={() => setShowMap(!showMap)}
        insets={insets}
      />

      {showComments && (
        <LiveCommentsPanel
          comments={comments}
          newComment={newComment}
          setNewComment={setNewComment}
          onSendComment={handleSendComment}
          onClose={() => setShowComments(false)}
          insets={insets}
          keyboardHeight={keyboardHeight}
          commentsListRef={commentsListRef}
          shouldAutoScrollRef={shouldAutoScrollRef}
          clampNumber={clampNumber}
        />
      )}

      {showViewers && (
        <LiveViewersPanel
          viewers={viewers}
          onClose={() => setShowViewers(false)}
          location={location}
          calculateDistance={calculateDistance}
        />
      )}

      {showMap && (location || manualLocation) && (
        <LiveLocationMap
          location={location}
          manualLocation={manualLocation}
          onClose={() => setShowMap(false)}
          MapView={MapView}
          Marker={Marker}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  videoContainer: { flex: 1, backgroundColor: '#000' },
});
