import { apiService } from '@/src/_services/apiService';

export async function fetchBlockedUserIds(uid: string): Promise<Set<string>> {
  try {
    const res = await apiService.get(`/users/${uid}/blocked`);
    if (res?.success && Array.isArray(res.data)) {
      return new Set<string>(res.data);
    }
    return new Set<string>();
  } catch (err) {
    console.warn('fetchBlockedUserIds failed:', err);
    return new Set<string>();
  }
}

export function filterOutBlocked<T extends Record<string, any>>(items: T[], blocked: Set<string>): T[] {
  return items.filter(i => {
    const uid = i.userId || i.ownerId || i.authorId;
    return uid ? !blocked.has(uid) : true;
  });
}
