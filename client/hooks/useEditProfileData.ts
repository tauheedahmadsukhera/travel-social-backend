import { useEffect, useState } from 'react';
import { getCurrentUser, getUserProfile } from '../lib/firebaseHelpers/index';

export function useEditProfileData() {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [avatar, setAvatar] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const user = getCurrentUser() as { uid?: string } | null;
      if (!user) {
        setError('Not signed in');
        setLoading(false);
        return;
      }
      const result = await getUserProfile(typeof user?.uid === 'string' ? user.uid : '');
      if (result.success && result.data) {
        setName(result.data.name || '');
        setBio(result.data.bio || '');
        setWebsite(result.data.website || '');
        setAvatar(result.data.avatar || '');
      }
      setLoading(false);
    }
    loadProfile();
  }, []);

  return { name, setName, bio, setBio, website, setWebsite, avatar, setAvatar, loading, error };
}
