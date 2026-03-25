/**
 * saved.tsx
 * "All Collection" screen — matches design screenshots exactly:
 *  • Top bar: title (left) + "Collections ▾" button (right)
 *  • All saved posts grid
 *  • "Collections ▾" → bottom sheet with: All, collections list (⊗ delete, ✏️ edit)
 *  • Select collection → title changes, grid filters
 *  • Edit → inline edit bottom sheet (name, visibility, invite)
 *  • Delete → CollectionDeleteModal
 */
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CollectionDeleteModal from '@/src/_components/CollectionDeleteModal';
import SaveToCollectionModal from '@/src/_components/SaveToCollectionModal';

const { height: SCREEN_H } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────

interface Collection {
  _id: string;
  name: string;
  coverImage?: string;
  postIds: string[];
  visibility?: 'public' | 'private' | 'specific';
  collaborators?: any[];
  allowedUsers?: string[];
  allowedGroups?: string[];
  userId: string;
}

interface SavedPost {
  id: string;
  imageUrl: string;
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SavedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const targetUserId = typeof params.userId === 'string' ? params.userId : null;
  const insets = useSafeAreaInsets();
  const [uid, setUid] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Removed redundant useEffect, now handled by useFocusEffect below

  // Data
  const [collections, setCollections] = useState<Collection[]>([]);
  const [allSavedPosts, setAllSavedPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);

  // Active filter
  const [activeCollection, setActiveCollection] = useState<Collection | null>(null);

  // Modals
  const [collDropdownOpen, setCollDropdownOpen] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);

  // Edit sheet state
  const [editTarget, setEditTarget] = useState<Collection | null>(null);
  const [editName, setEditName] = useState('');
  const [editVisibility, setEditVisibility] = useState<'public' | 'private' | 'specific'>('private');
  const [editCollaborators, setEditCollaborators] = useState<any[]>([]);
  const [editAllowedUsers, setEditAllowedUsers] = useState<string[]>([]);
  const [editAllowedGroups, setEditAllowedGroups] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editSubScreen, setEditSubScreen] = useState<'main' | 'visibility' | 'invite'>('main');

  // Groups and Followers for Visibility/Collabs
  const [groups, setGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [followers, setFollowers] = useState<any[]>([]);
  const [loadingFollowers, setLoadingFollowers] = useState(false);
  const [tempSelectedGroups, setTempSelectedGroups] = useState<string[]>([]);
  const [tempSelectedCollaborators, setTempSelectedCollaborators] = useState<any[]>([]);
  const [followerSearch, setFollowerSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async (forcedUid?: string) => {
    const activeUid = forcedUid || uid;
    if (!activeUid) return;
    setLoading(true);
    try {
      const { apiService } = await import('@/src/_services/apiService');
      const [sectRes, postsRes] = await Promise.all([
        apiService.get(`/users/${activeUid}/sections`, { requesterId: currentUserId || undefined }),
        apiService.get(`/users/${activeUid}/saved`),
      ]);
      if (sectRes?.success && Array.isArray(sectRes.data)) setCollections(sectRes.data);
      const raw = postsRes?.data || postsRes || [];
      if (Array.isArray(raw)) {
        setAllSavedPosts(raw.map((p: any) => ({
          id: p._id || p.id,
          imageUrl: p.mediaUrl || p.imageUrl || (Array.isArray(p.mediaUrls) ? p.mediaUrls[0] : '') || '',
        })));
      }
    } catch (e) {
      console.error('[saved.tsx] Error loading data:', e);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  const loadGroups = useCallback(async () => {
    if (!currentUserId) return;
    setLoadingGroups(true);
    try {
      const { apiService } = await import('@/src/_services/apiService');
      const res = await apiService.get(`/groups?userId=${currentUserId}`);
      if (res?.success && Array.isArray(res.data)) setGroups(res.data);
    } catch (e) { console.error('loadGroups error', e); }
    finally { setLoadingGroups(false); }
  }, [currentUserId]);

  const loadFollowers = useCallback(async () => {
    if (!currentUserId) return;
    setLoadingFollowers(true);
    try {
      const { apiService } = await import('@/src/_services/apiService');
      const res = await apiService.get(`/users/${currentUserId}/followers`);
      const list = res?.data || res || [];
      setFollowers(Array.isArray(list) ? list : []);
    } catch (e) { console.error('loadFollowers error', e); }
    finally { setLoadingFollowers(false); }
  }, [currentUserId]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (followerSearch.trim().length > 1) {
        setSearching(true);
        try {
          const { apiService } = await import('@/src/_services/apiService');
          const res = await apiService.get(`/users/search?q=${encodeURIComponent(followerSearch)}&requesterUserId=${currentUserId}`);
          if (res?.success && Array.isArray(res.data)) {
            const normalized = res.data.map((u: any) => ({
              ...u,
              uid: u._id || u.firebaseUid,
              name: u.displayName || u.name || 'User',
              avatar: u.avatar || u.photoURL || u.profilePicture || ''
            }));
            setSearchResults(normalized);
          }
        } catch (e) { console.error('search error', e); }
        finally { setSearching(false); }
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [followerSearch, currentUserId]);

  const handleModalClose = useCallback(() => {
    setCreateModalVisible(false);
    // Explicitly pass the current uid to ensure we don't use a stale state
    if (uid) {
      console.log('[saved.tsx] Refreshing data after modal close for uid:', uid);
      loadData(uid);
    }
  }, [uid, loadData]);

  // Use useFocusEffect from expo-router to handle tab re-focus and param changes
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const checkUser = async () => {
        const id = await AsyncStorage.getItem('userId');
        if (!isMounted) return;
        setCurrentUserId(id);
        const nextUid = targetUserId || id;
        setUid(nextUid);
        if (nextUid) loadData(nextUid);
      };
      checkUser();
      return () => { isMounted = false; };
    }, [targetUserId, loadData])
  );

  // ── Computed posts ────────────────────────────────────────────────────────

  const displayedPosts: SavedPost[] = activeCollection
    ? allSavedPosts.filter(p => activeCollection.postIds?.includes(p.id))
    : allSavedPosts;

  const isOwner = (col: Collection) => col.userId === (currentUserId || uid);
  const isProfileOwner = !targetUserId || targetUserId === currentUserId;

  // ── Collection selection ──────────────────────────────────────────────────

  const selectCollection = (col: Collection | null) => {
    setActiveCollection(col);
    setCollDropdownOpen(false);
  };

  // ── Edit handlers ─────────────────────────────────────────────────────────

  const openEdit = (col: Collection) => {
    setEditTarget(col);
    setEditName(col.name);
    setEditVisibility((col.visibility as any) || 'private');
    setEditCollaborators(col.collaborators || []);
    setEditAllowedUsers(col.allowedUsers || []);
    setEditAllowedGroups((col as any).allowedGroups || []);
    setEditSubScreen('main');
    setCollDropdownOpen(false);
    
    // Initialize temp states
    setTempSelectedGroups((col as any).allowedGroups || []);
    setTempSelectedCollaborators(col.collaborators || []);
    setFollowerSearch('');
    
    loadGroups();
    loadFollowers();
  };

  const saveEdit = async () => {
    if (!uid || !editTarget || !editName.trim()) return;
    setEditSaving(true);
    try {
      const { apiService } = await import('@/src/_services/apiService');
      const res = await apiService.put(`/users/${uid}/sections/${editTarget._id}`, {
        name: editName.trim(),
        visibility: editVisibility,
        collaborators: editCollaborators.map(u => typeof u === 'string' ? u : (u.firebaseUid || u._id || (u as any).userId)),
        allowedUsers: editAllowedUsers,
        allowedGroups: tempSelectedGroups,
        requesterId: currentUserId
      });
      if (res?.success) {
        setCollections(prev => prev.map(c =>
          c._id === editTarget._id
            ? { ...c, name: editName.trim(), visibility: editVisibility, collaborators: editCollaborators, allowedUsers: editAllowedUsers }
            : c
        ));
        if (activeCollection?._id === editTarget._id) {
          setActiveCollection(prev => prev ? { ...prev, name: editName.trim(), visibility: editVisibility, collaborators: editCollaborators, allowedUsers: editAllowedUsers } : prev);
        }
        setEditTarget(null);
        // Refresh data to be sure
        loadData();
      }
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
    setEditTarget(null);
  };

  const toggleEditGroup = (group: any) => {
    const gid = group._id;
    setTempSelectedGroups(prev => {
      const exists = prev.some(sid => String(sid) === String(gid));
      const next = exists
        ? prev.filter(sid => String(sid) !== String(gid))
        : [...prev, String(gid)];
      
      // Sync editAllowedUsers
      let allMembers: string[] = [];
      groups.filter(g => next.includes(g._id)).forEach(g => {
        if (Array.isArray(g.members)) allMembers = [...allMembers, ...g.members];
      });
      setEditAllowedUsers([...new Set(allMembers)]);
      
      return next;
    });
  };

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

  const toggleEditCollab = (user: any) => {
    setTempSelectedCollaborators(prev => {
      const exists = prev.some((u: any) => isSameUser(u, user));
      if (exists) {
        return prev.filter((u: any) => !isSameUser(u, user));
      }
      return [...prev, user];
    });
  };

  const confirmEditInvite = () => {
    setEditCollaborators([...tempSelectedCollaborators]);
    setEditSubScreen('main');
  };

  // ── Title ─────────────────────────────────────────────────────────────────

  const pageTitle = activeCollection ? activeCollection.name : 'All Collection';

  // ── Thumb helper ──────────────────────────────────────────────────────────

  const getCollThumb = (col: Collection) =>
    col.coverImage
    || allSavedPosts.find(p => col.postIds?.includes(p.id))?.imageUrl
    || '';

  // ─── Renders ──────────────────────────────────────────────────────────────

  // Grid
  const renderGrid = () => {
    if (loading) return <ActivityIndicator color="#0A3D62" style={{ marginTop: 60 }} size="large" />;
    if (displayedPosts.length === 0) return (
      <View style={styles.emptyWrap}>
        <Feather name="bookmark" size={48} color="#ddd" />
        <Text style={styles.emptyText}>
          {activeCollection ? 'No posts in this collection.' : 'No saved posts yet.'}
        </Text>
      </View>
    );
    return (
      <FlatList
        data={displayedPosts}
        keyExtractor={item => item.id}
        numColumns={3}
        contentContainerStyle={styles.grid}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.gridItem}
            onPress={() => router.push({ pathname: '/post-detail', params: { id: item.id } })}
            activeOpacity={0.8}
          >
            <Image source={{ uri: item.imageUrl }} style={styles.gridImg} />
          </TouchableOpacity>
        )}
      />
    );
  };

  // Collections bottom-sheet
  const renderCollDropdown = () => (
    <Modal
      visible={collDropdownOpen}
      transparent
      animationType="slide"
      onRequestClose={() => setCollDropdownOpen(false)}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={() => setCollDropdownOpen(false)}>
        <View style={styles.sheetBackdrop} />
      </TouchableWithoutFeedback>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.dragHandle} />

        {/* "All" row */}
        <TouchableOpacity style={styles.allRow} onPress={() => selectCollection(null)} activeOpacity={0.75}>
          {allSavedPosts[0]?.imageUrl ? (
            <Image source={{ uri: allSavedPosts[0].imageUrl }} style={styles.allThumb} />
          ) : (
            <View style={[styles.allThumb, { backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' }]}>
              <Feather name="image" size={16} color="#ccc" />
            </View>
          )}
          <Text style={[styles.allLabel, !activeCollection && { color: '#0A3D62', fontWeight: '700' }]}>All</Text>
          {!activeCollection && <Feather name="check" size={16} color="#0A3D62" style={{ marginLeft: 'auto' }} />}
        </TouchableOpacity>

        {/* Collections header */}
        <View style={styles.collSectionHeader}>
          <Text style={styles.collSectionTitle}>Collections</Text>
          {isProfileOwner && (
            <TouchableOpacity onPress={() => { setCollDropdownOpen(false); setCreateModalVisible(true); }}>
              <Text style={styles.newCollText}>New collection</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Collections list */}
        <ScrollView style={{ maxHeight: SCREEN_H * 0.48 }} showsVerticalScrollIndicator={false}>
          {collections.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Text style={{ color: '#bbb', fontSize: 14 }}>No collections yet</Text>
            </View>
          ) : (
            collections.map(col => {
              const thumb = getCollThumb(col);
              const active = activeCollection?._id === col._id;
              return (
                <TouchableOpacity
                  key={col._id}
                  style={styles.collRow}
                  onPress={() => selectCollection(col)}
                  activeOpacity={0.75}
                >
                  {/* Thumbnail */}
                  {thumb ? (
                    <ExpoImage source={{ uri: thumb }} style={styles.collThumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.collThumb, styles.thumbPlaceholder]}>
                      <Feather name="image" size={16} color="#ccc" />
                    </View>
                  )}

                  {/* Name */}
                  <Text style={[styles.collName, active && { color: '#0A3D62', fontWeight: '700' }]} numberOfLines={1}>
                    {col.name}
                  </Text>

                  {/* Active check */}
                  {active && <Feather name="check" size={16} color="#0A3D62" style={{ marginRight: 8 }} />}

                  {/* ⊗ Delete (owner only) */}
                  {isProfileOwner && isOwner(col) && (
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        setCollDropdownOpen(false);
                        setDeleteTarget(col);
                      }}
                    >
                      <Ionicons name="close-circle-outline" size={22} color="#aaa" />
                    </TouchableOpacity>
                  )}

                  {/* ✏️ Edit (owner only) */}
                  {isProfileOwner && isOwner(col) && (
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        openEdit(col);
                      }}
                    >
                      <Feather name="edit-2" size={17} color="#aaa" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );

  // Edit collection bottom sheet
  const renderEditSheet = () => {
    if (!editTarget) return null;
    const isOwnerOfColl = editTarget.userId === currentUserId;
    return (
      <Modal
        visible={!!editTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setEditTarget(null)}
        statusBarTranslucent
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.sheetBackdrop} />
        </TouchableWithoutFeedback>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          enabled={Platform.OS === 'ios'}
          style={{ justifyContent: 'flex-end', flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 8, minHeight: SCREEN_H * 0.5 }]}>
            <View style={styles.dragHandle} />

            {editSubScreen === 'main' ? (
              <>
                {/* Header */}
                <View style={styles.editHeader}>
                  <TouchableOpacity onPress={() => setEditTarget(null)}>
                    <Text style={styles.editCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.editTitle}>Edit collection</Text>
                  <TouchableOpacity onPress={saveEdit} disabled={editSaving || !editName.trim()}>
                    <Text style={[styles.editSave, (!editName.trim() || editSaving) && { color: '#ccc' }]}>
                      {editSaving ? '...' : 'Save'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Cover image */}
                {(editTarget.coverImage || getCollThumb(editTarget)) ? (
                  <ExpoImage
                    source={{ uri: editTarget.coverImage || getCollThumb(editTarget) }}
                    style={styles.editCover}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.editCover, styles.thumbPlaceholder]}>
                    <Feather name="image" size={32} color="#ccc" />
                  </View>
                )}

                {/* Name input */}
                <View style={styles.nameInputWrap}>
                  <TextInput
                    style={styles.nameInput}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Collection name"
                    placeholderTextColor="#ccc"
                    returnKeyType="done"
                    editable={isOwnerOfColl}
                  />
                </View>

                {/* Visibility row */}
                {isOwnerOfColl && (
                  <TouchableOpacity style={styles.optionRow} onPress={() => setEditSubScreen('visibility')}>
                    <Ionicons name="eye-outline" size={20} color="#444" />
                    <Text style={styles.optionLabel}>Visibility</Text>
                    <View style={styles.optionRight}>
                      <Text style={styles.optionValue}>
                        {editVisibility === 'public' ? 'Public' : 'Private'}
                      </Text>
                      <Feather name="chevron-right" size={18} color="#aaa" />
                    </View>
                  </TouchableOpacity>
                )}

                {/* Invite row */}
                {isOwnerOfColl && (
                  <TouchableOpacity style={styles.optionRow} onPress={() => { setTempSelectedCollaborators([...editCollaborators]); setEditSubScreen('invite'); }}>
                    <Ionicons name="person-add-outline" size={20} color="#444" />
                    <Text style={styles.optionLabel}>Invite an other person to collaborate</Text>
                    <Feather name="chevron-right" size={18} color="#aaa" />
                  </TouchableOpacity>
                )}

                {/* Collaborator chips */}
                {editCollaborators.length > 0 && (
                    <Text style={styles.collabChipsInline}>
                      Collaborators: {editCollaborators.map(u => {
                        const name = typeof u === 'string' ? u : (u.name || u.displayName || u.username);
                        return name || 'Collaborator';
                      }).join(', ')}
                    </Text>
                )}

                {/* Delete button (Owner only) */}
                {isOwnerOfColl && (
                  <TouchableOpacity 
                    style={[styles.optionRow, { marginTop: 12, borderBottomWidth: 0 }]} 
                    onPress={() => { setDeleteTarget(editTarget); setEditTarget(null); }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#ff3b30" />
                    <Text style={[styles.optionLabel, { color: '#ff3b30' }]}>Delete Collection</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : editSubScreen === 'visibility' ? (
              // Visibility picker
              <>
                <View style={styles.editHeader}>
                  <TouchableOpacity onPress={() => { Keyboard.dismiss(); setEditSubScreen('main'); }}>
                    <Text style={styles.editCancel}>Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.editTitle}>Visibility</Text>
                  <TouchableOpacity onPress={() => { Keyboard.dismiss(); setEditSubScreen('main'); }}>
                    <Text style={styles.editSave}>Done</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ flex: 1 }}>
                  {(['public', 'private'] as const).map(v => (
                    <View key={v}>
                      <TouchableOpacity
                        style={styles.radioRow}
                        onPress={() => { 
                          setEditVisibility(v); 
                          setEditSubScreen('main'); 
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.radioLabel}>
                            {v === 'public' ? 'Public' : 'Private'}
                          </Text>
                          <Text style={styles.radioSub}>
                            {v === 'public' ? 'Anyone can see this' : 'Only you can see this'}
                          </Text>
                        </View>
                        <View style={[styles.radioCircle, editVisibility === v && styles.radioCircleActive]}>
                          {editVisibility === v && <View style={styles.radioDot} />}
                        </View>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </>
            ) : (
              // Invite sub-screen
              <>
                <View style={styles.editHeader}>
                  <TouchableOpacity onPress={() => { Keyboard.dismiss(); setEditSubScreen('main'); }}>
                    <Text style={styles.editCancel}>Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.editTitle}>Invite</Text>
                  <TouchableOpacity onPress={() => { Keyboard.dismiss(); confirmEditInvite(); }}>
                    <Text style={styles.editSave}>Done</Text>
                  </TouchableOpacity>
                </View>
                
                <View style={[styles.searchWrapEdit, { height: 46, borderRadius: 23, backgroundColor: '#f5f7fa', borderWidth: 1, borderColor: '#eef0f2' }]}>
                  <Ionicons name="search" size={18} color="#0A3D62" />
                  <TextInput
                    style={[styles.searchInputEdit, { fontSize: 15 }]}
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
                  <ActivityIndicator color="#0A3D62" style={{ marginTop: 20 }} />
                ) : (
                  <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                    {(followerSearch.trim().length > 1 ? searchResults : followers.filter(f => 
                      (f.name || f.username || '').toLowerCase().includes(followerSearch.toLowerCase())
                    )).map(f => {
                      const sel = tempSelectedCollaborators.some((u: any) => isSameUser(u, f));
                      return (
                        <TouchableOpacity key={f._id || f.uid || f.firebaseUid} style={styles.userRowEdit} onPress={() => toggleEditCollab(f)}>
                          <ExpoImage source={{ uri: f.avatar }} style={styles.userAvatarEdit} contentFit="cover" />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.userNameEdit}>{f.name || f.username}</Text>
                            {f.username ? <Text style={styles.userHandleEdit}>@{f.username}</Text> : null}
                          </View>
                          <View style={[styles.radioCircle, sel && styles.radioCircleActive]}>
                            {sel && <View style={styles.radioDot} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  // ─── Root ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.topTitle} numberOfLines={1}>{pageTitle}</Text>
        <TouchableOpacity style={styles.dropBtn} onPress={() => setCollDropdownOpen(true)} activeOpacity={0.8}>
          <Text style={styles.dropBtnLabel}>Collections</Text>
          <Feather name="chevron-down" size={14} color="#0A3D62" />
        </TouchableOpacity>
      </View>

      {/* All posts / filtered grid */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {renderGrid()}
      </ScrollView>

      {/* Collections bottom sheet */}
      {renderCollDropdown()}

      {/* Edit sheet */}
      {renderEditSheet()}

      {/* Create new collection */}
      <SaveToCollectionModal
        visible={createModalVisible}
        onClose={handleModalClose}
        postId=""
        postImageUrl={undefined}
      />

      {/* Delete modal */}
      <CollectionDeleteModal
        visible={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        collection={deleteTarget}
        allCollections={collections}
        onDeleted={(id) => {
          setCollections(prev => prev.filter(c => c._id !== id));
          setDeleteTarget(null);
          if (activeCollection?._id === id) setActiveCollection(null);
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  topTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    flex: 1,
  },
  dropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF3F8',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  dropBtnLabel: { fontSize: 13, fontWeight: '600', color: '#0A3D62' },

  // Grid
  grid: { padding: 1 },
  gridItem: {
    width: '33.33%',
    aspectRatio: 1,
    padding: 1,
    backgroundColor: '#f0f0f0',
  },
  gridImg: { width: '100%', height: '100%', resizeMode: 'cover' },

  emptyWrap: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyText: { fontSize: 15, color: '#bbb', marginTop: 12, textAlign: 'center' },

  // Bottom sheet
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: SCREEN_H * 0.86,
    overflow: 'hidden',
  },
  dragHandle: {
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginTop: 12, marginBottom: 4,
  },

  // "All" row inside sheet
  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f5f5f5',
  },
  allThumb: {
    width: 44, height: 44,
    borderRadius: 10,
    marginRight: 12,
    overflow: 'hidden',
  },
  allLabel: { fontSize: 15, color: '#111', fontWeight: '500' },

  // Collections section header inside sheet
  collSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  collSectionTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  newCollText: { fontSize: 14, color: '#0A3D62', fontWeight: '600' },

  // Collection row inside sheet
  collRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f8f8f8',
  },
  collThumb: {
    width: 48, height: 48,
    borderRadius: 10,
    marginRight: 12,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  thumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  collName: { flex: 1, fontSize: 14, color: '#111', fontWeight: '500' },
  iconBtn: { padding: 6 },

  // Edit sheet
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  editCancel: { fontSize: 15, color: '#555', fontWeight: '500' },
  editTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  editSave: { fontSize: 15, color: '#0A3D62', fontWeight: '700' },
  editCover: {
    width: 130, height: 130,
    borderRadius: 14,
    alignSelf: 'center',
    marginVertical: 16,
    backgroundColor: '#f0f0f0',
  },
  nameInputWrap: {
    marginHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    marginBottom: 4,
  },
  nameInput: { fontSize: 16, color: '#111', paddingVertical: 10 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  optionLabel: { flex: 1, fontSize: 14, color: '#222' },
  optionRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  optionValue: { fontSize: 13, color: '#888' },

  // Visibility picker
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  radioLabel: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 2 },
  radioSub: { fontSize: 12, color: '#999' },
  radioCircle: {
    width: 20, height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  radioCircleActive: { borderColor: '#0A3D62' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0A3D62' },

  // New Edit sheet styles
  collabInfoInline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    gap: 6,
  },
  collabChipsInline: {
    fontSize: 12,
    color: '#0A3D62',
    fontWeight: '500',
    flex: 1,
  },
  groupSectionEdit: {
    paddingLeft: 44,
    paddingRight: 16,
    paddingBottom: 16,
    backgroundColor: '#fafafa',
  },
  infoText: {
    fontSize: 12,
    color: '#888',
    marginVertical: 8,
    fontStyle: 'italic',
  },
  groupRowEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  groupNameEdit: {
    fontSize: 14,
    color: '#444',
  },
  groupNameSelectedEdit: {
    color: '#0A3D62',
    fontWeight: '700',
  },
  searchWrapEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f7fa',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 23,
    height: 46,
    gap: 10,
    borderWidth: 1,
    borderColor: '#eef0f2',
  },
  searchInputEdit: {
    flex: 1,
    fontSize: 14,
    color: '#111',
  },
  userRowEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  userAvatarEdit: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: '#eee',
  },
  userNameEdit: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  userHandleEdit: {
    fontSize: 13,
    color: '#888',
  },
});
