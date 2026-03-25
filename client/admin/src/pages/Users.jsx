import React, { useEffect, useState } from 'react';
import { adminAPI } from '../services/adminService';
import toast from 'react-hot-toast';
import '../styles/Users.css';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [actionType, setActionType] = useState(''); // 'ban', 'role', 'delete'

  const limit = 20;

  useEffect(() => {
    fetchUsers();
  }, [page, search, filterRole, filterStatus]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getAllUsers(page, limit, search, filterRole, filterStatus);
      setUsers(res.data);
      setTotal(res.total);
    } catch (err) {
      toast.error('Failed to load users');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBanUser = async () => {
    try {
      await adminAPI.banUser(selectedUser.uid, 'Banned by admin');
      toast.success(`User ${selectedUser.uid} has been banned`);
      setModalOpen(false);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to ban user');
    }
  };

  const handleUnbanUser = async () => {
    try {
      await adminAPI.unbanUser(selectedUser.uid);
      toast.success(`User ${selectedUser.uid} has been unbanned`);
      setModalOpen(false);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to unban user');
    }
  };

  const handleUpdateRole = async (newRole) => {
    try {
      await adminAPI.updateUserRole(selectedUser.uid, newRole);
      toast.success(`User role updated to ${newRole}`);
      setModalOpen(false);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update role');
    }
  };

  const handleDeleteUser = async () => {
    if (!window.confirm('Are you sure? This action cannot be undone.')) return;
    try {
      await adminAPI.deleteUser(selectedUser.uid);
      toast.success(`User ${selectedUser.uid} has been deleted`);
      setModalOpen(false);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const pages = Math.ceil(total / limit);

  return (
    <div className="users-page">
      <h1>User Management</h1>

      {/* Filters */}
      <div className="filters">
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="filter-input"
        />
        <select
          value={filterRole}
          onChange={(e) => {
            setFilterRole(e.target.value);
            setPage(1);
          }}
          className="filter-input"
        >
          <option value="">All Roles</option>
          <option value="user">User</option>
          <option value="moderator">Moderator</option>
          <option value="admin">Admin</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setPage(1);
          }}
          className="filter-input"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>UID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Posts</th>
              <th>Followers</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="9">Loading...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan="9">No users found</td></tr>
            ) : (
              users.map((user) => (
                <tr key={user.uid}>
                  <td className="uid-cell">{user.uid.substring(0, 8)}...</td>
                  <td>{user.displayName || user.name || 'N/A'}</td>
                  <td>{user.email}</td>
                  <td><span className={`badge role-${user.role}`}>{user.role}</span></td>
                  <td><span className={`badge status-${user.status}`}>{user.status}</span></td>
                  <td>{user.postsCount || 0}</td>
                  <td>{user.followersCount || 0}</td>
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="action-btn"
                      onClick={() => {
                        setSelectedUser(user);
                        setActionType('view');
                        setModalOpen(true);
                      }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pagination">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>← Prev</button>
        <span>Page {page} of {pages}</span>
        <button disabled={page === pages} onClick={() => setPage(page + 1)}>Next →</button>
      </div>

      {/* User Action Modal */}
      {modalOpen && selectedUser && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>User Details</h2>
            <div className="user-details">
              <p><strong>UID:</strong> {selectedUser.uid}</p>
              <p><strong>Name:</strong> {selectedUser.displayName || selectedUser.name || 'N/A'}</p>
              <p><strong>Email:</strong> {selectedUser.email}</p>
              <p><strong>Role:</strong> {selectedUser.role}</p>
              <p><strong>Status:</strong> {selectedUser.status}</p>
              <p><strong>Posts:</strong> {selectedUser.postsCount || 0}</p>
              <p><strong>Followers:</strong> {selectedUser.followersCount || 0}</p>
              <p><strong>Joined:</strong> {new Date(selectedUser.createdAt).toLocaleString()}</p>
            </div>

            <div className="modal-actions">
              {selectedUser.status === 'banned' ? (
                <button className="btn btn-success" onClick={handleUnbanUser}>Unban</button>
              ) : (
                <button className="btn btn-danger" onClick={handleBanUser}>Ban</button>
              )}

              <select
                value={selectedUser.role}
                onChange={(e) => handleUpdateRole(e.target.value)}
                className="role-select"
              >
                <option value="user">User</option>
                <option value="moderator">Moderator</option>
                <option value="admin">Admin</option>
              </select>

              <button className="btn btn-danger" onClick={handleDeleteUser}>Delete</button>
              <button className="btn" onClick={() => setModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
