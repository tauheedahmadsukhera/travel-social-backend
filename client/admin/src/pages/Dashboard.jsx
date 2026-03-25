import React, { useEffect, useState } from 'react';
import { adminAPI } from '../services/adminService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';
import '../styles/Dashboard.css';

export default function Dashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getDashboardAnalytics();
      setAnalytics(res.data);
    } catch (err) {
      toast.error('Failed to load analytics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="dashboard">Loading...</div>;
  if (!analytics) return <div className="dashboard">No data available</div>;

  const statsData = [
    { label: 'Total Users', value: analytics.totalUsers, color: '#3b82f6' },
    { label: 'Active Users', value: analytics.activeUsers, color: '#10b981' },
    { label: 'Banned Users', value: analytics.bannedUsers, color: '#ef4444' },
    { label: 'Total Posts', value: analytics.totalPosts, color: '#f59e0b' },
    { label: 'Pending Reports', value: analytics.pendingReports, color: '#8b5cf6' }
  ];

  const chartData = [
    { name: 'Users', active: analytics.activeUsers, banned: analytics.bannedUsers },
    { name: 'Posts', value: analytics.totalPosts },
    { name: 'Reports', pending: analytics.pendingReports, total: analytics.totalReports }
  ];

  return (
    <div className="dashboard">
      <h1>Admin Dashboard</h1>

      {/* Stats Cards */}
      <div className="stats-grid">
        {statsData.map((stat) => (
          <div key={stat.label} className="stat-card" style={{ borderLeftColor: stat.color }}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="chart-section">
        <h2>Overview</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="active" fill="#10b981" />
            <Bar dataKey="banned" fill="#ef4444" />
            <Bar dataKey="pending" fill="#8b5cf6" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Activity */}
      <div className="activity-section">
        <h2>Quick Stats</h2>
        <div className="activity-list">
          <div className="activity-item">
            <span>New Users (Last 30 Days)</span>
            <strong>{analytics.newUsersLast30Days}</strong>
          </div>
          <div className="activity-item">
            <span>Total Reports</span>
            <strong>{analytics.totalReports}</strong>
          </div>
          <div className="activity-item">
            <span>Posts Pending Review</span>
            <strong>0</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
