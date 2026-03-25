/**
 * story-upload.tsx
 * Instagram-style story share screen.
 * Receives: storyMediaUri, storyMediaType, storyTextOverlays (JSON)
 * Lets user add caption + location, then uploads the story.
 */

import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createStory } from '../lib/firebaseHelpers/index';
import { API_BASE_URL } from '../lib/api';

const { width: SCREEN_W } = Dimensions.get('window');
const PREVIEW_H = SCREEN_W * 1.2;

// ─────────────────────────────────────────────
export default function StoryUploadScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams();

    const uri = typeof params.storyMediaUri === 'string' ? params.storyMediaUri : '';
    const type = typeof params.storyMediaType === 'string' ? params.storyMediaType : 'photo';
    const overlaysRaw = typeof params.storyTextOverlays === 'string' ? params.storyTextOverlays : '';

    const [caption, setCaption] = useState('');
    const [locationQuery, setLocationQuery] = useState('');
    const [locationData, setLocationData] = useState<any>(null);
    const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);
    const [loadingLocations, setLoadingLocations] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [userId, setUserId] = useState<string | null>(null);

    // Load current user
    useEffect(() => {
        AsyncStorage.getItem('userId').then(setUserId).catch(() => setUserId(null));
    }, []);

    // Location autocomplete
    useEffect(() => {
        if (locationQuery.length < 2) { setLocationSuggestions([]); return; }
        setLoadingLocations(true);
        const timer = setTimeout(async () => {
            try {
                const { mapService } = await import('../services');
                const sug = await mapService.getAutocompleteSuggestions(locationQuery);
                setLocationSuggestions(sug.map((s: any) => ({
                    placeId: s.placeId,
                    name: s.mainText || s.description || 'Location',
                    address: s.description || '',
                })));
            } catch { setLocationSuggestions([]); }
            finally { setLoadingLocations(false); }
        }, 500);
        return () => clearTimeout(timer);
    }, [locationQuery]);

    // Text overlays for display
    let overlays: any[] = [];
    try { if (overlaysRaw) overlays = JSON.parse(overlaysRaw); } catch { }

    // ─────────────────────────────────────────
    // Upload
    // ─────────────────────────────────────────
    const handleShare = async () => {
        if (!uri || !userId || uploading) return;
        setUploading(true);
        setUploadProgress(0);

        try {
            let uploadUri = uri;
            const mediaType = type === 'video' ? 'video' : 'image';

            // Compress image
            if (mediaType === 'image') {
                try {
                    const result = await ImageManipulator.manipulateAsync(
                        uri,
                        [{ resize: { width: 1080 } }],
                        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
                    );
                    uploadUri = result.uri;
                } catch (e) {
                    console.warn('[StoryUpload] Compression failed, using original');
                }
            }

            const loc = locationData ?? undefined;
            const storyRes = await createStory(
                userId,
                uploadUri,
                mediaType,
                loc,
                (percent: number) => {
                    setUploadProgress(Math.min(99, Math.max(0, Math.round(percent))));
                }
            );

            if (!storyRes?.success) throw new Error('Upload failed');

            setUploadProgress(100);
            setTimeout(() => {
                // Go back to home, trigger stories refresh
                router.replace('/(tabs)/home' as any);
            }, 600);
        } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to upload story. Try again.');
            setUploading(false);
            setUploadProgress(0);
        }
    };

    if (!uri) {
        return (
            <View style={[styles.screen, { paddingTop: insets.top }]}>
                <Text style={{ color: '#fff', textAlign: 'center', marginTop: 40 }}>No media selected.</Text>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={{ color: '#0095f6', textAlign: 'center', marginTop: 12 }}>Go back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={[styles.screen, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />

            {/* ── Header ── */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} disabled={uploading}>
                    <Feather name="arrow-left" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>New Story</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                >
                    {/* ── Preview ── */}
                    <View style={styles.preview}>
                        <Image source={{ uri }} style={styles.previewImg} resizeMode="cover" />

                        {/* Text overlays preview */}
                        {overlays.map((o: any) => (
                            <View
                                key={o.id}
                                style={[
                                    styles.overlayTextWrap,
                                    { left: o.x * SCREEN_W - 40, top: o.y * PREVIEW_H },
                                ]}
                                pointerEvents="none"
                            >
                                <Text style={[styles.overlayText, { color: o.color }]}>
                                    {o.text}
                                </Text>
                            </View>
                        ))}
                    </View>

                    {/* ── Share to section (like Instagram) ── */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Share to</Text>
                        <View style={styles.shareToRow}>
                            <View style={styles.shareToItem}>
                                <View style={styles.shareToIcon}>
                                    <Feather name="book-open" size={22} color="#fff" />
                                </View>
                                <Text style={styles.shareToLabel}>Your story</Text>
                            </View>
                        </View>
                    </View>

                    {/* ── Caption ── */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Caption</Text>
                        <TextInput
                            style={styles.captionInput}
                            placeholder="Write a caption..."
                            placeholderTextColor="#666"
                            value={caption}
                            onChangeText={setCaption}
                            multiline
                            maxLength={150}
                        />
                    </View>

                    {/* ── Location ── */}
                    <View style={[styles.section, { zIndex: 10 }]}>
                        <Text style={styles.sectionTitle}>Location</Text>
                        <View style={styles.locationWrap}>
                            <Feather name="map-pin" size={16} color="#888" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.locationInput}
                                placeholder="Add location..."
                                placeholderTextColor="#666"
                                value={locationQuery}
                                onChangeText={(t) => { setLocationQuery(t); if (!t) setLocationData(null); }}
                                returnKeyType="done"
                                blurOnSubmit
                            />
                            {locationData && (
                                <TouchableOpacity onPress={() => { setLocationData(null); setLocationQuery(''); }}>
                                    <Feather name="x-circle" size={16} color="#888" />
                                </TouchableOpacity>
                            )}
                            {loadingLocations && <ActivityIndicator size="small" color="#888" style={{ marginLeft: 4 }} />}
                        </View>

                        {/* Suggestions */}
                        {locationSuggestions.length > 0 && (
                            <View style={styles.suggestionsBox}>
                                {locationSuggestions.slice(0, 5).map((item) => (
                                    <TouchableOpacity
                                        key={item.placeId}
                                        style={styles.suggestionItem}
                                        onPress={() => {
                                            Keyboard.dismiss();
                                            setLocationData({ name: item.name, address: item.address, placeId: item.placeId });
                                            setLocationQuery(item.name);
                                            setLocationSuggestions([]);
                                        }}
                                    >
                                        <Feather name="map-pin" size={14} color="#0095f6" style={{ marginRight: 8 }} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.suggestionName}>{item.name}</Text>
                                            <Text style={styles.suggestionAddr} numberOfLines={1}>{item.address}</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>

                    {/* ── Upload progress ── */}
                    {uploading && (
                        <View style={styles.progressBox}>
                            <ActivityIndicator color="#0095f6" size="small" />
                            <Text style={styles.progressText}>Uploading {uploadProgress}%</Text>
                            <View style={styles.progressBarBg}>
                                <View style={[styles.progressBar, { width: `${uploadProgress}%` }]} />
                            </View>
                        </View>
                    )}

                    {/* ── Share button ── */}
                    <TouchableOpacity
                        style={[styles.shareBtn, uploading && styles.shareBtnDisabled]}
                        onPress={handleShare}
                        disabled={uploading}
                        activeOpacity={0.85}
                    >
                        {uploading ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <>
                                <Feather name="send" size={18} color="#fff" />
                                <Text style={styles.shareBtnText}>Share to Story</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

// ─────────────────────────────────────────────
const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#000' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 14, paddingVertical: 12,
    },
    headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },

    // Preview
    preview: { width: SCREEN_W, height: PREVIEW_H, backgroundColor: '#111', overflow: 'hidden' },
    previewImg: { width: '100%', height: '100%' },
    overlayTextWrap: { position: 'absolute', maxWidth: SCREEN_W - 20 },
    overlayText: { fontSize: 24, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 },

    // Section
    section: { paddingHorizontal: 16, paddingTop: 20 },
    sectionTitle: { color: '#999', fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase' },

    // Share to
    shareToRow: { flexDirection: 'row', gap: 16 },
    shareToItem: { alignItems: 'center', gap: 6 },
    shareToIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#0095f6', alignItems: 'center', justifyContent: 'center' },
    shareToLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },

    // Caption
    captionInput: {
        backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
        minHeight: 60, textAlignVertical: 'top',
    },

    // Location
    locationWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#1a1a1a', borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 10,
    },
    locationInput: { flex: 1, color: '#fff', fontSize: 15 },
    suggestionsBox: { backgroundColor: '#1e1e1e', borderRadius: 12, marginTop: 6, overflow: 'hidden' },
    suggestionItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
    suggestionName: { color: '#fff', fontSize: 14, fontWeight: '600' },
    suggestionAddr: { color: '#666', fontSize: 12, marginTop: 2 },

    // Progress
    progressBox: { marginHorizontal: 16, marginTop: 16, alignItems: 'center', gap: 8 },
    progressText: { color: '#fff', fontSize: 14 },
    progressBarBg: { width: '100%', height: 4, backgroundColor: '#333', borderRadius: 2, overflow: 'hidden' },
    progressBar: { height: '100%', backgroundColor: '#0095f6', borderRadius: 2 },

    // Share button
    shareBtn: {
        marginHorizontal: 16, marginTop: 24,
        backgroundColor: '#0095f6', borderRadius: 14,
        paddingVertical: 14, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    shareBtnDisabled: { opacity: 0.5 },
    shareBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
