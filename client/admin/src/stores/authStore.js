import create from 'zustand';

export const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem('adminToken') || null,
  isAuthenticated: !!localStorage.getItem('adminToken'),

  setAuth: (user, token) => {
    localStorage.setItem('adminToken', token);
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('adminToken');
    set({ user: null, token: null, isAuthenticated: false });
  }
}));
