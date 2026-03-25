
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../api';

export async function deleteStory(storyId: string) {
  try {
    const fullUrl = `${API_BASE_URL}/stories/${storyId}`;
    console.log('[deleteStory] Deleting story at:', fullUrl);

    const userId = await AsyncStorage.getItem('userId');

    const res = await fetch(fullUrl, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    const data = await res.json();
    console.log('[deleteStory] Response:', data);
    return data;
  } catch (error: any) {
    console.error('[deleteStory] Error:', error);
    return { success: false, error: error.message };
  }
}
