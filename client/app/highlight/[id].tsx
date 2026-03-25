import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Dimensions, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';


const { width } = Dimensions.get('window');

export default function HighlightScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const id = (params.id as string) || 'unknown';

  // Use backend highlights if available
  // For demo, show empty state if no images
  // You can fetch highlight images from backend here
  const images: string[] = [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#FF6B00" />
        </TouchableOpacity>
        <Text style={styles.title}>{id.charAt(0).toUpperCase() + id.slice(1)} Highlight</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.card}>
        {images.length === 0 ? (
          <Text style={styles.empty}>No highlight images found.</Text>
        ) : (
          <FlatList
            data={images}
            numColumns={3}
            keyExtractor={(i) => i}
            renderItem={({ item }) => (
              <Image source={{ uri: item }} style={styles.gridImage} />
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 18 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 8, borderBottomWidth: 1, borderBottomColor: '#eee', marginBottom: 12 },
  title: { fontWeight: '700', fontSize: 22, marginLeft: 12, color: '#FF6B00' },
  card: { backgroundColor: '#f7f7f7', borderRadius: 16, padding: 18, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 8, flex: 1 },
  gridImage: { width: width / 3 - 12, height: width / 3 - 12, backgroundColor: '#eee', margin: 6, borderRadius: 8 },
  empty: { color: '#999', fontSize: 16, textAlign: 'center', marginTop: 32 },
});
