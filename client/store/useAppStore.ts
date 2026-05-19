import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AppState {
  userId: string | null;
  userProfile: any | null;
  isOnline: boolean;
  setUserId: (id: string | null) => void;
  setUserProfile: (profile: any | null) => void;
  setOnlineStatus: (status: boolean) => void;
  logout: () => void;
  messageCache: Record<string, any[]>;
  convoMap: Record<string, string>;
  setCachedMessages: (convoId: string, messages: any[]) => void;
  setConvoMapping: (otherUserId: string, convoId: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      userId: null,
      userProfile: null,
      isOnline: true,
      
      setUserId: (id) => set({ userId: id }),
      setUserProfile: (profile) => set({ userProfile: profile }),
      setOnlineStatus: (status) => set({ isOnline: status }),
      
      logout: () => set({ userId: null, userProfile: null, messageCache: {}, convoMap: {} }),
      messageCache: {},
      convoMap: {},
      setCachedMessages: (convoId, messages) => 
        set((state) => ({
          messageCache: { ...state.messageCache, [convoId]: messages.slice(0, 30) }
        })),
      setConvoMapping: (otherUserId, convoId) =>
        set((state) => ({
          convoMap: { ...state.convoMap, [otherUserId]: convoId }
        })),
    }),
    {
      name: 'trips-app-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ 
        userId: state.userId, 
        userProfile: state.userProfile,
        messageCache: state.messageCache,
        convoMap: state.convoMap
      }),
    }
  )
);
