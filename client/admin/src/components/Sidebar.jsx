import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { MdLogout, MdDashboard } from 'react-icons/md';
import '../styles/Sidebar.css';

export default function Sidebar() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { label: 'Dashboard', icon: '📊', path: '/' },
    { label: 'Users', icon: '👥', path: '/users' },
    { label: 'Posts', icon: '📝', path: '/posts' },
    { label: 'Reports', icon: '🚩', path: '/reports' },
    { label: 'Logs', icon: '📋', path: '/logs' },
    { label: 'Settings', icon: '⚙️', path: '/settings' }
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Admin Panel</h2>
      </div>

      <nav className="sidebar-menu">
        {menuItems.map((item) => (
          <div
            key={item.path}
            className="menu-item"
            onClick={() => navigate(item.path)}
          >
            <span className="menu-icon">{item.icon}</span>
            <span className="menu-label">{item.label}</span>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="logout-btn" onClick={handleLogout}>
          <MdLogout /> Logout
        </button>
      </div>
    </div>
  );
}
