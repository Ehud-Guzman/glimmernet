import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useToast } from '../context/ToastContext';

const STATUS_COLOR = { OK: '#10b981', DOWN: '#ef4444', UNKNOWN: '#6b7280' };
const STATUS_LABEL = { OK: 'Online', DOWN: 'Down', UNKNOWN: 'Unknown' };

function StatusDot({ status }) {
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: STATUS_COLOR[status] || STATUS_COLOR.UNKNOWN,
      boxShadow: status === 'OK' ? `0 0 6px ${STATUS_COLOR.OK}88` : 'none',
    }} />
  );
}

function SummaryCard({ label, count, color }) {
  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${color}44`,
      borderRadius: 10, padding: '0.9rem 1.25rem', minWidth: 110,
      display: 'flex', flexDirection: 'column', gap: '0.2rem',
    }}>
      <span style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{count}</span>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}

function ago(date) {
  if (!date) return 'Never';
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NetworkHealth() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [routers, setRouters] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/admin/network/health');
      setRouters(res.data.data);
      setSummary(res.data.summary);
    } catch {
      addToast('Failed to load network health', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 5 minutes (300000ms)
  useEffect(() => {
    const interval = setInterval(() => load(), 300000);
    return () => clearInterval(interval);
  }, [load]);


  const grouped = {};
  for (const r of routers) {
    if (filter && r.healthStatus !== filter) continue;
    const key = r.operatorId?._id || 'unknown';
    if (!grouped[key]) grouped[key] = { operator: r.operatorId, items: [] };
    grouped[key].items.push(r);
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Network Health</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-3)' }}>
            Live MikroTik router status across all operators
          </p>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading} style={{ fontSize: '0.8rem' }}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {summary && (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <SummaryCard label="Total" count={summary.total} color="var(--text-1)" />
          <SummaryCard label="Online" count={summary.ok} color={STATUS_COLOR.OK} />
          <SummaryCard label="Down" count={summary.down} color={STATUS_COLOR.DOWN} />
          <SummaryCard label="Unknown" count={summary.unknown} color={STATUS_COLOR.UNKNOWN} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {['', 'OK', 'DOWN', 'UNKNOWN'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? <div className="spinner" /> : (
        Object.keys(grouped).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-3)' }}>
            {filter ? (
              <span style={{ fontSize: '0.88rem' }}>No routers with status <strong>{filter}</strong></span>
            ) : (
              <>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📡</div>
                <div style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.35rem' }}>No routers configured yet</div>
                <div style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>Add a MikroTik host to an operator to see live health data here.</div>
                <button className="btn btn-ghost" onClick={() => navigate('/operators')}>
                  Go to Operators →
                </button>
              </>
            )}
          </div>
        ) : (
          Object.values(grouped).map(({ operator, items }) => (
            <div key={operator?._id || 'unknown'} style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                {operator?.name || 'Unknown Operator'}
                {operator?.shortCode && <span style={{ marginLeft: '0.4rem', opacity: 0.6 }}>· {operator.shortCode}</span>}
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Status', 'Router', 'Host', 'Server', 'Last Check', 'Error'].map((h) => (
                        <th key={h} style={{ padding: '0.7rem 1rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => (
                      <tr key={r._id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.8rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <StatusDot status={r.healthStatus} />
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: STATUS_COLOR[r.healthStatus] }}>
                              {STATUS_LABEL[r.healthStatus]}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '0.8rem 1rem', fontWeight: 600 }}>{r.name}</td>
                        <td style={{ padding: '0.8rem 1rem', fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-2)' }}>
                          {r.host}:{r.port}
                        </td>
                        <td style={{ padding: '0.8rem 1rem', color: 'var(--text-3)', fontSize: '0.78rem' }}>{r.hotspotServer}</td>
                        <td style={{ padding: '0.8rem 1rem', color: 'var(--text-3)', fontSize: '0.78rem' }}>{ago(r.lastHealthCheck)}</td>
                        <td style={{ padding: '0.8rem 1rem', color: '#ef4444', fontSize: '0.75rem', maxWidth: 220 }}>
                          {r.healthError || <span style={{ color: 'var(--text-3)' }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )
      )}
    </div>
  );
}
