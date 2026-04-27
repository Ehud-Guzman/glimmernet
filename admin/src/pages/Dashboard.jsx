import { useEffect, useState, useRef } from 'react';
import client from '../api/client';
import { isSuperAdmin } from '../utils/auth';

const POLL_INTERVAL = 30_000;

const fmt = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const dateLabel = () => new Date().toLocaleDateString('en-KE', { weekday: 'long', month: 'long', day: 'numeric' });

// Minimal inline icons
const Icons = {
  sessions: (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  ),
  revenue: (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  txn: (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
    </svg>
  ),
  fee: (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-4 0v2" /><line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" />
    </svg>
  ),
  volume: (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  operators: (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  rate: (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  ),
  refresh: (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  warning: (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
};

function StatCard({ label, value, color, icon, accent, sub, subColor }) {
  const colorMap = {
    green:  { text: 'var(--green)',  bg: 'var(--green-dim)',  border: 'var(--green)' },
    blue:   { text: 'var(--blue)',   bg: 'var(--blue-dim)',   border: 'var(--blue)' },
    purple: { text: 'var(--purple)', bg: 'var(--purple-dim)', border: 'var(--purple)' },
    orange: { text: 'var(--orange)', bg: 'var(--orange-dim)', border: 'var(--orange)' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className="stat-card" style={accent ? { borderLeft: `3px solid ${c.border}` } : {}}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {label}
        </span>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: '8px',
          background: c.bg, color: c.text, flexShrink: 0,
        }}>
          {icon}
        </span>
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1, color: c.text }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '0.72rem', marginTop: '0.35rem', fontWeight: 500, color: subColor || 'var(--text-3)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
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
    timerRef.current = setInterval(() => setSecondsAgo((s) => s + 1), 1000);
    return () => { clearInterval(pollId); clearInterval(timerRef.current); };
  }, []);

  if (!stats) return <div className="spinner" />;

  const hasPendingSettlements = superAdmin && stats.pendingSettlements > 0;
  const freshLabel = lastUpdated ? (secondsAgo < 5 ? 'just now' : `${secondsAgo}s ago`) : '';
  const feePercent = import.meta.env.VITE_PLATFORM_FEE_PERCENT || '5';

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            {greeting()}
          </h1>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text-3)' }}>
            {dateLabel()}
          </p>
        </div>
        {freshLabel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: 'var(--text-3)', paddingTop: '0.25rem' }}>
            <span>Updated {freshLabel}</span>
            <button
              onClick={fetchStats}
              title="Refresh"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 26, height: 26, background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: '6px', cursor: 'pointer', color: 'var(--text-3)',
                transition: 'color 0.15s, background 0.15s',
              }}
            >
              {Icons.refresh}
            </button>
          </div>
        )}
      </div>

      {/* Pending settlements alert */}
      {hasPendingSettlements && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.8rem 1.1rem', borderRadius: '10px', marginBottom: '1.5rem',
          background: 'var(--orange-dim)', border: '1px solid var(--orange)55',
          color: 'var(--orange)', fontSize: '0.85rem', fontWeight: 500,
        }}>
          {Icons.warning}
          <span>
            Pending settlements: <strong>{fmt(stats.pendingSettlements)}</strong> — action required.
          </span>
        </div>
      )}

      {/* Operational stats */}
      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', marginBottom: '0.75rem' }}>
        Live Overview
      </div>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', marginBottom: '2rem' }}>
        <StatCard label="Active Sessions"   value={stats.activeSessions}                    color="green"  icon={Icons.sessions} />
        <StatCard label="Today's Revenue"   value={fmt(stats.todayRevenue)}                 color="blue"   icon={Icons.revenue} />
        <StatCard label="Paid Transactions" value={stats.totalTransactions.toLocaleString()} color="purple" icon={Icons.txn} />
      </div>

      {/* Platform financials (superadmin) */}
      {superAdmin && (
        <>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', marginBottom: '0.75rem' }}>
            Platform Revenue
          </div>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', marginBottom: '0.75rem' }}>
            <StatCard label="Fees Earned Today" value={fmt(stats.platformFeesToday)} color="green"  icon={Icons.fee}      accent />
            <StatCard label="Fees This Month"   value={fmt(stats.platformFeesMonth)} color="green"  icon={Icons.fee}      accent />
            <StatCard label="All-Time Volume"   value={fmt(stats.allTimeVolume)}     color="blue"   icon={Icons.volume}   accent />
          </div>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            <StatCard label="Active Operators"   value={stats.activeOperators}       color="purple" icon={Icons.operators} />
            <StatCard
              label="Pending Settlements"
              value={fmt(stats.pendingSettlements)}
              color={hasPendingSettlements ? 'orange' : 'green'}
              icon={Icons.revenue}
              accent={hasPendingSettlements}
              sub={hasPendingSettlements ? 'Needs settlement' : 'All clear'}
              subColor={hasPendingSettlements ? 'var(--orange)' : 'var(--green)'}
            />
            <StatCard label="Platform Fee Rate" value={`${feePercent}%`}            color="blue"   icon={Icons.rate} />
          </div>
        </>
      )}
    </>
  );
}
