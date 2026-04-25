import { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

export default function OperatorSignup() {
  const [form, setForm] = useState({ name: '', businessName: '', ownerPhone: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refCode, setRefCode] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/v1/operator/auth/signup', form);
      const code = res.data?.data?.referenceCode || res.data?.referenceCode || '';
      setRefCode(code);
    } catch (err) {
      setError(err.response?.data?.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (refCode) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Application Received</h1>
          <p style={{ color: 'var(--text-2)', marginBottom: '1.25rem' }}>Your reference code:</p>
          <div style={{
            fontFamily: 'monospace', fontSize: '1.4rem', fontWeight: 700,
            letterSpacing: '0.1em', color: 'var(--green)',
            background: 'var(--green-dim)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '1rem', textAlign: 'center', marginBottom: '1.25rem',
          }}>
            {refCode}
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', textAlign: 'center' }}>
            Our team will contact you to verify your details and activate your account.
          </p>
          <Link to="/operator/login" style={{ display: 'block', textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--green)' }}>
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Apply for Access</h1>
        <p style={{ color: 'var(--text-3)', marginBottom: '1.25rem' }}>Register your venue on the platform.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Display Name *</label>
            <input type="text" required value={form.name} placeholder="Karen Cafe"
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Business / M-Pesa Name</label>
            <input type="text" value={form.businessName} placeholder="Legal or till name"
              onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Phone Number *</label>
            <input type="tel" required value={form.ownerPhone} placeholder="07xxxxxxxx"
              onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Email *</label>
            <input type="email" required value={form.email} placeholder="owner@example.com"
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
            {loading ? 'Submitting…' : 'Apply for Access'}
          </button>
        </form>
        <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-3)', textAlign: 'center' }}>
          Already have an account?{' '}
          <Link to="/operator/login" style={{ color: 'var(--green)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
