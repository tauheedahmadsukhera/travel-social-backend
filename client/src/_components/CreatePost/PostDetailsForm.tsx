import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DEFAULT_AVATAR_URL } from '../../../lib/api';

interface PostDetailsFormProps {
  caption: string;
  setCaption: (text: string) => void;
  hashtags: string[];
  hashtagInput: string;
  onHashtagInputChange: (text: string) => void;
  onHashtagCommit: () => void;
  onRemoveTag: (tag: string) => void;
  selectedCategories: { name: string; image: string }[];
  onOpenCategories: () => void;
  onRemoveCategory: (name: string) => void;
  locationName?: string;
  onOpenLocation: () => void;
  verifiedLocationName?: string;
  onOpenVerifiedLocation: () => void;
  taggedUsers: any[];
  onOpenTagPeople: () => void;
  onRemoveTaggedUser: (uid: string) => void;
  visibility: string;
  onOpenVisibility: () => void;
}

const PostDetailsForm: React.FC<PostDetailsFormProps> = ({
  caption, setCaption, hashtags, hashtagInput, onHashtagInputChange, onHashtagCommit, onRemoveTag,
  selectedCategories, onOpenCategories, onRemoveCategory, locationName, onOpenLocation,
  verifiedLocationName, onOpenVerifiedLocation, taggedUsers, onOpenTagPeople, onRemoveTaggedUser,
  visibility, onOpenVisibility
}) => {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ paddingHorizontal: 15 }}>
        {/* Caption Input Row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' }}>
          <Feather name="align-justify" size={20} color="#000" style={{ marginRight: 15 }} />
          <TextInput
            style={{ flex: 1, fontSize: 16, color: '#000' }}
            placeholder="Add a text"
            placeholderTextColor="#666"
            value={caption}
            onChangeText={setCaption}
            multiline={false}
          />
        </View>

        {/* Tags Row */}
        <View style={{ borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
            <Feather name="hash" size={20} color="#000" style={{ marginRight: 15 }} />
            <TextInput
              style={{ flex: 1, fontSize: 16, color: '#000' }}
              placeholder="Add tags"
              placeholderTextColor="#666"
              value={hashtagInput}
              onChangeText={onHashtagInputChange}
              onSubmitEditing={onHashtagCommit}
            />
          </View>
          {hashtags.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 10, paddingLeft: 35 }}>
              {hashtags.map(tag => (
                <View key={tag} style={{ backgroundColor: '#f0f0f0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 15, flexDirection: 'row', alignItems: 'center', marginRight: 8, marginBottom: 5 }}>
                  <Text style={{ color: '#333', fontSize: 12 }}>#{tag}</Text>
                  <TouchableOpacity onPress={() => onRemoveTag(tag)} style={{ marginLeft: 5 }}>
                    <Feather name="x" size={12} color="#666" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Category Row */}
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' }} onPress={onOpenCategories}>
          <Feather name="bookmark" size={20} color="#000" style={{ marginRight: 15 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: selectedCategories.length > 0 ? '#000' : '#666' }}>
              {selectedCategories.length > 0 ? selectedCategories.map(c => c.name).join(', ') : 'Add a category for the home feed'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Location Row */}
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' }} onPress={onOpenLocation}>
          <Feather name="map-pin" size={20} color="#000" style={{ marginRight: 15 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: locationName ? '#000' : '#666' }}>
              {locationName || 'Add a location'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Verified Location Row */}
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' }} onPress={onOpenVerifiedLocation}>
          <Feather name="award" size={20} color="#000" style={{ marginRight: 15 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: verifiedLocationName ? '#000' : '#666' }}>
              {verifiedLocationName || 'Add a verified location'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Tag People Row */}
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' }} onPress={onOpenTagPeople}>
          <Feather name="users" size={20} color="#000" style={{ marginRight: 15 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: taggedUsers.length > 0 ? '#000' : '#666' }}>
              {taggedUsers.length > 0 ? `${taggedUsers.length} people tagged` : 'Tag people'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Visibility Row */}
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }} onPress={onOpenVisibility}>
          <Feather name="eye" size={20} color="#000" style={{ marginRight: 15 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: '#000' }}>
              Post visibility: <Text style={{ color: '#666' }}>{visibility}</Text>
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default PostDetailsForm;
