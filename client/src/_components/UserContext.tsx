// This context is deprecated - app now uses token-based auth with AsyncStorage
// Keeping UserProvider for backward compatibility with components that might still use it
// But it no longer tries to initialize Firebase auth
import React, { createContext, ReactNode, useContext } from 'react';

export type AuthUser = any;
const UserContext = createContext<{ user: AuthUser; loading: boolean }>({ user: null, loading: false });

interface UserProviderProps {
  children: ReactNode;
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  // No longer initializing Firebase auth - app uses AsyncStorage token-based auth
  // This provider is kept for compatibility only
  return (
    <UserContext.Provider value={{ user: null, loading: false }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): AuthUser => {
  const context = useContext(UserContext);
  if (!context) {
    console.warn('[useUser] UserContext not found - returning null');
    return null;
  }
  return context.user;
};

export const useAuthLoading = (): boolean => {
  const context = useContext(UserContext);
  return context?.loading ?? false;
};
