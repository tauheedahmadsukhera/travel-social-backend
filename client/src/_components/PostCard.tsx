import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Dimensions, StyleSheet, InteractionManager, Alert, Modal, Pressable } from "react-native";

import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { styles as postStyles } from './PostCard/PostCard.styles';
import PostHeader from './PostCard/PostHeader';
import PostMedia from './PostCard/PostMedia';
import PostActions from './PostCard/PostActions';
import PostCaption from './PostCard/PostCaption';
import { CommentSection } from "./CommentSection";
import ShareModal from "./ShareModal";
import { useUser } from "./UserContext";
import { likePost, unlikePost } from "../../lib/firebaseHelpers";
import { apiService } from '@/src/_services/apiService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PostCardProps {
  post: any;
  currentUser: any;
  showMenu?: boolean;
  highlightedCommentId?: string;
  highlightedCommentText?: string;
  showCommentsModal?: boolean;
  onCloseCommentsModal?: () => void;
  onCommentPress?: (postId: string, avatar: string) => void;
  mirror?: boolean;
}

const PostCard: React.FC<PostCardProps> = ({ 
  post, 
  currentUser, 
  showMenu = true, 
  highlightedCommentId, 
  onCommentPress,
  mirror = false
}) => {
  const router = useRouter();
  const user = useUser();
  const [isLiked, setIsLiked] = useState(post?.isLiked || false);
  const [likeCount, setLikeCount] = useState(post?.likeCount || 0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const videoRef = useRef<any>(null);

  // Derived data
  const postUserName = post?.userName || post?.user?.displayName || post?.user?.name || post?.userId?.displayName || post?.userId?.name || 'User';
  const postUserAvatar = post?.userAvatar || post?.user?.profilePicture || post?.user?.avatar || post?.user?.photoURL || post?.userId?.avatar || post?.userId?.profilePicture;
  const locationName = post?.locationData?.name || post?.locationName || post?.location || '';
  
  const getPostTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return 'now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    if (diff < 2419200) return `${Math.floor(diff / 604800)}w`;
    return date.toLocaleDateString();
  };
  const postTimeText = useMemo(() => getPostTime(post?.createdAt || post?.timestamp), [post?.createdAt, post?.timestamp]);


  const handleLike = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newLiked = !isLiked;
    setIsLiked(newLiked);
    setLikeCount((prev: number) => newLiked ? prev + 1 : prev - 1);
    
    try {
      if (newLiked) await likePost(post._id, user?.uid);
      else await unlikePost(post._id, user?.uid);
    } catch (err) {
      // Revert on error
      setIsLiked(!newLiked);
      setLikeCount((prev: number) => !newLiked ? prev + 1 : prev - 1);
    }
  }, [isLiked, post._id, user?.uid]);

  const onScroll = useCallback((event: any) => {
    const x = event.nativeEvent.contentOffset.x;
    const index = Math.round(x / SCREEN_WIDTH);
    if (index !== activeIndex) setActiveIndex(index);
  }, [activeIndex]);

  return (
    <View style={postStyles.cardInner}>
      <PostHeader 
        post={post}
        postUserName={postUserName}
        postUserAvatar={postUserAvatar}
        locationName={locationName}
        postTimeText={postTimeText}
        onProfilePress={() => {
          const uid = post?.userId?._id || post?.userId?.id || post?.userId || post?.user?.uid;
          if (uid) router.push(`/user-profile?uid=${uid}`);
        }}
        onLocationPress={() => {
          if (post?.locationData?.placeId) {
            router.push({
              pathname: '/location/[placeId]',
              params: {
                placeId: post.locationData.placeId,
                locationName: post.locationData.name || locationName,
                locationAddress: post.locationData.address || locationName
              }
            } as any);
          }
        }}
        onMenuPress={() => {
          const isOwner = user?.uid === (post?.userId?._id || post?.userId || post?.user?.uid);
          const options = isOwner 
            ? ['Edit Post', 'Delete Post', 'Cancel']
            : ['Report Post', 'Copy Link', 'Cancel'];
          
          Alert.alert(
            'Post Options',
            '',
            options.map(opt => ({
              text: opt,
              style: opt === 'Delete Post' || opt === 'Report Post' ? 'destructive' : 'default',
              onPress: () => {
                if (opt === 'Delete Post') {
                  // handle delete
                } else if (opt === 'Edit Post') {
                  router.push(`/create-post?postId=${post._id}`);
                }
              }
            }))
          );
        }}
        showMenu={showMenu}
      />


      <PostMedia 
        media={useMemo(() => {
          const mediaArr: any[] = [];
          
          // 1. Get all potential media from the post object
          const rawMedia = post?.media || post?.mediaUrls || post?.imageUrls || post?.videoUrls;
          const singleUrl = post?.imageUrl || post?.url || post?.mediaUrl || post?.videoUrl;

          // 2. Handle arrays
          if (Array.isArray(rawMedia) && rawMedia.length > 0) {
            rawMedia.forEach(item => {
              if (typeof item === 'string' && item.trim()) {
                mediaArr.push({ 
                  url: item.trim(), 
                  type: (item.toLowerCase().includes('.mp4') || item.toLowerCase().includes('.mov')) ? 'video' : 'image' 
                });
              } else if (item && typeof item === 'object' && (item.url || item.uri)) {
                mediaArr.push({
                  url: item.url || item.uri,
                  type: item.type || 'image'
                });
              }
            });
          }
          
          // 3. Handle single fields if array is empty
          if (mediaArr.length === 0 && typeof singleUrl === 'string' && singleUrl.trim()) {
            mediaArr.push({ 
              url: singleUrl.trim(), 
              type: (singleUrl.toLowerCase().includes('.mp4') || singleUrl.toLowerCase().includes('.mov')) ? 'video' : 'image' 
            });
          }
          
          return mediaArr;
        }, [post])}



        mediaHeight={400}
        activeIndex={activeIndex}
        onScroll={onScroll}
        onMediaPress={(index) => {
          handleLike();
        }}
        isMuted={isMuted}
        toggleMute={() => setIsMuted(!isMuted)}
        videoRef={videoRef}
      />



      <PostActions 
        isLiked={isLiked}
        onLikePress={handleLike}
        onCommentPress={() => setShowComments(true)}
        onSharePress={() => setShowShare(true)}
        post={post}
        likeCount={likeCount}
        commentCount={post?.commentCount || 0}
        reactions={post?.reactions}
      />

      <PostCaption 
        postUserName={postUserName}
        caption={post?.caption || ''}
        hashtags={post?.hashtags || []}
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
        onHashtagPress={(tag) => {
          router.push(`/search?q=${encodeURIComponent(tag)}`);
        }}
      />


      <Modal
        visible={showComments}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowComments(false)}
      >
        <Pressable 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} 
          onPress={() => setShowComments(false)} 
        />
        <View style={{ 
          height: '80%', 
          backgroundColor: '#fff', 
          borderTopLeftRadius: 20, 
          borderTopRightRadius: 20,
          overflow: 'hidden'
        }}>
          <View style={{ 
            height: 5, 
            width: 40, 
            backgroundColor: '#ddd', 
            borderRadius: 3, 
            alignSelf: 'center', 
            marginVertical: 10 
          }} />
          <CommentSection 
            postId={post._id}
            postOwnerId={post?.userId?._id || post?.userId}
            currentAvatar={currentUser?.avatar || currentUser?.photoURL || ''}
            currentUser={currentUser}
            maxHeight={Dimensions.get('window').height * 0.7}
          />
        </View>
      </Modal>


      {showShare && (
        <ShareModal 
          visible={showShare}
          onClose={() => setShowShare(false)}
          onSend={(userIds) => {
            console.log('Sending post to users:', userIds);
          }}
          currentUserId={currentUser?._id || currentUser?.id || currentUser?.uid}
          sharePayload={post}
          modalVariant="home"
        />
      )}
    </View>
  );
};

export default React.memo(PostCard);
