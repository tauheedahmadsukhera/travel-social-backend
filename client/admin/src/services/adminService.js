import apiClient from './apiClient';

export const adminAPI = {
  // Users
  getAllUsers: (page = 1, limit = 20, search = '', role = '', status = '') =>
    apiClient.get('/admin/users', { params: { page, limit, search, role, status } }),

  getUserDetails: (uid) =>
    apiClient.get(`/admin/users/${uid}`),

  banUser: (uid, reason = '') =>
    apiClient.post(`/admin/users/${uid}/ban`, { reason }),

  unbanUser: (uid) =>
    apiClient.post(`/admin/users/${uid}/unban`),

  updateUserRole: (uid, role) =>
    apiClient.post(`/admin/users/${uid}/role`, { role }),

  deleteUser: (uid) =>
    apiClient.delete(`/admin/users/${uid}`),

  // Analytics
  getDashboardAnalytics: () =>
    apiClient.get('/admin/analytics/dashboard'),

  // Logs
  getAdminLogs: (page = 1, limit = 50, adminId = '', action = '') =>
    apiClient.get('/admin/logs', { params: { page, limit, adminId, action } })
};
