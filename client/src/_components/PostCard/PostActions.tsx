import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from './PostCard.styles';
import SaveButton from '../SaveButton';

interface PostActionsProps {
  isLiked: boolean;
  onLikePress: () => void;
  onCommentPress: () => void;
  onReactionPress: () => void;
  onSharePress: () => void;
  post: any;
  likeCount: number;
  commentCount: number;
  reactions: any[];
  currentUserId?: string;
}

const PostActions: React.FC<PostActionsProps> = ({
  isLiked,
  onLikePress,
  onCommentPress,
  onReactionPress,
  onSharePress,
  post,
  likeCount,
  commentCount,
  reactions,
  currentUserId
}) => {
  // Robust matching for different ID formats
  const myReaction = reactions?.find(r => {
    const rId = String(r.userId || r.uid || r.id || r._id || '');
    const cId = String(currentUserId || '');
    return rId && cId && rId === cId;
  });

  // If user hasn't reacted, show the last reaction as a teaser
  const lastReaction = reactions && reactions.length > 0 ? reactions[reactions.length - 1] : null;
  const displayEmoji = myReaction?.emoji || lastReaction?.emoji || null;

  return (
    <View style={styles.iconRow}>
      <View style={styles.iconRowLeft}>
        <TouchableOpacity onPress={onLikePress} style={styles.actionItem}>
          <MaterialCommunityIcons 
            name={isLiked ? "heart" : "heart-outline"} 
            size={24} 
            color={isLiked ? "#ff4d4d" : "#222"} 
          />
          {likeCount > 0 && <Text style={styles.actionCount}>{likeCount}</Text>}
        </TouchableOpacity>
        
        <TouchableOpacity onPress={onCommentPress} style={styles.actionItem}>
          <Ionicons name="chatbubble-outline" size={26} color="#000" />
          {commentCount > 0 && <Text style={styles.actionCount}>{commentCount}</Text>}
        </TouchableOpacity>

        <SaveButton post={post} />
      </View>

      <View style={styles.iconRowRightGroup}>
        <View style={styles.reactionContainer}>
          {displayEmoji && (
            <Text style={styles.currentEmoji}>{displayEmoji}</Text>
          )}
          <TouchableOpacity onPress={onReactionPress} style={styles.starTrigger}>
            <Ionicons name="star" size={22} color="#FFD700" />
          </TouchableOpacity>
          <Text style={styles.reactionTotal}>{reactions?.length || 0}</Text>
        </View>

        <TouchableOpacity onPress={onSharePress} style={styles.actionItem}>
          <Feather name="send" size={26} color="#222" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default PostActions;
