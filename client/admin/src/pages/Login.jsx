import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { API_BASE } from '../services/apiClient';
import toast from 'react-hot-toast';
import '../styles/Login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (!email || !password) {
        toast.error('Please enter email and password');
        setLoading(false);
        return;
      }
      // Call backend API for admin login
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const errData = await res.json();
        toast.error(errData.error || 'Login failed');
        setLoading(false);
        return;
      }
      const data = await res.json();
      // data: { user, token }
      setAuth(data.user, data.token);
      toast.success('Logged in successfully');
      navigate('/');
    } catch (err) {
      toast.error('Login failed');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Admin Panel</h1>
        <p>Sign in to your admin account</p>

        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Sign In'}
          </button>
        </form>

        {/* Backend authentication is now implemented */}
      </div>
    </div>
  );
}
