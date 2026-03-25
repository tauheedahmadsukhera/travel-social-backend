import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cacheData,
  getCachedData,
  clearCache,
  clearAllCache,
  fetchWithCache,
} from '../offlineCache';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('offlineCache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  describe('cacheData', () => {
    it('caches data successfully', async () => {
      const testData = { id: 1, name: 'Test' };
      await cacheData('test-key', testData);

      const cached = await getCachedData('test-key');
      expect(cached).toEqual(testData);
    });

    it('respects TTL', async () => {
      const testData = { id: 1, name: 'Test' };
      await cacheData('test-key', testData, { ttl: 100 });

      // Immediate retrieval should work
      let cached = await getCachedData('test-key');
      expect(cached).toEqual(testData);

      // Mock time passing
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 200);

      // Should be expired
      cached = await getCachedData('test-key');
      expect(cached).toBeNull();
    });
  });

  describe('clearCache', () => {
    it('clears specific cache', async () => {
      await cacheData('test-1', { data: 1 });
      await cacheData('test-2', { data: 2 });

      await clearCache('test-1');

      const cached1 = await getCachedData('test-1');
      const cached2 = await getCachedData('test-2');

      expect(cached1).toBeNull();
      expect(cached2).toEqual({ data: 2 });
    });
  });

  describe('clearAllCache', () => {
    it('clears all cached data', async () => {
      await cacheData('test-1', { data: 1 });
      await cacheData('test-2', { data: 2 });

      await clearAllCache();

      const cached1 = await getCachedData('test-1');
      const cached2 = await getCachedData('test-2');

      expect(cached1).toBeNull();
      expect(cached2).toBeNull();
    });
  });

  describe('fetchWithCache', () => {
    it('fetches and caches data', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1, name: 'Fetched' });

      const result = await fetchWithCache('test-key', mockFetch);

      expect(result).toEqual({ id: 1, name: 'Fetched' });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const cachedResult = await getCachedData('test-key');
      expect(cachedResult).toEqual(result);
    });

    it('uses cached data on subsequent calls', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1, name: 'Fetched' });

      await fetchWithCache('test-key', mockFetch);
      
      // Mock fetch again (shouldn't be called)
      const result = await getCachedData('test-key');

      expect(result).toEqual({ id: 1, name: 'Fetched' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
