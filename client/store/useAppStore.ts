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
      
      logout: () => set({ userId: null, userProfile: null }),
    }),
    {
      name: 'trips-app-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ userId: state.userId, userProfile: state.userProfile }), // Persist only user ID and profile
    }
  )
);
