import { useEffect, useState } from 'react';
import { getUserHighlights, getUserPosts, getUserProfile, getUserSections } from '../lib/firebaseHelpers/index';

function isRecord(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object';
}

export function useProfileData(viewedUserId: string, authUserId: string) {
  const [profile, setProfile] = useState<any>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [approvedFollower, setApprovedFollower] = useState(false);
  const [followRequestPending, setFollowRequestPending] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [highlights, setHighlights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!viewedUserId) {
      setProfile(null);
      setPosts([]);
      setSections([]);
      setHighlights([]);
      setLoading(false);
      return;
    }
    async function loadData() {
      setLoading(true);
      // Profile
      const profileRes = await getUserProfile(viewedUserId);
      let profileData: any = null;
      if (isRecord(profileRes) && profileRes.success) {
        if ('data' in profileRes && isRecord(profileRes.data)) profileData = profileRes.data;
        else if ('profile' in profileRes && isRecord(profileRes.profile)) profileData = profileRes.profile;
        setProfile(profileData);
        setIsPrivate(profileData?.isPrivate || false);
        setApprovedFollower(profileData?.approvedFollowers?.includes(authUserId || '') || false);
        setFollowRequestPending(profileData?.followRequestPending || false);
      } else {
        setProfile(null);
      }
      // Posts
      const postsRes = await getUserPosts(viewedUserId);
      let postsData: any[] = [];
      if (isRecord(postsRes) && postsRes.success) {
        if ('data' in postsRes && Array.isArray(postsRes.data)) postsData = postsRes.data;
        else if ('posts' in postsRes && Array.isArray(postsRes.posts)) postsData = postsRes.posts;
        setPosts(postsData);
      } else {
        setPosts([]);
      }
      // Sections
      const sectionsRes = await getUserSections(viewedUserId);
      let sectionsData: any[] = [];
      if (isRecord(sectionsRes) && sectionsRes.success) {
        if ('data' in sectionsRes && Array.isArray(sectionsRes.data)) sectionsData = sectionsRes.data;
        else if ('sections' in sectionsRes && Array.isArray(sectionsRes.sections)) sectionsData = sectionsRes.sections;
        setSections(sectionsData);
      } else {
        setSections([]);
      }
      // Highlights
      const highlightsRes = await getUserHighlights(viewedUserId);
      let highlightsData: any[] = [];
      if (isRecord(highlightsRes) && highlightsRes.success) {
        if ('data' in highlightsRes && Array.isArray(highlightsRes.data)) highlightsData = highlightsRes.data;
        else if ('highlights' in highlightsRes && Array.isArray(highlightsRes.highlights)) highlightsData = highlightsRes.highlights;
        setHighlights(highlightsData);
      } else {
        setHighlights([]);
      }
      setLoading(false);
    }
    loadData();
  }, [viewedUserId, authUserId]);

  return { profile, isPrivate, approvedFollower, followRequestPending, posts, sections, highlights, loading };
}
