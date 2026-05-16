import { apiService } from '@/src/_services/apiService';

// In-memory cache: prevents re-fetching on every feed/profile load
const blockedCache = new Map<string, { ids: Set<string>; ts: number }>();
const BLOCKED_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function fetchBlockedUserIds(uid: string): Promise<Set<string>> {
  if (!uid) return new Set<string>();

  const cached = blockedCache.get(uid);
  if (cached && Date.now() - cached.ts < BLOCKED_CACHE_TTL) {
    return cached.ids;
  }

  try {
    const res = await apiService.get(`/users/${uid}/blocked`);
    if (res?.success && Array.isArray(res.data)) {
      const ids = new Set<string>(res.data);
      blockedCache.set(uid, { ids, ts: Date.now() });
      return ids;
    }
    return new Set<string>();
  } catch (err) {
    console.warn('fetchBlockedUserIds failed:', err);
    return cached?.ids ?? new Set<string>(); // Return stale cache on error
  }
}

export function filterOutBlocked<T extends Record<string, any>>(items: T[], blocked: Set<string>): T[] {
  return items.filter(i => {
    const uid = i.userId || i.ownerId || i.authorId;
    return uid ? !blocked.has(uid) : true;
  });
}
