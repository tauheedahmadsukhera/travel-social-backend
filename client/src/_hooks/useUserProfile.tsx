import { useEffect, useState } from 'react';
import { apiService } from '../_services/apiService';

const DEFAULT_AVATAR_URL = 'https://res.cloudinary.com/dinwxxnzm/image/upload/v1/default/default-pic.jpg';

function isRecord(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object';
}

export interface UserProfile {
  id: string;
  uid: string;
  name: string;
  username?: string;
  avatar: string;
  photoURL?: string;
  bio?: string;
  email?: string;
  website?: string;
}

export function useUserProfile(userId: string | null | undefined) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setProfile(null);
      return;
    }

    let mounted = true;

    async function fetchProfile() {
      try {
        setLoading(true);
        setError(null);
        // Use backend API for user profile
        const result = await apiService.get(`/users/${userId}`);
        if (!mounted) return;
        if (isRecord(result) && result.success && 'data' in result && isRecord(result.data)) {
          // Ensure avatar always has a value
          const avatarUrl = result.data.avatar || result.data.photoURL || DEFAULT_AVATAR_URL;
          setProfile({
            ...result.data,
            avatar: avatarUrl,
            name: result.data.name || 'User',
          });
        } else {
          setError('Failed to load profile');
          setProfile(null);
        }
      } catch (err) {
        if (!mounted) return;
        console.error('useUserProfile error:', err);
        setError('An error occurred');
        setProfile(null);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchProfile();
    return () => {
      mounted = false;
    };
  }, [userId]);

  return { profile, loading, error };
}
