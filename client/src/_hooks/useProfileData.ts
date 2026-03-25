import { useEffect, useState } from 'react';
import { apiService } from '../_services/apiService';

export function useProfileData(userId: string) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followStatus, setFollowStatus] = useState<'none' | 'pending' | 'approved'>('none');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiService.get(`/users/${userId}`),
      apiService.get(`/posts`, { userId }),
      apiService.get(`/users/${userId}/sections`),
      apiService.get(`/users/${userId}/stories`)
    ])
      .then(([profileData, postsData, sectionsData, storiesData]) => {
        setProfile(profileData?.data || null);
        setPosts(postsData?.data || []);
        setSections(sectionsData?.data || []);
        setStories(storiesData?.data || []);
        setFollowStatus(profileData?.data?.followStatus || 'none');
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load profile');
        setLoading(false);
      });
  }, [userId]);

  const handleFollow = async () => {
    setLoading(true);
    try {
      if (followStatus === 'none') {
        await apiService.post(`/users/${userId}/follow`);
        setFollowStatus('pending');
      } else if (followStatus === 'pending' || followStatus === 'approved') {
        await apiService.post(`/users/${userId}/unfollow`);
        setFollowStatus('none');
      }
      setLoading(false);
    } catch (err: any) {
      setError(err.message || 'Follow action failed');
      setLoading(false);
    }
  };

  return { profile, posts, sections, stories, loading, error, followStatus, handleFollow };
}

// Add ProfileData type if not already defined

export type ProfileData = {
  uid: string;
  name: string;
  email?: string;
  avatar?: string;
  photoURL?: string;
  bio?: string;
  website?: string;
  followers?: any[];
  following?: any[];
  followStatus?: 'none' | 'pending' | 'approved';
  // Add other fields as needed
};


