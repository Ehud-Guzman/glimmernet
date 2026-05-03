import { useState } from 'react';
import axios from 'axios';

function fmtKES(n) {
  return `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
}

const TYPE_LABEL = { TOP_UP: 'Top-up', PURCHASE: 'Purchase', REFUND: 'Refund' };
const TYPE_COLOR = { TOP_UP: '#10b981', PURCHASE: '#ef4444', REFUND: '#f59e0b' };

export default function WalletPanel({ operatorShortCode, accentColor = '#00c853' }) {
  const [phone, setPhone] = useState('');
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const lookup = async () => {
    const p = phone.trim();
    if (!p) { setErr('Enter your phone number'); return; }
    setLoading(true); setErr(''); setData(null); setHistory([]);
    try {
      const op = operatorShortCode ? `&op=${encodeURIComponent(operatorShortCode)}` : '';
      const [bal, hist] = await Promise.all([
        axios.get(`/api/v1/wallet/balance?phone=${encodeURIComponent(p)}${op}`),
        axios.get(`/api/v1/wallet/history?phone=${encodeURIComponent(p)}${op}&limit=10`),
      ]);
      setData(bal.data.data);
      setHistory(hist.data.data || []);
    } catch (e) {
      setErr(e.response?.data?.message || 'Could not load wallet. Check your phone number.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      marginTop: '1.25rem',
      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 14, padding: '1.1rem 1.25rem',
    }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(255,255,255,0.4)', marginBottom: '0.75rem' }}>
        Wallet Balance
      </div>

      {!data ? (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookup()}
            placeholder="e.g. 0712 345 678"
            style={{
              flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 9, padding: '0.55rem 0.85rem', color: '#f1f5f9',
              fontSize: '0.88rem', fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button
            onClick={lookup} disabled={loading}
            style={{
              background: accentColor, color: '#fff', border: 'none',
              borderRadius: 9, padding: '0.55rem 1rem', fontWeight: 700,
              fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? '…' : 'Check'}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: accentColor }}>{fmtKES(data.balanceKES)}</span>
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{phone}</span>
            <button
              onClick={() => setData(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '0.75rem' }}
            >
              Change
            </button>
          </div>
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory((v) => !v)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', cursor: 'pointer', padding: 0, fontFamily: 'inherit', marginBottom: showHistory ? '0.75rem' : 0 }}
            >
              {showHistory ? '▲ Hide' : '▼ Show'} history ({history.length})
            </button>
          )}
          {showHistory && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
              {history.map((tx) => (
                <div key={tx._id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.78rem' }}>
                  <span style={{ color: TYPE_COLOR[tx.type] || '#94a3b8', fontWeight: 700, minWidth: 60 }}>{TYPE_LABEL[tx.type] || tx.type}</span>
                  <span style={{ color: TYPE_COLOR[tx.type] === '#ef4444' ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                    {tx.type === 'PURCHASE' ? '−' : '+'}{fmtKES(tx.amountCents / 100)}
                  </span>
                  <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.3)' }}>
                    {new Date(tx.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {err && <p style={{ fontSize: '0.78rem', color: '#ef4444', marginTop: '0.5rem' }}>{err}</p>}
    </div>
  );
}
