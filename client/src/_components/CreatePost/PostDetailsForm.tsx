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
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 20 }}>
        {/* Caption */}
        <View style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Feather name="align-justify" size={18} color="#000" style={{ marginRight: 12 }} />
            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>Caption</Text>
          </View>
          <TextInput
            style={{ fontSize: 16, minHeight: 80, textAlignVertical: 'top', backgroundColor: '#f9f9f9', padding: 12, borderRadius: 10 }}
            placeholder="Write a caption..."
            value={caption}
            onChangeText={setCaption}
            multiline
          />
        </View>

        {/* Tags */}
        <View style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Feather name="hash" size={18} color="#000" style={{ marginRight: 12 }} />
            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>Tags</Text>
          </View>
          <TextInput
            style={{ fontSize: 14, backgroundColor: '#f9f9f9', padding: 12, borderRadius: 10 }}
            placeholder="Add tags..."
            value={hashtagInput}
            onChangeText={onHashtagInputChange}
            onSubmitEditing={onHashtagCommit}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
            {hashtags.map(tag => (
              <View key={tag} style={{ backgroundColor: '#0095f6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center', marginRight: 8, marginBottom: 8 }}>
                <Text style={{ color: '#fff', fontSize: 13 }}>#{tag}</Text>
                <TouchableOpacity onPress={() => onRemoveTag(tag)} style={{ marginLeft: 6 }}>
                  <Feather name="x" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* Category */}
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 0.5, borderBottomColor: '#eee' }} onPress={onOpenCategories}>
          <Feather name="bookmark" size={20} color="#000" style={{ marginRight: 15 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16 }}>Category</Text>
            {selectedCategories.length > 0 && <Text style={{ color: '#0095f6', marginTop: 2 }}>{selectedCategories.map(c => c.name).join(', ')}</Text>}
          </View>
          <Feather name="chevron-right" size={20} color="#ccc" />
        </TouchableOpacity>

        {/* Location */}
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 0.5, borderBottomColor: '#eee' }} onPress={onOpenLocation}>
          <Feather name="map-pin" size={20} color="#000" style={{ marginRight: 15 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16 }}>Location</Text>
            {locationName ? <Text style={{ color: '#0095f6', marginTop: 2 }}>{locationName}</Text> : null}
          </View>
          <Feather name="chevron-right" size={20} color="#ccc" />
        </TouchableOpacity>

        {/* Tag People */}
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 0.5, borderBottomColor: '#eee' }} onPress={onOpenTagPeople}>
          <Feather name="user-plus" size={20} color="#000" style={{ marginRight: 15 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16 }}>Tag People</Text>
            {taggedUsers.length > 0 && <Text style={{ color: '#0095f6', marginTop: 2 }}>{taggedUsers.length} people tagged</Text>}
          </View>
          <Feather name="chevron-right" size={20} color="#ccc" />
        </TouchableOpacity>

        {/* Visibility */}
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15 }} onPress={onOpenVisibility}>
          <Feather name="eye" size={20} color="#000" style={{ marginRight: 15 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16 }}>Visibility</Text>
            <Text style={{ color: '#0095f6', marginTop: 2 }}>{visibility}</Text>
          </View>
          <Feather name="chevron-right" size={20} color="#ccc" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default PostDetailsForm;
