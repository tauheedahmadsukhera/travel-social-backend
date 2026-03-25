import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Index() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Check if token exists in AsyncStorage (backend JWT)
      const token = await AsyncStorage.getItem('token');
      const userId = await AsyncStorage.getItem('userId');
      
      console.log('🔐 Auth state check:', token ? 'Has token' : 'No token');

      if (token && userId) {
        console.log('✅ User logged in, navigating to home');
        router.replace('/(tabs)/home');
      } else {
        console.log('❌ No token, navigating to welcome');
        router.replace('/auth/welcome');
      }
    } catch (error) {
      console.error('🔐 Auth check error:', error);
      router.replace('/auth/welcome');
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" color="#667eea" />
    </View>
  );
}
