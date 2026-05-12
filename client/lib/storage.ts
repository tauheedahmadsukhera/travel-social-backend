import AsyncStorage from '@react-native-async-storage/async-storage';

console.log('[Storage] Using AsyncStorage shim (MMKV disabled)');

// ─── Single MMKV instance (MOCKED for Expo Go compatibility) ──────────────────
let mmkv: any = null;

// ─── Sync helpers (Sync is not supported with AsyncStorage, returning null/noop) ────

/** Get a string value synchronously */
export function getItemSync(key: string): string | null {
  return null;
}

/** Set a string value synchronously */
export function setItemSync(key: string, value: string): void {
}

/** Remove a key synchronously */
export function removeItemSync(key: string): void {
}

/** Get all keys synchronously */
export function getAllKeysSync(): string[] {
  return [];
}

// ─── Async API (AsyncStorage drop-in replacement) ──────────────────────────────

const storage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(key);
    } catch (e) {
      if (__DEV__) console.warn('[Storage] getItem error:', key, e);
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      if (__DEV__) console.warn('[Storage] setItem error:', key, e);
    }
  },

  removeItem: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      if (__DEV__) console.warn('[Storage] removeItem error:', key, e);
    }
  },

  mergeItem: async (key: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.mergeItem(key, value);
    } catch (e) {
      if (__DEV__) console.warn('[Storage] mergeItem error:', key, e);
    }
  },

  clear: async (): Promise<void> => {
    try {
      await AsyncStorage.clear();
    } catch (e) {
      if (__DEV__) console.warn('[Storage] clear error:', e);
    }
  },

  getAllKeys: async (): Promise<string[]> => {
    try {
      return (await AsyncStorage.getAllKeys()) as string[];
    } catch (e) {
      if (__DEV__) console.warn('[Storage] getAllKeys error:', e);
      return [];
    }
  },

  multiSet: async (keyValuePairs: Array<[string, string]>): Promise<void> => {
    try {
      await AsyncStorage.multiSet(keyValuePairs);
    } catch (e) {
      if (__DEV__) console.warn('[Storage] multiSet error:', e);
    }
  },

  multiGet: async (keys: string[]): Promise<Array<[string, string | null]>> => {
    try {
      return (await AsyncStorage.multiGet(keys)) as Array<[string, string | null]>;
    } catch (e) {
      if (__DEV__) console.warn('[Storage] multiGet error:', e);
      return keys.map(key => [key, null]);
    }
  },

  multiRemove: async (keys: string[]): Promise<void> => {
    try {
      await AsyncStorage.multiRemove(keys);
    } catch (e) {
      if (__DEV__) console.warn('[Storage] multiRemove error:', e);
    }
  },

  multiMerge: async (keyValuePairs: Array<[string, string]>): Promise<void> => {
    try {
      await AsyncStorage.multiMerge(keyValuePairs);
    } catch (e) {
      if (__DEV__) console.warn('[Storage] multiMerge error:', e);
    }
  },
};

export default storage;
export { mmkv };



