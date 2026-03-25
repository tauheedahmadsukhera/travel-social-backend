
import { apiService } from './apiService';

export async function createOrUpdateUserFromSocial({ uid, name, avatar, provider }: { uid: string; name: string; avatar: string; provider: string }) {
  if (!uid) throw new Error('No UID provided');
  await apiService.post('/users', {
    uid,
    displayName: name,
    avatar,
    provider,
    updatedAt: new Date().toISOString(),
  });
}

export default function UserService() {
  return null;
}
