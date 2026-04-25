import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { setOperatorAuth } from '../utils/operatorAuth';

export default function OperatorLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/v1/operator/auth/login', form);
      setOperatorAuth(res.data);
      navigate('/operator/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Operator Portal</h1>
        <p>WiFi Billing — Venue Dashboard</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-3)', textAlign: 'center' }}>
          Admin? <a href="/login" style={{ color: 'var(--green)' }}>Go to admin login</a>
        </p>
        <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-3)', textAlign: 'center' }}>
          New venue?{' '}
          <Link to="/operator/signup" style={{ color: 'var(--green)' }}>Apply for access →</Link>
        </p>
      </div>
    </div>
  );
}
