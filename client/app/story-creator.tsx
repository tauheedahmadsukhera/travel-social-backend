import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface GalleryAsset {
    id: string;
    uri: string;
    mediaType: 'photo' | 'video';
    duration?: number;
}

interface TextOverlay {
    id: string;
    text: string;
    color: string;
    fontStyle: FontStyleKey;
    x: number; // 0-1 relative
    y: number; // 0-1 relative
}

type FontStyleKey = 'classic' | 'modern' | 'strong';

const FONT_STYLES: Record<FontStyleKey, { label: string; fontFamily?: string; italic?: boolean; letterSpacing?: number; textTransform?: 'uppercase' | 'none' }> = {
    classic: { label: 'Classic', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
    modern: { label: 'Modern', fontFamily: undefined, letterSpacing: 1 },
    strong: { label: 'Strong', fontFamily: undefined, letterSpacing: 2, textTransform: 'uppercase' },
};

const TEXT_COLORS = [
    '#ffffff', '#000000', '#FFD700', '#FF4444',
    '#44CFFF', '#44FF88', '#FF44CC', '#FF8800',
    '#8B44FF', '#FF6B6B', '#4ECDC4', '#96E6A1',
];

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const COLS = 3;
const TILE_SIZE = SCREEN_W / COLS;
const PREVIEW_H = SCREEN_W * 1.1;

// ─────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────
export default function StoryCreatorScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    // Gallery
    const [assets, setAssets] = useState<GalleryAsset[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [selectedUri, setSelectedUri] = useState<string | null>(null);
    const [selectedAsset, setSelectedAsset] = useState<GalleryAsset | null>(null);
    const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
    const [hasNextPage, setHasNextPage] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    // Text overlays
    const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
    const [showTextEditor, setShowTextEditor] = useState(false);
    const [editingText, setEditingText] = useState('');
    const [editingColor, setEditingColor] = useState('#ffffff');
    const [editingFontStyle, setEditingFontStyle] = useState<FontStyleKey>('classic');

    // ─────────────────────────────────────────
    // Gallery permissions + load
    // ─────────────────────────────────────────
    useEffect(() => {
        (async () => {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            setHasPermission(status === 'granted');
            if (status === 'granted') await loadAssets();
            else setLoading(false);
        })();
    }, []);

    const loadAssets = async (after?: string) => {
        try {
            const page = await MediaLibrary.getAssetsAsync({
                mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
                sortBy: [[MediaLibrary.SortBy.creationTime, false]],
                first: 60,
                after,
            });
            const mapped: GalleryAsset[] = page.assets.map((a) => ({
                id: a.id,
                uri: a.uri,
                mediaType: a.mediaType === MediaLibrary.MediaType.video ? 'video' : 'photo',
                duration: a.duration,
            }));
            setAssets((prev) => (after ? [...prev, ...mapped] : mapped));
            setEndCursor(page.endCursor);
            setHasNextPage(page.hasNextPage);
            if (!after && mapped.length > 0) {
                setSelectedUri(mapped[0].uri);
                setSelectedAsset(mapped[0]);
            }
        } catch (e) {
            console.error('[StoryCreator] Error loading assets:', e);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const loadMore = async () => {
        if (!hasNextPage || loadingMore) return;
        setLoadingMore(true);
        await loadAssets(endCursor);
    };

    // ─────────────────────────────────────────
    // Camera
    // ─────────────────────────────────────────
    const openCamera = async () => {
        try {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) return;
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.All,
                allowsEditing: false,
                quality: 0.9,
                videoMaxDuration: 60,
            });
            if (!result.canceled && result.assets?.[0]) {
                const asset = result.assets[0];
                navigateWithMedia(asset.uri, asset.type === 'video' ? 'video' : 'photo');
            }
        } catch (e) {
            console.error('[StoryCreator] Camera error:', e);
        }
    };

    // ─────────────────────────────────────────
    // Navigate back with media + text overlays
    // ─────────────────────────────────────────
    const navigateWithMedia = useCallback(
        (uri: string, type: 'photo' | 'video') => {
            router.push({
                pathname: '/story-upload',
                params: {
                    storyMediaUri: uri,
                    storyMediaType: type,
                    storyTextOverlays: textOverlays.length > 0 ? JSON.stringify(textOverlays) : '',
                },
            } as any);
        },
        [router, textOverlays]
    );

    const handleNext = () => {
        if (!selectedAsset) return;
        router.push({
            pathname: '/create-post',
            params: {
                selectedImages: JSON.stringify([selectedAsset.uri]),
                postType: 'STORY',
                step: 'details',
                mediaType: selectedAsset.mediaType === 'video' ? 'video' : 'image'
            }
        } as any);
    };


    // ─────────────────────────────────────────
    // Text editor
    // ─────────────────────────────────────────
    const openTextEditor = () => {
        setEditingText('');
        setEditingColor('#ffffff');
        setEditingFontStyle('classic');
        setShowTextEditor(true);
    };

    const commitText = () => {
        const trimmed = editingText.trim();
        if (!trimmed) {
            setShowTextEditor(false);
            return;
        }
        const overlay: TextOverlay = {
            id: Date.now().toString(),
            text: trimmed,
            color: editingColor,
            fontStyle: editingFontStyle,
            x: 0.5,
            y: 0.45,
        };
        setTextOverlays((prev) => [...prev, overlay]);
        setShowTextEditor(false);
    };

    const deleteOverlay = (id: string) => {
        setTextOverlays((prev) => prev.filter((o) => o.id !== id));
    };

    // ─────────────────────────────────────────
    // Draggable text overlay component
    // ─────────────────────────────────────────
    const DraggableText = ({ overlay }: { overlay: TextOverlay }) => {
        const posRef = useRef({ x: overlay.x * SCREEN_W, y: overlay.y * PREVIEW_H });
        const [pos, setPos] = useState({ x: overlay.x * SCREEN_W, y: overlay.y * PREVIEW_H });

        const panResponder = useRef(
            PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onMoveShouldSetPanResponder: () => true,
                onPanResponderGrant: () => { },
                onPanResponderMove: (_, gestureState) => {
                    const newX = Math.max(0, Math.min(SCREEN_W - 40, posRef.current.x + gestureState.dx));
                    const newY = Math.max(0, Math.min(PREVIEW_H - 20, posRef.current.y + gestureState.dy));
                    setPos({ x: newX, y: newY });
                },
                onPanResponderRelease: (_, gestureState) => {
                    const newX = Math.max(0, Math.min(SCREEN_W - 40, posRef.current.x + gestureState.dx));
                    const newY = Math.max(0, Math.min(PREVIEW_H - 20, posRef.current.y + gestureState.dy));
                    posRef.current = { x: newX, y: newY };
                    setPos({ x: newX, y: newY });
                    setTextOverlays((prev) =>
                        prev.map((o) =>
                            o.id === overlay.id ? { ...o, x: newX / SCREEN_W, y: newY / PREVIEW_H } : o
                        )
                    );
                },
            })
        ).current;

        const fs = FONT_STYLES[overlay.fontStyle];

        return (
            <View
                {...panResponder.panHandlers}
                style={[
                    styles.textOverlay,
                    { left: pos.x, top: pos.y, transform: [{ translateX: -40 }] },
                ]}
            >
                <TouchableOpacity
                    onLongPress={() => deleteOverlay(overlay.id)}
                    activeOpacity={1}
                    delayLongPress={400}
                >
                    <Text
                        style={[
                            styles.overlayText,
                            {
                                color: overlay.color,
                                fontFamily: fs.fontFamily,
                                letterSpacing: fs.letterSpacing,
                                textTransform: fs.textTransform as any,
                            },
                        ]}
                    >
                        {overlay.text}
                    </Text>
                </TouchableOpacity>
            </View>
        );
    };

    // ─────────────────────────────────────────
    // Gallery tile
    // ─────────────────────────────────────────
    const renderTile = useCallback(
        ({ item }: { item: GalleryAsset }) => {
            const isSelected = item.uri === selectedUri;
            return (
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                        setSelectedUri(item.uri);
                        setSelectedAsset(item);
                    }}
                    style={[styles.tile, { width: TILE_SIZE, height: TILE_SIZE }]}
                >
                    <Image source={{ uri: item.uri }} style={styles.tileImg} />
                    {item.mediaType === 'video' && (
                        <View style={styles.videoBadge}>
                            <Feather name="video" size={10} color="#fff" />
                            {item.duration != null && (
                                <Text style={styles.videoDuration}>
                                    {Math.floor(item.duration / 60)}:
                                    {String(Math.floor(item.duration % 60)).padStart(2, '0')}
                                </Text>
                            )}
                        </View>
                    )}
                    {isSelected && <View style={styles.selectedOverlay} />}
                    {isSelected && (
                        <View style={styles.selectedDot}>
                            <Feather name="check" size={12} color="#fff" />
                        </View>
                    )}
                </TouchableOpacity>
            );
        },
        [selectedUri]
    );

    const CameraTile = () => (
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={openCamera}
            style={[styles.tile, styles.cameraTile, { width: TILE_SIZE, height: TILE_SIZE }]}
        >
            <Feather name="camera" size={30} color="#fff" />
            <Text style={styles.cameraLabel}>Camera</Text>
        </TouchableOpacity>
    );

    // ─────────────────────────────────────────
    // Permission denied screen
    // ─────────────────────────────────────────
    if (hasPermission === false) {
        return (
            <View style={[styles.screen, { paddingTop: insets.top }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
                        <Feather name="x" size={26} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Add to story</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.permissionBox}>
                    <Feather name="image" size={56} color="#555" />
                    <Text style={styles.permissionText}>Gallery access required</Text>
                    <Text style={styles.permissionSub}>Allow access in Settings → Permissions</Text>
                </View>
            </View>
        );
    }

    // ─────────────────────────────────────────
    // Main render
    // ─────────────────────────────────────────
    return (
        <View style={[styles.screen, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />

            {/* ── Header ── */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
                    <Feather name="x" size={26} color="#000" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Add to story</Text>
                <TouchableOpacity
                    onPress={handleNext}
                    style={[styles.nextBtn, !selectedAsset && styles.nextBtnDisabled]}
                    disabled={!selectedAsset}
                >
                    <Text style={styles.nextBtnText}>Next</Text>
                    <Feather name="chevron-right" size={18} color="#fff" />
                </TouchableOpacity>
            </View>


            {/* ── Preview ── */}
            <View style={styles.preview}>
                {selectedUri ? (
                    <Image source={{ uri: selectedUri }} style={styles.previewImg} resizeMode="cover" />
                ) : null}

                {/* Text overlays */}
                {textOverlays.map((overlay) => (
                    <DraggableText key={overlay.id} overlay={overlay} />
                ))}

                {/* Aa button on preview */}
                {selectedUri && (
                    <TouchableOpacity style={styles.aaBtn} onPress={openTextEditor} activeOpacity={0.8}>
                        <Text style={styles.aaBtnText}>Aa</Text>
                    </TouchableOpacity>
                )}

                {/* Hint if overlays exist */}
                {textOverlays.length > 0 && (
                    <View style={styles.dragHint}>
                        <Text style={styles.dragHintText}>Long-press text to delete · Drag to move</Text>
                    </View>
                )}
            </View>

            {/* ── Recents label ── */}
            <View style={styles.recentsRow}>
                <Text style={styles.recentsLabel}>Recents</Text>
            </View>

            {/* ── Grid ── */}
            {loading ? (
                <View style={styles.loader}>
                    <ActivityIndicator size="large" color="#fff" />
                </View>
            ) : (
                <FlatList
                    ref={flatListRef}
                    data={assets}
                    keyExtractor={(item) => item.id}
                    numColumns={COLS}
                    renderItem={renderTile}
                    ListHeaderComponent={<CameraTile />}
                    ListHeaderComponentStyle={{ width: TILE_SIZE }}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.5}
                    showsVerticalScrollIndicator={false}
                    ListFooterComponent={
                        loadingMore ? (
                            <ActivityIndicator size="small" color="#999" style={{ marginVertical: 12 }} />
                        ) : null
                    }
                    columnWrapperStyle={styles.row}
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
                />
            )}

            {/* ── Text Editor Modal ── */}
            <Modal visible={showTextEditor} transparent animationType="fade" statusBarTranslucent>
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                        <View style={styles.textEditorBg}>
                            {/* ── Editor header ── */}
                            <View style={[styles.textEditorHeader, { paddingTop: insets.top + 8 }]}>
                                <TouchableOpacity onPress={() => setShowTextEditor(false)} style={styles.headerBtn}>
                                    <Feather name="x" size={24} color="#fff" />
                                </TouchableOpacity>
                                <Text style={styles.headerTitle}>Add Text</Text>
                                <TouchableOpacity
                                    onPress={commitText}
                                    style={styles.doneBtn}
                                >
                                    <Text style={styles.doneBtnText}>Done</Text>
                                </TouchableOpacity>
                            </View>

                            {/* ── Preview with text input ── */}
                            <View style={styles.textEditorPreview}>
                                {selectedUri && (
                                    <Image
                                        source={{ uri: selectedUri }}
                                        style={StyleSheet.absoluteFillObject}
                                        resizeMode="cover"
                                    />
                                )}
                                <View style={styles.textEditorOverlay} />
                                <TextInput
                                    style={[
                                        styles.textInput,
                                        {
                                            color: editingColor,
                                            fontFamily: FONT_STYLES[editingFontStyle].fontFamily,
                                            letterSpacing: FONT_STYLES[editingFontStyle].letterSpacing,
                                            textTransform: FONT_STYLES[editingFontStyle].textTransform as any,
                                        },
                                    ]}
                                    placeholder="Type something..."
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    value={editingText}
                                    onChangeText={setEditingText}
                                    multiline
                                    autoFocus
                                    maxLength={100}
                                    textAlign="center"
                                    blurOnSubmit={false}
                                />
                            </View>

                            {/* ── Font style picker ── */}
                            <View style={styles.fontStyleRow}>
                                {(Object.keys(FONT_STYLES) as FontStyleKey[]).map((key) => (
                                    <TouchableOpacity
                                        key={key}
                                        style={[
                                            styles.fontStyleBtn,
                                            editingFontStyle === key && styles.fontStyleBtnActive,
                                        ]}
                                        onPress={() => setEditingFontStyle(key)}
                                    >
                                        <Text
                                            style={[
                                                styles.fontStyleLabel,
                                                editingFontStyle === key && styles.fontStyleLabelActive,
                                                {
                                                    fontFamily: FONT_STYLES[key].fontFamily,
                                                    letterSpacing: FONT_STYLES[key].letterSpacing,
                                                    textTransform: FONT_STYLES[key].textTransform as any,
                                                },
                                            ]}
                                        >
                                            {FONT_STYLES[key].label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* ── Color picker ── */}
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.colorRow}
                            >
                                {TEXT_COLORS.map((c) => (
                                    <TouchableOpacity
                                        key={c}
                                        onPress={() => setEditingColor(c)}
                                        style={[
                                            styles.colorDot,
                                            { backgroundColor: c },
                                            editingColor === c && styles.colorDotSelected,
                                        ]}
                                    />
                                ))}
                            </ScrollView>
                        </View>
                    </TouchableWithoutFeedback>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#fff' },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { color: '#000', fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },

    // Next button
    nextBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 2,
        backgroundColor: '#0095f6', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    },
    nextBtnDisabled: { opacity: 0.4 },
    nextBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

    // Preview
    preview: {
        width: SCREEN_W,
        height: PREVIEW_H,
        backgroundColor: '#f5f5f5',
        overflow: 'hidden',
    },
    previewImg: { width: '100%', height: '100%' },

    // Aa button
    aaBtn: {
        position: 'absolute',
        top: 12,
        left: 14,
        backgroundColor: 'rgba(255,255,255,0.85)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
    },
    aaBtnText: { color: '#000', fontSize: 17, fontWeight: '700' },

    // Drag hint
    dragHint: {
        position: 'absolute',
        bottom: 8,
        alignSelf: 'center',
        backgroundColor: 'rgba(255,255,255,0.8)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
    },
    dragHintText: { color: 'rgba(0,0,0,0.6)', fontSize: 11 },

    // Text overlay on preview
    textOverlay: {
        position: 'absolute',
        maxWidth: SCREEN_W - 20,
    },
    overlayText: {
        fontSize: 26,
        fontWeight: '700',
        textShadowColor: 'rgba(255,255,255,0.3)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 4,
    },

    // Gallery
    recentsRow: { paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
    recentsLabel: { color: '#000', fontSize: 16, fontWeight: '700' },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    row: { gap: 1, marginBottom: 1 },
    tile: { position: 'relative', overflow: 'hidden', backgroundColor: '#f0f0f0' },
    tileImg: { width: '100%', height: '100%' },
    cameraTile: { backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center', gap: 6 },
    cameraLabel: { color: '#000', fontSize: 12, fontWeight: '600' },
    videoBadge: {
        position: 'absolute', bottom: 4, right: 4,
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 4,
        paddingHorizontal: 4, paddingVertical: 2, gap: 3,
    },
    videoDuration: { color: '#000', fontSize: 10, fontWeight: '600' },
    selectedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,149,246,0.15)' },
    selectedDot: {
        position: 'absolute', top: 6, right: 6,
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: '#0095f6', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: '#fff',
    },

    // Permission
    permissionBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
    permissionText: { color: '#000', fontSize: 17, fontWeight: '700', textAlign: 'center' },
    permissionSub: { color: '#666', fontSize: 14, textAlign: 'center' },


    // ── Text Editor Modal ──
    textEditorBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
    textEditorHeader: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8,
    },
    doneBtn: {
        paddingHorizontal: 16, paddingVertical: 8,
        backgroundColor: '#0095f6', borderRadius: 20,
    },
    doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    textEditorPreview: {
        width: SCREEN_W,
        height: SCREEN_W * 0.75,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    textEditorOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    textInput: {
        fontSize: 28,
        fontWeight: '700',
        width: SCREEN_W - 40,
        textAlign: 'center',
        color: '#fff',
        zIndex: 10,
    },

    // Font style row
    fontStyleRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        paddingVertical: 14,
        gap: 12,
    },
    fontStyleBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
    },
    fontStyleBtnActive: {
        backgroundColor: '#fff',
        borderColor: '#fff',
    },
    fontStyleLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontWeight: '600',
    },
    fontStyleLabelActive: {
        color: '#000',
    },

    // Color picker
    colorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 10,
        paddingBottom: 24,
    },
    colorDot: {
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    colorDotSelected: {
        borderWidth: 3,
        borderColor: '#fff',
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 4,
        elevation: 4,
    },
});
