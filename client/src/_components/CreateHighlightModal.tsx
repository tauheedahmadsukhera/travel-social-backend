import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { createHighlight, uploadImage } from '../../lib/firebaseHelpers/index';
import { getKeyboardOffset, getModalHeight } from '../../utils/responsive';

interface CreateHighlightModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  onSuccess?: () => void;
}

export default function CreateHighlightModal({ visible, onClose, userId, onSuccess }: CreateHighlightModalProps) {
  const [name, setName] = useState('');
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        setCoverImage(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a highlight name');
      return;
    }

    if (!coverImage) {
      Alert.alert('Error', 'Please select a cover image');
      return;
    }

    setLoading(true);

    try {
      // Upload cover image
      const imagePath = `highlights/${userId}/${Date.now()}.jpg`;
      const uploadResult = await uploadImage(coverImage, imagePath);

      if (!uploadResult.success) {
        throw new Error(uploadResult.error);
      }

      // Create highlight
      const result = await createHighlight(userId, name, uploadResult.url || '', []);

      if (result.success) {
        Alert.alert('Success', 'Highlight created successfully!');
        setName('');
        setCoverImage(null);
        onSuccess?.();
        onClose();
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create highlight');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={getKeyboardOffset()}
      >
        <View style={styles.overlay}>
          <TouchableOpacity 
            style={{ flex: 1 }} 
            activeOpacity={1} 
            onPress={onClose}
          />
          <View style={[styles.container, { maxHeight: getModalHeight(0.7) }]}>
            {/* Handle bar */}
            <View style={styles.handle} />
            
            <Text style={styles.header}>Create Highlight</Text>

            {/* Cover Image Picker */}
            <TouchableOpacity style={styles.imagePicker} onPress={handlePickImage}>
              {coverImage ? (
                <Image source={{ uri: coverImage }} style={styles.coverImage} />
              ) : (
                <View style={styles.placeholderContainer}>
                  <Ionicons name="image-outline" size={48} color="#ccc" />
                  <Text style={styles.placeholderText}>Tap to select cover</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Name Input */}
            <TextInput
              style={styles.input}
              placeholder="Highlight Name"
              placeholderTextColor="#999"
              value={name}
              onChangeText={setName}
              maxLength={30}
            />

            {/* Create Button */}
            <TouchableOpacity 
              style={[styles.createBtn, loading && styles.createBtnDisabled]} 
              onPress={handleCreate}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="add-circle" size={24} color="#fff" />
                  <Text style={styles.createText}>Create Highlight</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Cancel Button */}
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#ddd',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222',
    textAlign: 'center',
    marginBottom: 24,
  },
  imagePicker: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignSelf: 'center',
    marginBottom: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#0A3D62',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  placeholderContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#222',
    marginBottom: 20,
  },
  createBtn: {
    backgroundColor: '#0A3D62',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  createBtnDisabled: {
    opacity: 0.6,
  },
  createText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  cancelBtn: {
    padding: 16,
    alignItems: 'center',
  },
  cancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
});


