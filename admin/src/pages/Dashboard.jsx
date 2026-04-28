import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { isSuperAdmin } from '../utils/auth';

const POLL_INTERVAL = 30_000;

const fmt   = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
const fmtK  = (n) => { const v = Number(n || 0); if (v >= 1_000_000) return `KES ${(v/1_000_000).toFixed(1)}M`; if (v >= 1_000) return `KES ${(v/1_000).toFixed(1)}K`; return `KES ${v.toFixed(2)}`; };

const greeting  = () => { const h = new Date().getHours(); if (h < 12) return 'Good morning'; if (h < 17) return 'Good afternoon'; return 'Good evening'; };
const dateLabel = () => new Date().toLocaleDateString('en-KE', { weekday: 'long', month: 'long', day: 'numeric' });

// ── Palette ──────────────────────────────────────────────────────────────────
const PAL = {
  blue:   { border: '#3b82f6', bg: 'var(--blue-dim)',   text: 'var(--blue)' },
  green:  { border: '#10b981', bg: 'var(--green-dim)',  text: 'var(--green)' },
  purple: { border: '#8b5cf6', bg: 'var(--purple-dim)', text: 'var(--purple)' },
  orange: { border: '#f59e0b', bg: 'var(--orange-dim)', text: 'var(--orange)' },
  indigo: { border: '#6366f1', bg: 'var(--accent-dim)', text: 'var(--accent)' },
};

// ── Icons ────────────────────────────────────────────────────────────────────
const I = {
  sessions: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
  revenue:  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  txn:      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  fee:      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
  volume:   <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  operators:<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  rate:     <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
  refresh:  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  warning:  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  // Quick action icons
  wifi:     <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>,
  bundle:   <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  chart:    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  settle:   <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  voucher:  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
  arrow:    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
};

// ── Main stat card (top-border style) ────────────────────────────────────────
function StatCard({ label, value, color = 'blue', icon, sub, subColor, linkTo, linkLabel }) {
  const c = PAL[color] || PAL.blue;
  return (
    <div
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '14px', borderTop: `4px solid ${c.border}`,
        padding: '1.3rem 1.4rem', boxShadow: 'var(--shadow)',
        display: 'flex', flexDirection: 'column', gap: '0.45rem',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e)  => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = 'none'; }}
    >
      {/* Top row: label + icon badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </span>
        <span style={{
          width: 36, height: 36, borderRadius: '10px',
          background: c.bg, color: c.text,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {icon}
        </span>
      </div>

      {/* Value */}
      <div style={{ fontSize: '1.85rem', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1, color: 'var(--text)' }}>
        {value}
      </div>

      {/* Sub label */}
      {sub && (
        <div style={{ fontSize: '0.72rem', fontWeight: 500, color: subColor || 'var(--text-3)' }}>
          {sub}
        </div>
      )}

      {/* View link */}
      {linkTo && (
        <Link
          to={linkTo}
          style={{
            marginTop: '0.5rem', fontSize: '0.75rem', fontWeight: 600,
            color: c.text, textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            opacity: 0.9,
          }}
        >
          {linkLabel || 'View All'} {I.arrow}
        </Link>
      )}
    </div>
  );
}

// ── Quick action card ─────────────────────────────────────────────────────────
function QuickCard({ label, icon, to, color = 'indigo', desc }) {
  const c = PAL[color] || PAL.indigo;
  return (
    <Link
      to={to}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '1.1rem 1.2rem',
        boxShadow: 'var(--shadow)', textDecoration: 'none',
        display: 'flex', alignItems: 'center', gap: '0.9rem',
        transition: 'box-shadow 0.15s, transform 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.borderColor = c.border; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      <span style={{
        width: 40, height: 40, borderRadius: '10px', flexShrink: 0,
        background: c.bg, color: c.text,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </span>
      <div>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        {desc && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: '0.1rem' }}>{desc}</div>}
      </div>
    </Link>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.1em', color: 'var(--text-3)', marginBottom: '0.8rem',
      display: 'flex', alignItems: 'center', gap: '0.5rem',
    }}>
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      {children}
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [secondsAgo, setSecondsAgo]   = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const superAdmin = isSuperAdmin();
  const timerRef   = useRef(null);

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
    <div style={{ maxWidth: 1100 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.75rem' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-3)', fontWeight: 500 }}>{dateLabel()}</p>
          <h1 style={{ margin: '0.15rem 0 0', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            {greeting()} 👋
          </h1>
        </div>
        {freshLabel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem', color: 'var(--text-3)' }}>
            <span>Updated {freshLabel}</span>
            <button
              onClick={fetchStats}
              title="Refresh now"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: '7px', cursor: 'pointer', color: 'var(--text-3)',
                transition: 'color 0.15s, background 0.15s',
              }}
            >
              {I.refresh}
            </button>
          </div>
        )}
      </div>

      {/* ── Pending settlements alert ── */}
      {hasPendingSettlements && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.85rem 1.2rem', borderRadius: '12px', marginBottom: '1.75rem',
          background: 'var(--orange-dim)', border: '1px solid #f59e0b44',
          color: 'var(--orange)', fontSize: '0.85rem', fontWeight: 500,
        }}>
          {I.warning}
          <span>
            <strong>{fmt(stats.pendingSettlements)}</strong> pending settlements — action required.{' '}
            <Link to="/settlements" style={{ color: 'var(--orange)', fontWeight: 700 }}>Settle now →</Link>
          </span>
        </div>
      )}

      {/* ── Live overview ── */}
      <SectionLabel>Live Overview</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <StatCard
          label="Active Sessions" value={stats.activeSessions}
          color="green" icon={I.sessions}
          sub="Currently connected users"
          linkTo="/sessions" linkLabel="View Sessions"
        />
        <StatCard
          label="Revenue Today" value={fmt(stats.todayRevenue)}
          color="blue" icon={I.revenue}
          sub="Gross collection today"
          linkTo="/transactions" linkLabel="View Reports"
        />
        <StatCard
          label="Paid Transactions" value={stats.totalTransactions?.toLocaleString()}
          color="purple" icon={I.txn}
          sub="All successful payments"
          linkTo="/transactions" linkLabel="View All"
        />
      </div>

      {/* ── Platform revenue (superadmin) ── */}
      {superAdmin && (
        <>
          <SectionLabel>Platform Revenue</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <StatCard
              label="Fees Earned Today" value={fmt(stats.platformFeesToday)}
              color="green" icon={I.fee}
              sub={`${feePercent}% platform fee`}
            />
            <StatCard
              label="Fees This Month" value={fmtK(stats.platformFeesMonth)}
              color="blue" icon={I.fee}
              sub="Month-to-date platform cut"
            />
            <StatCard
              label="All-Time Volume" value={fmtK(stats.allTimeVolume)}
              color="indigo" icon={I.volume}
              sub="Total processed on platform"
            />
            <StatCard
              label="Active Operators" value={stats.activeOperators}
              color="purple" icon={I.operators}
              linkTo="/operators" linkLabel="Manage"
            />
            <StatCard
              label="Pending Settlements" value={fmt(stats.pendingSettlements)}
              color={hasPendingSettlements ? 'orange' : 'green'}
              icon={I.settle}
              sub={hasPendingSettlements ? 'Needs settlement' : 'All clear'}
              subColor={hasPendingSettlements ? 'var(--orange)' : 'var(--green)'}
              linkTo="/settlements" linkLabel="Settlements"
            />
            <StatCard
              label="Platform Fee Rate" value={`${feePercent}%`}
              color="indigo" icon={I.rate}
              sub="Deducted per transaction"
            />
          </div>
        </>
      )}

      {/* ── Quick Actions ── */}
      <SectionLabel>Quick Actions</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.85rem' }}>
        <QuickCard label="Active Sessions"  icon={I.wifi}    to="/sessions"     color="green"  desc="Monitor live connections" />
        <QuickCard label="Internet Bundles" icon={I.bundle}  to="/bundles"      color="blue"   desc="Manage data packages" />
        <QuickCard label="Vouchers"         icon={I.voucher} to="/vouchers"     color="purple" desc="Generate &amp; print codes" />
        {superAdmin && <QuickCard label="Analytics"     icon={I.chart}     to="/analytics"    color="indigo" desc="Revenue charts &amp; trends" />}
        {superAdmin && <QuickCard label="Settlements"   icon={I.settle}    to="/settlements"  color="orange" desc="Operator payouts" />}
        {superAdmin && <QuickCard label="Operators"     icon={I.operators} to="/operators"    color="indigo" desc="Manage hotspot owners" />}
      </div>
    </div>
  );
}
