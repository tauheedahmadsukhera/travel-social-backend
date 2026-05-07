import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { feedEventEmitter } from '../lib/feedEventEmitter';

export function useFeedEvents(
  setPosts: React.Dispatch<React.SetStateAction<any[]>>,
  setAllLoadedPosts: React.Dispatch<React.SetStateAction<any[]>>,
  isOnline: boolean,
  loadInitialFeed: (pageNum?: number, options?: any) => Promise<any>
) {
  useEffect(() => {
    const unsub = feedEventEmitter.onFeedUpdate((event) => {
      if (event.type === 'POST_DELETED' && event.postId) {
        const targetId = String(event.postId).split('-loop')[0];
        
        const filterFn = (prev: any[]) => (Array.isArray(prev) ? prev.filter(p => {
          const pid = String(p?.id || p?._id || '').split('-loop')[0];
          return pid !== targetId;
        }) : []);

        setPosts(prev => filterFn(prev));
        setAllLoadedPosts(prev => filterFn(prev));
        
        // Aggressively clear ALL home feed caches
        (async () => {
          try {
            const allKeys = await AsyncStorage.getAllKeys();
            const homeKeys = allKeys.filter(k => k.includes('home_feed_v1'));
            for (const fullKey of homeKeys) {
              try {
                const cached = await AsyncStorage.getItem(fullKey);
                if (cached) {
                  let entry = JSON.parse(cached);
                  if (entry && Array.isArray(entry.data)) {
                    const updatedData = entry.data.filter((p: any) => {
                      const pid = String(p?.id || p?._id || '').split('-loop')[0];
                      return pid !== targetId;
                    });
                    if (updatedData.length !== entry.data.length) {
                      entry.data = updatedData;
                      await AsyncStorage.setItem(fullKey, JSON.stringify(entry));
                    }
                  }
                }
              } catch (e) {
                await AsyncStorage.removeItem(fullKey);
              }
            }
          } catch (e) {}
          
          if (isOnline) {
             loadInitialFeed(0, { silent: true, _t: Date.now(), bypassDedupe: true }).catch(() => {});
          }
        })();
      }
      if (event.type === 'POST_UPDATED' && event.postId) {
        const patch = event.data && typeof event.data === 'object' ? event.data : {};
        const apply = (p: any) => {
          if (!p) return p;
          const ids = [String(p.id || ''), String(p._id || ''), String((p as any).postId || '')].filter(Boolean);
          if (!ids.includes(String(event.postId))) return p;
          return { ...p, ...patch, updatedAt: new Date().toISOString() };
        };
        setPosts(prev => (Array.isArray(prev) ? prev.map(apply) : prev));
        setAllLoadedPosts(prev => (Array.isArray(prev) ? prev.map(apply) : prev));
      }
      if (event.type === 'USER_BLOCKED' && event.userId) {
        const blockedUserId = String(event.userId);
        
        const filterFn = (prev: any[]) => (Array.isArray(prev) ? prev.filter(p => {
          const authorId = p?.userId && typeof p.userId === 'object' 
            ? String(p.userId._id || p.userId.id || '') 
            : String(p?.userId || '');
          return authorId !== blockedUserId;
        }) : []);

        setPosts(prev => filterFn(prev));
        setAllLoadedPosts(prev => filterFn(prev));
        
        // Refresh feed to get new content without the blocked user
        if (isOnline) {
          loadInitialFeed(0, { silent: true, _t: Date.now() }).catch(() => {});
        }
      }
    });
    return unsub;
  }, [isOnline, loadInitialFeed, setPosts, setAllLoadedPosts]);

  useEffect(() => {
    // @ts-ignore
    const sub = feedEventEmitter.addListener('feedUpdated', () => {
      if (!isOnline) return;
      loadInitialFeed(0, { silent: true, _t: Date.now() }).catch(() => {});
    });
    return () => sub.remove();
  }, [isOnline, loadInitialFeed]);
}
