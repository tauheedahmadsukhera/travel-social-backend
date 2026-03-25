import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@trave_cache_';
const CACHE_EXPIRY_KEY = '@trave_cache_expiry_';

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds (default: 1 hour)
}

/**
 * Cache data with expiry
 */
export async function cacheData(
  key: string,
  data: any,
  options: CacheOptions = {}
): Promise<void> {
  const { ttl = 3600000 } = options; // Default 1 hour
  
  try {
    const cacheKey = CACHE_PREFIX + key;
    const expiryKey = CACHE_EXPIRY_KEY + key;
    const expiryTime = Date.now() + ttl;

    await AsyncStorage.multiSet([
      [cacheKey, JSON.stringify(data)],
      [expiryKey, expiryTime.toString()],
    ]);
  } catch (error) {
    console.error('Cache write error:', error);
  }
}

/**
 * Get cached data if not expired
 */
export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const cacheKey = CACHE_PREFIX + key;
    const expiryKey = CACHE_EXPIRY_KEY + key;

    const [[, cachedData], [, expiryTimeStr]] = await AsyncStorage.multiGet([
      cacheKey,
      expiryKey,
    ]);

    if (!cachedData || !expiryTimeStr) {
      return null;
    }

    const expiryTime = parseInt(expiryTimeStr, 10);
    if (Date.now() > expiryTime) {
      // Cache expired, remove it
      await clearCache(key);
      return null;
    }

    return JSON.parse(cachedData) as T;
  } catch (error) {
    console.error('Cache read error:', error);
    return null;
  }
}

/**
 * Clear specific cached item
 */
export async function clearCache(key: string): Promise<void> {
  try {
    const cacheKey = CACHE_PREFIX + key;
    const expiryKey = CACHE_EXPIRY_KEY + key;
    await AsyncStorage.multiRemove([cacheKey, expiryKey]);
  } catch (error) {
    console.error('Cache clear error:', error);
  }
}

/**
 * Clear all cached data
 */
export async function clearAllCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(
      (key) => key.startsWith(CACHE_PREFIX) || key.startsWith(CACHE_EXPIRY_KEY)
    );
    await AsyncStorage.multiRemove(cacheKeys);
  } catch (error) {
    console.error('Clear all cache error:', error);
  }
}

/**
 * Get cache size info
 */
export async function getCacheInfo(): Promise<{
  count: number;
  keys: string[];
}> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX));
    
    return {
      count: cacheKeys.length,
      keys: cacheKeys.map((k) => k.replace(CACHE_PREFIX, '')),
    };
  } catch (error) {
    console.error('Get cache info error:', error);
    return { count: 0, keys: [] };
  }
}

/**
 * Fetch data with cache fallback
 */
export async function fetchWithCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  // Try to get from cache first
  const cached = await getCachedData<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Fetch fresh data
  try {
    const freshData = await fetchFn();
    await cacheData(key, freshData, options);
    return freshData;
  } catch (error) {
    console.error('Fetch with cache error:', error);
    throw error;
  }
}
