import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Profile from './(tabs)/profile';

// Wrapper route so viewing another user's profile doesn't activate the bottom Profile tab.
// Also add safe-area and vertical spacing so content is not flush to edges.
export default function UserProfileWrapper() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Get current user ID
  useEffect(() => {
    const getUserId = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        setCurrentUserId(userId);
      } catch (error) {
        console.error('Failed to get userId:', error);
      }
    };
    getUserId();
  }, []);

  const userId = typeof params.id === 'string' ? params.id : (typeof params.uid === 'string' ? params.uid : undefined);

  // If viewing own profile, redirect to main profile tab
  useEffect(() => {
    if (currentUserId && userId === currentUserId) {
      router.replace('/(tabs)/profile');
    }
  }, [currentUserId, userId, router]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      <View style={{ flex: 1 }}>
        <Profile userIdProp={userId} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
});
