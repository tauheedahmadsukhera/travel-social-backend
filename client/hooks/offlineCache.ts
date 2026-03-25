                         import AsyncStorage from '@react-native-async-storage/async-storage';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

/**
 * Fetch data and cache it for offline use
 */
export async function fetchWithCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: { ttl?: number } = {}
): Promise<T> {
  try {
    // Fetch fresh data
    const freshData = await fetchFn();

    // Cache it
    const cacheEntry: CacheEntry<T> = {
      data: freshData,
      timestamp: Date.now(),
      ttl: options.ttl ?? 24 * 60 * 60 * 1000, // Default 24 hours
    };

    await AsyncStorage.setItem(
      `cache_${key}`,
      JSON.stringify(cacheEntry)
    );

    return freshData;
  } catch (error) {
    // If fetch fails, try to get cached data
    const cachedData = await getCachedData<T>(key);
    if (cachedData) {
      return cachedData;
    }
    throw error;
  }
}

/**
 * Get cached data if it exists and hasn't expired
 */
export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const cached = await AsyncStorage.getItem(`cache_${key}`);
    
    if (!cached) {
      return null;
    }

    const cacheEntry: CacheEntry<T> = JSON.parse(cached);
    const now = Date.now();
    const age = now - cacheEntry.timestamp;

    // Check if cache has expired
    if (age > cacheEntry.ttl) {
      // Clear expired cache
      await AsyncStorage.removeItem(`cache_${key}`);
      return null;
    }

    return cacheEntry.data;
  } catch (error) {
    console.error(`Error reading cache for ${key}:`, error);
    return null;
  }
}

/**
 * Clear specific cache entry
 */
export async function clearCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`cache_${key}`);
  } catch (error) {
    console.error(`Error clearing cache for ${key}:`, error);
  }
}

/**
 * Clear all cache entries
 */
export async function clearAllCache(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter(key => key.startsWith('cache_'));
    await AsyncStorage.multiRemove(cacheKeys);
  } catch (error) {
    console.error('Error clearing all cache:', error);
  }
}
