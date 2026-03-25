import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// import { getCurrentUser } from '../lib/firebaseHelpers';
import { sharePost } from '../lib/postShare';
import PostViewerModal from '@/src/_components/PostViewerModal';

export default function PostDetailScreen() {
  const params = useLocalSearchParams();
  const postId = (params.id || (params as any).postId) as string;
  const router = useRouter();

  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    async function loadPost() {
      setLoading(true);
      // const user = getCurrentUser();
      // setCurrentUser(user);
      // TODO: Use user from context or props
      // Fetch post by ID
      const { getPostById } = await import('../lib/firebaseHelpers/post');
      const result = await getPostById(postId);
      const fetchedPost = result?.post || result?.data;
      if (result.success && fetchedPost) {
        setPost(fetchedPost);

        const tappedPostId = String(fetchedPost?.id || fetchedPost?._id || postId || '');
        // Intentionally avoiding redirect to user's feed so the post can be viewed in isolation
      }
      setLoading(false);
    }
    loadPost();
  }, [postId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#007aff" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="small" color="#999" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {React.createElement(PostViewerModal as any, {
        visible: true,
        onClose: () => router.back(),
        posts: [post],
        selectedPostIndex: 0,
        profile: profile,
        authUser: currentUser,
        likedPosts: {},
        savedPosts: {},
        handleLikePost: () => { },
        handleSavePost: () => { },
        handleSharePost: (p: any) => sharePost(p),
        setCommentModalPostId: () => { },
        setCommentModalAvatar: () => { },
        setCommentModalVisible: () => { },
      })}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
