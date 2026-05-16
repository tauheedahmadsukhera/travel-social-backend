import React from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';

interface NewCollectionScreenProps {
  postImageUrl?: string;
  newName: string;
  setNewName: (text: string) => void;
  newVisibility: 'public' | 'private' | 'specific';
  newCollaborators: any[];
  tempSelectedGroups: any[];
  groups: any[];
  onGoToVisibility: () => void;
  onGoToInvite: () => void;
  onCreateCollection: () => void;
  onGoBack: () => void;
  saving: boolean;
  nameInputRef: any;
  Header: any;
}

export const NewCollectionScreen: React.FC<NewCollectionScreenProps> = ({
  postImageUrl,
  newName,
  setNewName,
  newVisibility,
  newCollaborators,
  tempSelectedGroups,
  groups,
  onGoToVisibility,
  onGoToInvite,
  onCreateCollection,
  onGoBack,
  saving,
  nameInputRef,
  Header,
}) => {
  return (
    <>
      <Header
        title="New collection"
        onLeft={onGoBack}
        onRight={onCreateCollection}
        rightDisabled={saving || !newName.trim()}
        rightLabel={saving ? '...' : 'Save'}
      />
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
        {postImageUrl ? (
          <View style={styles.newPostThumbContainer}>
            <ExpoImage source={{ uri: postImageUrl }} style={styles.newPostThumb} contentFit="cover" />
          </View>
        ) : (
          <View style={[styles.newPostThumbContainer, styles.collThumbPlaceholder]}>
            <Feather name="image" size={40} color="#ccc" />
          </View>
        )}

        <View style={styles.newInputContainer}>
          <TextInput
            ref={nameInputRef}
            style={styles.newNameInput}
            placeholder="Collection name"
            placeholderTextColor="#999"
            value={newName}
            onChangeText={setNewName}
            returnKeyType="done"
          />
          {newName.length > 0 && (
            <TouchableOpacity onPress={() => setNewName('')} style={styles.clearInput}>
              <Ionicons name="close-circle" size={18} color="#ccc" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.newOptionRow} onPress={onGoToVisibility}>
          <Ionicons name="eye-outline" size={20} color="#444" />
          <Text style={styles.newOptionLabel}>Visibility</Text>
          <View style={styles.optionRight}>
            <Text style={styles.optionValue}>
              {newVisibility === 'public' ? 'Public' : newVisibility === 'private' ? 'Private' : 'Specific'}
            </Text>
            <Feather name="chevron-right" size={18} color="#aaa" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.newOptionRow} onPress={onGoToInvite}>
          <Ionicons name="person-add-outline" size={20} color="#444" />
          <Text style={styles.newOptionLabel}>Add people to collection</Text>
          <Feather name="chevron-right" size={18} color="#aaa" />
        </TouchableOpacity>

        {newVisibility === 'specific' && tempSelectedGroups.length > 0 && (
          <View style={styles.collabInfo}>
            <Ionicons name="people-outline" size={14} color="#0A3D62" />
            <Text style={styles.collabChips}>
              Visible to: {groups.filter(g => tempSelectedGroups.includes(g._id)).map(g => g.name).join(', ')}
            </Text>
          </View>
        )}

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
};

const styles = StyleSheet.create({
  newPostThumbContainer: { width: '100%', height: 180, backgroundColor: '#f0f0f0', marginBottom: 20 },
  newPostThumb: { width: '100%', height: '100%' },
  collThumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' },
  newInputContainer: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', marginHorizontal: 16, paddingBottom: 8, marginBottom: 20 },
  newNameInput: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111', paddingVertical: 8 },
  clearInput: { padding: 4 },
  newOptionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f9f9f9' },
  newOptionLabel: { flex: 1, fontSize: 15, color: '#111', marginLeft: 12 },
  optionRight: { flexDirection: 'row', alignItems: 'center' },
  optionValue: { fontSize: 14, color: '#666', marginRight: 6 },
  collabInfo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 12 },
  collabChips: { flex: 1, fontSize: 13, color: '#0A3D62', marginLeft: 8, fontWeight: '600' },
});
