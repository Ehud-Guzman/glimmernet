import { useState } from 'react';
import axios from 'axios';
import { autoLogin } from '../App';

const formatBundle = (b) => {
  if (!b) return '';
  const parts = [];
  if (b.durationMinutes) {
    if (b.durationMinutes < 60) parts.push(`${b.durationMinutes} min`);
    else if (b.durationMinutes < 1440) parts.push(`${b.durationMinutes / 60} hrs`);
    else parts.push(`${Math.round(b.durationMinutes / 1440)} day(s)`);
  }
  if (b.dataMB) parts.push(b.dataMB >= 1024 ? `${b.dataMB / 1024} GB data` : `${b.dataMB} MB data`);
  if (b.speedLimitMbps) parts.push(`${b.speedLimitMbps} Mbps`);
  return parts.join(' · ');
};

export default function RedeemForm({ mac, operatorShortCode, brand, onBack }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null); // { username, password, expiresAt, bundle, resumed }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { setError('Please enter a code.'); return; }

    setLoading(true);
    try {
      const res = await axios.post('/api/v1/redeem', { code: trimmed, mac, operatorShortCode });
      setSuccess(res.data);
      autoLogin(res.data.username, res.data.password, brand?.hotspotLoginUrl);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="status-screen">
        <div className="status-icon success">✅</div>
        <h2>{success.resumed ? 'Welcome back!' : 'Code accepted!'}</h2>
        <p>{success.resumed ? 'Your session is still active. Logging you in…' : 'Connecting you now…'}</p>
        {success.bundle && (
          <div className="selected-summary" style={{ marginTop: '1rem' }}>
            <div>
              <div className="s-name">{success.bundle.name}</div>
              <div className="s-meta">{formatBundle(success.bundle)}</div>
            </div>
          </div>
        )}
        {success.expiresAt && (
          <div className="expires-chip">
            Access until {new Date(success.expiresAt).toLocaleString('en-KE', {
              hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="section-intro compact">
        <div>
          <div className="section-eyebrow">Manual access</div>
          <h3>Redeem a voucher or receipt</h3>
        </div>
        <p>Perfect if you already paid earlier or received an access code from the operator.</p>
      </div>

      <div className="section-label">Enter your code</div>
      <p className="redeem-copy">
        Enter your M-Pesa receipt number (e.g. <strong>RLC9AB12CD</strong>) or a voucher code
        you received (e.g. <strong>WIFI-AX3K-9P2M</strong>).
      </p>

      <input
        type="text"
        className="code-input"
        placeholder="WIFI-XXXX-XXXX or M-Pesa receipt"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        autoFocus
        autoComplete="off"
        spellCheck={false}
      />

      <p className="field-hint">Codes are not case-sensitive. We automatically clean and verify them.</p>

      {error && <p className="error-msg">{error}</p>}

      <button className="btn-pay redeem-submit" type="submit" disabled={loading}>
        {loading ? 'Checking code…' : 'Connect now'}
      </button>
      <button type="button" className="btn-back" onClick={onBack}>← Back to plans</button>
    </form>
  );
}
