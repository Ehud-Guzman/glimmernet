import { useEffect, useState, useRef } from 'react';
import client from '../api/client';
import { isSuperAdmin } from '../utils/auth';

const POLL_INTERVAL = 30_000; // 30 seconds

const fmt = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

function Divider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '2rem 0 1.25rem' }}>
      <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const superAdmin = isSuperAdmin();
  const timerRef = useRef(null);

  const fetchStats = () => {
    client.get('/admin/stats')
      .then((r) => { setStats(r.data.data); setLastUpdated(Date.now()); setSecondsAgo(0); })
      .catch(() => {});
  };

  useEffect(() => {
    fetchStats();
    const pollId = setInterval(fetchStats, POLL_INTERVAL);

    // Tick "X seconds ago" counter every second
    timerRef.current = setInterval(() => setSecondsAgo((s) => s + 1), 1000);

    return () => { clearInterval(pollId); clearInterval(timerRef.current); };
  }, []);

  if (!stats) return <div className="spinner" />;

  const hasPendingSettlements = superAdmin && stats.pendingSettlements > 0;

  const freshLabel = lastUpdated
    ? secondsAgo < 5 ? 'just now' : `${secondsAgo}s ago`
    : '';

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
        <div className="page-title" style={{ marginBottom: 0 }}>Dashboard</div>
        {freshLabel && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
            Updated {freshLabel}
            <button
              onClick={fetchStats}
              style={{ marginLeft: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', fontSize: '0.72rem', padding: 0 }}
            >
              ↻
            </button>
          </span>
        )}
      </div>

      {/* ── Operational stats (all roles) ── */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Active Sessions</div>
          <div className="value green">{stats.activeSessions}</div>
        </div>
        <div className="stat-card">
          <div className="label">Today's Revenue</div>
          <div className="value blue">{fmt(stats.todayRevenue)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Paid Transactions</div>
          <div className="value purple">{stats.totalTransactions.toLocaleString()}</div>
        </div>
      </div>

      {/* ── Platform financials (superadmin only) ── */}
      {superAdmin && (
        <>
          <Divider label="Platform Revenue" />

          <div className="stats-grid">
            <div className="stat-card" style={{ borderColor: 'var(--green)', borderLeftWidth: 3 }}>
              <div className="label">Fees Earned Today</div>
              <div className="value green">{fmt(stats.platformFeesToday)}</div>
            </div>
            <div className="stat-card" style={{ borderColor: 'var(--green)', borderLeftWidth: 3 }}>
              <div className="label">Fees This Month</div>
              <div className="value green">{fmt(stats.platformFeesMonth)}</div>
            </div>
            <div className="stat-card" style={{ borderColor: 'var(--blue)', borderLeftWidth: 3 }}>
              <div className="label">All-Time Volume</div>
              <div className="value blue">{fmt(stats.allTimeVolume)}</div>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="label">Active Operators</div>
              <div className="value purple">{stats.activeOperators}</div>
            </div>
            <div className="stat-card" style={hasPendingSettlements ? { borderColor: 'var(--orange)', borderLeftWidth: 3 } : {}}>
              <div className="label">Pending Settlements</div>
              <div className="value" style={{ color: hasPendingSettlements ? 'var(--orange)' : 'var(--text-3)', fontSize: '1.4rem' }}>
                {fmt(stats.pendingSettlements)}
              </div>
              {hasPendingSettlements && (
                <div style={{ fontSize: '0.72rem', color: 'var(--orange)', marginTop: '0.25rem', fontWeight: 500 }}>
                  Action required →
                </div>
              )}
            </div>
            <div className="stat-card">
              <div className="label">Platform Fee Rate</div>
              <div className="value green">
                {import.meta.env.VITE_PLATFORM_FEE_PERCENT || '5'}%
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
