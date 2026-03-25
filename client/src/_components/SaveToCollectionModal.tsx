/**
 * SaveToCollectionModal
 * 4-screen bottom sheet: list → new → visibility → invite
 */
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from '../_services/apiService';

const { height: SCREEN_H } = Dimensions.get('window');

// ─── Types ───────────────────────────────────────────────────────────────────

interface Collection {
    _id: string;
    name: string;
    coverImage?: string;
    postIds: string[];
    visibility: 'public' | 'private' | 'specific';
    collaborators: { userId: string }[];
    userId: string; // owner
}

interface User {
    _id: string;
    firebaseUid: string;
    displayName: string;
    name?: string;
    uid?: string;
    avatar?: string;
    username?: string;
}

type Screen = 'list' | 'new' | 'visibility' | 'invite';

interface Props {
    visible: boolean;
    onClose: () => void;
    postId: string;
    postImageUrl?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SaveToCollectionModal({ visible, onClose, postId, postImageUrl }: Props) {
    const insets = useSafeAreaInsets();

    // Screen
    const [screen, setScreen] = useState<Screen>('list');

    // Collections list
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loadingCollections, setLoadingCollections] = useState(false);

    // New collection form
    const [newName, setNewName] = useState('');
    const [newVisibility, setNewVisibility] = useState<'public' | 'private' | 'specific'>('private');
    const [newCollaborators, setNewCollaborators] = useState<User[]>([]);
    const [allowedUsers, setAllowedUsers] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    // Invite screen
    const [followers, setFollowers] = useState<User[]>([]);
    const [followerSearch, setFollowerSearch] = useState('');
    const [loadingFollowers, setLoadingFollowers] = useState(false);
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [searching, setSearching] = useState(false);
    // Groups screen
    const [groups, setGroups] = useState<any[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [tempSelectedGroups, setTempSelectedGroups] = useState<string[]>([]);
    const [tempSelectedCollaborators, setTempSelectedCollaborators] = useState<User[]>([]);

    const [isUpdating, setIsUpdating] = useState(false);
    const nameInputRef = useRef<TextInput>(null);
    const [currentUid, setCurrentUid] = useState<string | null>(null);

    // Load canonical userId once on mount
    useEffect(() => {
        AsyncStorage.getItem('userId').then(id => setCurrentUid(id));
    }, []);

    // ── Load on open ──────────────────────────────────────────────────────────

    useEffect(() => {
        if (visible) {
            setScreen('list');
            setNewName('');
            setNewVisibility('private');
            setNewCollaborators([]);
            setAllowedUsers([]);
            setTempSelectedCollaborators([]);
            setTempSelectedGroups([]);
            loadCollections();
            loadGroups();
        }
    }, [visible]);

    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (followerSearch.trim().length > 1) {
                setSearching(true);
                try {
                    const res = await apiService.get(`/users/search?q=${encodeURIComponent(followerSearch)}&requesterUserId=${currentUid}`);
                    if (res?.success && Array.isArray(res.data)) {
                        const normalized = res.data.map((u: any) => ({
                            ...u,
                            uid: u._id || u.firebaseUid,
                            name: u.displayName || u.name || 'User',
                            avatar: u.avatar || u.photoURL || u.profilePicture || ''
                        }));
                        setSearchResults(normalized);
                    }
                } catch (e) {
                    console.error('[SaveToCollectionModal] search error', e);
                } finally {
                    setSearching(false);
                }
            } else {
                setSearchResults([]);
            }
        }, 500);
        return () => clearTimeout(delayDebounceFn);
    }, [followerSearch, currentUid]);

    const loadCollections = useCallback(async () => {
        if (!currentUid) return;
        setLoadingCollections(true);
        try {
            const res = await apiService.get(`/users/${currentUid}/sections`);
            if (res?.success && Array.isArray(res.data)) setCollections(res.data);
            else setCollections([]);
        } catch {
            setCollections([]);
        } finally {
            setLoadingCollections(false);
        }
    }, [currentUid]);

    const loadFollowers = useCallback(async () => {
        if (!currentUid) return;
        setLoadingFollowers(true);
        try {
            const res = await apiService.get(`/users/${currentUid}/followers`);
            const list = res?.data || res || [];
            setFollowers(Array.isArray(list) ? list : []);
        } catch {
            setFollowers([]);
        } finally {
            setLoadingFollowers(false);
        }
    }, [currentUid]);

    const loadGroups = useCallback(async () => {
        if (!currentUid) return;
        setLoadingGroups(true);
        try {
            const res = await apiService.get(`/groups?userId=${currentUid}`);
            if (res?.success && Array.isArray(res.data)) setGroups(res.data);
            else setGroups([]);
        } catch {
            setGroups([]);
        } finally {
            setLoadingGroups(false);
        }
    }, [currentUid]);

    // ── Actions ───────────────────────────────────────────────────────────────

    const addPostToCollection = async (collectionId: string) => {
        if (!currentUid || isUpdating) return;
        setIsUpdating(true);
        try {
            console.log('[SaveToCollectionModal] Adding post:', postId, 'to collection:', collectionId);
            const res = await apiService.put(`/users/${currentUid}/sections/${collectionId}`, { addPostId: postId });
            if (res?.success) {
                console.log('[SaveToCollectionModal] Post added successfully');
                // Update local collections state if visible on the screen behind
                setCollections(prev => prev.map(c => 
                    c._id === collectionId 
                    ? { ...c, postIds: [...(c.postIds || []), postId] } 
                    : c
                ));
                // Important: Close and trigger parent refresh
                onClose();
            } else {
              console.error('[SaveToCollectionModal] Failed to add post:', res?.error || 'Unknown error');
              Alert.alert('Error', 'Failed to add post to collection');
            }
        } catch (e) {
            console.error('[SaveToCollectionModal] addPostToCollection error', e);
            Alert.alert('Error', 'An error occurred while adding the post');
        } finally {
            setIsUpdating(false);
        }
    };

    const createCollection = async () => {
        if (!currentUid || !newName.trim()) return;
        setSaving(true);
        try {
            const res = await apiService.post(`/users/${currentUid}/sections`, {
                name: newName.trim(),
                postIds: postId ? [postId] : [],
                coverImage: postImageUrl || undefined,
                visibility: newVisibility,
                collaborators: newCollaborators.map(u => u.uid || u.firebaseUid || u._id),
                allowedUsers: allowedUsers,
                allowedGroups: tempSelectedGroups,
            });
            if (res?.success) {
                setCollections(prev => [...prev, res.data]);
                // Ensure we also refresh the underlying screen if needed
            }
        } catch (e) {
            console.error('createCollection error', e);
        } finally {
            setSaving(false);
        }
        onClose();
    };

    // ── Screen transitions ────────────────────────────────────────────────────

    const goToNew = () => {
        setScreen('new');
        setTimeout(() => nameInputRef.current?.focus(), 350);
    };

    const goToVisibility = () => setScreen('visibility');

    const goToInvite = () => {
        console.log('[SaveToCollectionModal] 🙋 Navigating to Invite screen');
        setTempSelectedCollaborators([...newCollaborators]);
        setFollowerSearch('');
        setScreen('invite');
        loadFollowers();
    };

    const confirmInvite = () => {
        Keyboard.dismiss();
        setNewCollaborators([...tempSelectedCollaborators]);
        setScreen('new');
    };

    const confirmVisibility = (v: 'public' | 'private' | 'specific') => {
        Keyboard.dismiss();
        setNewVisibility(v);
        // If specific, we stay on a sub-screen or update something?
        // Actually, if 'specific' is clicked, we'll show groups in the same renderVisibility or a sub-section
        if (v !== 'specific') setScreen('new');
    };

    const toggleGroup = (group: any) => {
        const gid = group._id;
        setTempSelectedGroups(prev => {
            const exists = prev.some(sid => String(sid) === String(gid));
            const next = exists 
                ? prev.filter(sid => String(sid) !== String(gid)) 
                : [...prev, String(gid)];
            
            // Sync allowedUsers
            let allMembers: string[] = [];
            groups.filter(g => next.some(sid => String(sid) === String(g._id))).forEach(g => {
                if (Array.isArray(g.members)) allMembers = [...allMembers, ...g.members];
            });
            setAllowedUsers([...new Set(allMembers)]);
            
            return next;
        });
    };

    const goBack = () => {
        Keyboard.dismiss();
        if (screen === 'new') setScreen('list');
        else if (screen === 'visibility' || screen === 'invite') setScreen('new');
        else onClose();
    };

    // ── Render helpers ────────────────────────────────────────────────────────

    const isSaved = (col: Collection) => col.postIds?.includes(postId);

    const isSameUser = (u1: any, u2: any) => {
        if (!u1 || !u2) return false;
        if (typeof u1 === 'string' && typeof u2 === 'string') return u1 === u2;
        
        const getIds = (u: any) => {
            if (typeof u === 'string') return [u];
            return [
                u._id ? String(u._id) : null,
                u.id ? String(u.id) : null,
                u.uid ? String(u.uid) : null,
                u.firebaseUid ? String(u.firebaseUid) : null
            ].filter(Boolean);
        };
        const ids1 = getIds(u1);
        const ids2 = getIds(u2);
        return ids1.some(id => ids2.includes(id));
    };

    const toggleTempCollab = (user: User) => {
        setTempSelectedCollaborators(prev => {
            const exists = prev.some(u => isSameUser(u, user));
            if (exists) {
                return prev.filter(u => !isSameUser(u, user));
            }
            return [...prev, user];
        });
    };


    // ─── Common header ────────────────────────────────────────────────────────

    const Header = ({ title, onLeft, leftLabel = 'Cancel', rightLabel = 'Save', onRight, rightDisabled = false }: {
        title: string;
        onLeft?: () => void;
        leftLabel?: string;
        rightLabel?: string;
        onRight?: () => void;
        rightDisabled?: boolean;
    }) => (
        <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={onLeft || goBack}>
                <Text style={styles.headerLeft}>{leftLabel}</Text>
            </TouchableOpacity>
            <View style={styles.headerDragBar} />
            <Text style={styles.headerTitle}>{title}</Text>
            {onRight ? (
                <TouchableOpacity style={styles.headerBtn} onPress={onRight} disabled={rightDisabled}>
                    <Text style={[styles.headerRight, rightDisabled && styles.headerRightDisabled]}>{rightLabel}</Text>
                </TouchableOpacity>
            ) : (
                <View style={styles.headerBtn} />
            )}
        </View>
    );

    // ─── Screen: list ────────────────────────────────────────────────────────

    const renderList = () => (
        <>
            <Header
                title="Collection"
                leftLabel="Cancel"
                rightLabel="New collection"
                onLeft={onClose}
                onRight={goToNew}
            />

            {loadingCollections ? (
                <View style={styles.center}>
                    <ActivityIndicator color="#0A3D62" />
                </View>
            ) : collections.length === 0 ? (
                // ── Empty state ──
                <View style={styles.emptyState}>
                    <View style={styles.emptyIconWrap}>
                        <Feather name="bookmark" size={36} color="#0A3D62" />
                    </View>
                    <Text style={styles.emptyTitle}>Organize the post you love</Text>
                    <Text style={styles.emptySubtitle}>
                        Save posts and pictures just for you or to share with others.
                    </Text>
                    <TouchableOpacity style={styles.emptyBtn} onPress={goToNew}>
                        <Text style={styles.emptyBtnText}>Create your first collection</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                // ── Collections list ──
                <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
                    {collections.map(col => (
                        <TouchableOpacity
                            key={col._id}
                            style={styles.collRow}
                            onPress={() => addPostToCollection(col._id)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.collThumb}>
                                {col.coverImage ? (
                                    <ExpoImage
                                        source={{ uri: col.coverImage }}
                                        style={styles.collThumbImg}
                                        contentFit="cover"
                                    />
                                ) : (
                                    <View style={[styles.collThumbImg, styles.collThumbPlaceholder]}>
                                        <Feather name="image" size={20} color="#ccc" />
                                    </View>
                                )}
                            </View>
                            <Text style={styles.collName}>{col.name}</Text>
                            {isSaved(col) ? (
                                <Ionicons name="checkmark-circle" size={24} color="#0A3D62" />
                            ) : (
                                <Ionicons name="add-circle-outline" size={24} color="#aaa" />
                            )}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}
        </>
    );

    // ─── Screen: new ─────────────────────────────────────────────────────────

    const renderNew = () => (
        <>
            <Header
                title="New collection"
                onLeft={() => setScreen('list')}
                onRight={createCollection}
                rightDisabled={saving || !newName.trim()}
                rightLabel={saving ? '...' : 'Save'}
            />
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
                {/* Post thumbnail */}
                {postImageUrl ? (
                    <ExpoImage
                        source={{ uri: postImageUrl }}
                        style={styles.newPostThumb}
                        contentFit="cover"
                    />
                ) : (
                    <View style={[styles.newPostThumb, styles.collThumbPlaceholder]}>
                        <Feather name="image" size={40} color="#ccc" />
                    </View>
                )}

                {/* Name input */}
                <View style={styles.inputWrap}>
                    <TextInput
                        ref={nameInputRef}
                        style={styles.nameInput}
                        placeholder="Collection name"
                        placeholderTextColor="#bbb"
                        value={newName}
                        onChangeText={setNewName}
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                    />
                </View>

                {/* Visibility row */}
                <TouchableOpacity style={styles.optionRow} onPress={goToVisibility}>
                    <Ionicons name="eye-outline" size={20} color="#444" />
                    <Text style={styles.optionLabel}>Visibility</Text>
                    <View style={styles.optionRight}>
                        <Text style={styles.optionValue}>
                            {newVisibility === 'public' ? 'Public' : newVisibility === 'private' ? 'Private' : 'Specific'}
                        </Text>
                        <Feather name="chevron-right" size={18} color="#aaa" />
                    </View>
                </TouchableOpacity>

                {/* Invite row */}
                <TouchableOpacity style={styles.optionRow} onPress={goToInvite}>
                    <Ionicons name="person-add-outline" size={20} color="#444" />
                    <Text style={styles.optionLabel}>Invite an other person to collaborate</Text>
                    <Feather name="chevron-right" size={18} color="#aaa" />
                </TouchableOpacity>

                {/* Visibility/Group indicator */}
                {newVisibility === 'specific' && tempSelectedGroups.length > 0 && (
                    <View style={styles.collabInfo}>
                        <Ionicons name="people-outline" size={14} color="#0A3D62" />
                        <Text style={styles.collabChips}>
                            Visible to: {groups.filter(g => tempSelectedGroups.includes(g._id)).map(g => g.name).join(', ')}
                        </Text>
                    </View>
                )}

                {/* Collaborator chips */}
                {newCollaborators.length > 0 && (
                    <View style={styles.collabInfo}>
                        <Ionicons name="person-add-outline" size={14} color="#0A3D62" />
                        <Text style={styles.collabChips}>
                            Collaborators: {newCollaborators.map(u => u.displayName || u.username).join(', ')}
                        </Text>
                    </View>
                )}
            </ScrollView>
        </>
    );

    // ─── Screen: visibility ───────────────────────────────────────────────────

    const renderVisibility = () => {
        const options: { key: 'public' | 'private'; label: string; sub: string }[] = [
            { key: 'public', label: 'Public', sub: 'Anyone can see this collection' },
            { key: 'private', label: 'Private', sub: 'Only you can see this collection' },
        ];
        return (
            <>
                <Header title="Visibility" onLeft={() => setScreen('new')} />
                <ScrollView style={{ flex: 1 }}>
                    {options.map(opt => (
                        <View key={opt.key}>
                            <TouchableOpacity
                                style={styles.radioRow}
                                onPress={() => confirmVisibility(opt.key)}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.radioLabel}>{opt.label}</Text>
                                    <Text style={styles.radioSub}>{opt.sub}</Text>
                                </View>
                                <View style={[
                                    styles.radioCircle,
                                    newVisibility === opt.key && styles.radioCircleSelected,
                                ]}>
                                    {newVisibility === opt.key && <View style={styles.radioDot} />}
                                </View>
                            </TouchableOpacity>
                        </View>
                    ))}
                </ScrollView>
            </>
        );
    };

    // ─── Screen: invite ───────────────────────────────────────────────────────

    const renderInvite = () => (
        <>
            <Header
                title="Invite"
                onLeft={() => setScreen('new')}
                rightLabel="Save"
                onRight={confirmInvite}
            />
            {/* Search */}
            <View style={[styles.searchWrap, { height: 46, borderRadius: 23, backgroundColor: '#f5f7fa', borderWidth: 1, borderColor: '#eef0f2', marginVertical: 12, paddingHorizontal: 16 }]}>
                <Feather name="search" size={18} color="#0A3D62" style={{ marginRight: 8 }} />
                <TextInput
                    style={[styles.searchInput, { fontSize: 15 }]}
                    placeholder="Search people to invite..."
                    placeholderTextColor="#99aab5"
                    value={followerSearch}
                    onChangeText={setFollowerSearch}
                    autoFocus={false}
                />
                {followerSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setFollowerSearch('')}>
                        <Ionicons name="close-circle" size={18} color="#ccc" />
                    </TouchableOpacity>
                )}
            </View>
            {searching ? (
                <View style={styles.center}><ActivityIndicator color="#0A3D62" /></View>
            ) : (
                <FlatList
                    data={followerSearch.trim().length > 1 ? searchResults : followers.filter(f => 
                        (f.name || f.username || '').toLowerCase().includes(followerSearch.toLowerCase())
                    )}
                    keyExtractor={u => u._id || u.firebaseUid || u.uid || String(Math.random())}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => {
                        const sel = tempSelectedCollaborators.some(u => isSameUser(u, item));
                        return (
                            <TouchableOpacity style={styles.userRow} onPress={() => toggleTempCollab(item)}>
                                {item.avatar ? (
                                    <ExpoImage source={{ uri: item.avatar }} style={styles.userAvatar} contentFit="cover" />
                                ) : (
                                    <View style={[styles.userAvatar, styles.userAvatarPlaceholder]}>
                                        <Feather name="user" size={20} color="#ccc" />
                                    </View>
                                )}
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.userName}>{item.name || item.username}</Text>
                                    {item.username ? <Text style={styles.userHandle}>@{item.username}</Text> : null}
                                </View>
                                <View style={[styles.radioCircle, sel && styles.radioCircleSelected]}>
                                    {sel && <View style={styles.radioDot} />}
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                />
            )}
        </>
    );

    // ─── Root render ──────────────────────────────────────────────────────────

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={goBack}
            statusBarTranslucent
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.backdrop} />
            </TouchableWithoutFeedback>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                enabled={Platform.OS === 'ios'}
                style={styles.kavWrapper}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
                <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
                    {/* Drag handle */}
                    <View style={styles.dragHandle} />

                    {screen === 'list' && renderList()}
                    {screen === 'new' && renderNew()}
                    {screen === 'visibility' && renderVisibility()}
                    {screen === 'invite' && renderInvite()}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    // Modal structure
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    kavWrapper: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: SCREEN_H * 0.88,
        minHeight: 320,
        overflow: 'hidden',
    },
    dragHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#ddd',
        alignSelf: 'center',
        marginTop: 10,
        marginBottom: 2,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#eee',
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    headerDragBar: { flex: 1 },
    headerBtn: { minWidth: 80 },
    headerTitle: {
        position: 'absolute',
        left: 0, right: 0,
        textAlign: 'center',
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    headerLeft: {
        fontSize: 15,
        color: '#555',
        fontWeight: '500',
    },
    headerRight: {
        fontSize: 15,
        color: '#0A3D62',
        fontWeight: '700',
        textAlign: 'right',
    },
    headerRightDisabled: {
        color: '#bbb',
    },

    // Empty state
    emptyState: {
        alignItems: 'center',
        paddingHorizontal: 32,
        paddingVertical: 40,
    },
    emptyIconWrap: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#EFF3F8',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#111',
        marginBottom: 8,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: 13,
        color: '#888',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 28,
    },
    emptyBtn: {
        backgroundColor: '#0A3D62',
        borderRadius: 10,
        paddingVertical: 14,
        paddingHorizontal: 32,
        width: '100%',
        alignItems: 'center',
    },
    emptyBtnText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },

    // Collection row
    collRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#f0f0f0',
    },
    collThumb: {
        width: 52,
        height: 52,
        borderRadius: 10,
        overflow: 'hidden',
        marginRight: 14,
    },
    collThumbImg: {
        width: '100%',
        height: '100%',
    },
    collThumbPlaceholder: {
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    collName: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
        color: '#111',
    },

    // New collection
    newPostThumb: {
        width: 130,
        height: 130,
        borderRadius: 12,
        alignSelf: 'center',
        marginVertical: 20,
        backgroundColor: '#f0f0f0',
    },
    inputWrap: {
        marginHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#ddd',
        marginBottom: 8,
    },
    nameInput: {
        fontSize: 16,
        color: '#111',
        paddingVertical: 12,
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#f0f0f0',
        gap: 12,
    },
    optionLabel: {
        flex: 1,
        fontSize: 14,
        color: '#222',
    },
    optionRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    optionValue: {
        fontSize: 13,
        color: '#888',
    },
    collabInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginTop: 8,
        gap: 6,
    },
    collabChips: {
        fontSize: 13,
        color: '#0A3D62',
        fontWeight: '500',
    },

    // Visibility screen
    radioRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#f0f0f0',
    },
    radioLabel: {
        fontSize: 15,
        color: '#111',
        fontWeight: '600',
        marginBottom: 2,
    },
    radioSub: {
        fontSize: 12,
        color: '#999',
    },
    radioCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#ccc',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 12,
    },
    radioCircleSelected: {
        borderColor: '#0A3D62',
    },
    radioDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#0A3D62',
    },

    // Groups in visibility
    groupSection: {
        backgroundColor: '#fafafa',
        paddingHorizontal: 16,
        paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#eee',
    },
    groupRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        gap: 12,
    },
    groupName: {
        fontSize: 14,
        color: '#444',
    },
    groupNameSelected: {
        color: '#0A3D62',
        fontWeight: '600',
    },
    infoText: {
        fontSize: 12,
        color: '#999',
        fontStyle: 'italic',
        marginVertical: 10,
    },
    doneBtn: {
        backgroundColor: '#0A3D62',
        borderRadius: 8,
        paddingVertical: 8,
        alignItems: 'center',
        marginTop: 10,
    },
    doneBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },

    // Invite screen
    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginVertical: 12,
        backgroundColor: '#f5f7fa',
        borderRadius: 23,
        paddingHorizontal: 16,
        paddingVertical: 8,
        height: 46,
        borderWidth: 1,
        borderColor: '#eef0f2',
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: '#111',
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#f5f5f5',
    },
    userAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        marginRight: 12,
    },
    userAvatarPlaceholder: {
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    userName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111',
    },
    userHandle: {
        fontSize: 13,
        color: '#888',
    },

    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
});
