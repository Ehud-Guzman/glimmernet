import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { isSuperAdmin, getName, clearAuth } from '../utils/auth';
import { getTheme, toggleTheme } from '../utils/theme';
import client from '../api/client';

const MIKROTIK_POLL = 60_000;
const SETTLE_POLL   = 5 * 60_000;
const BANNER_TTL    = 7_000; // auto-dismiss after 7 s

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0 }}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const ICONS = {
  disputes:     ['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  health:       ['M22 12h-4l-3 9L9 3l-3 9H2'],
  dashboard:    'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  sessions:     ['M1.42 9a16 16 0 0 1 21.16 0', 'M5 12.55a11 11 0 0 1 14.08 0', 'M8.53 16.11a6 6 0 0 1 6.95 0', 'M12 20h.01'],
  transactions: ['M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z', 'M1 10h22'],
  bundles:      ['M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', 'M3.27 6.96L12 12.01l8.73-5.05', 'M12 22.08V12'],
  vouchers:     ['M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7', 'M22 7H2v5h20V7z', 'M12 22V7', 'M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z', 'M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z'],
  analytics:    ['M18 20V10', 'M12 20V4', 'M6 20v-6'],
  operators:    ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  settlements:  ['M12 1v22', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],
  users:        ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  auditLogs:    ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
  settings:     ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
  logout:       ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  sun:          ['M12 5V3', 'M12 21v-2', 'M4.22 4.22l1.42 1.42', 'M18.36 18.36l1.42 1.42', 'M3 12H1', 'M23 12h-2', 'M4.22 19.78l1.42-1.42', 'M18.36 5.64l1.42-1.42', 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z'],
  moon:         'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  wifi:         ['M5 12.55a11 11 0 0 1 14.08 0', 'M1.42 9a16 16 0 0 1 21.16 0', 'M8.53 16.11a6 6 0 0 1 6.95 0', 'M12 20h.01'],
  chevronLeft:  ['M15 18l-6-6 6-6'],
  chevronRight: ['M9 18l6-6-6-6'],
  close:        ['M18 6L6 18', 'M6 6l12 12'],
};

// ── Route → info mapping ──────────────────────────────────────────────────────
const ROUTE_MAP = {
  '/':            'dashboard',
  '/sessions':    'sessions',
  '/transactions':'transactions',
  '/bundles':     'bundles',
  '/vouchers':    'vouchers',
  '/analytics':   'analytics',
  '/operators':   'operators',
  '/settlements': 'settlements',
  '/users':       'users',
  '/audit-logs':  'auditLogs',
  '/settings':    'settings',
  '/disputes':    'disputes',
  '/health':      'health',
};

const PAGE_INFO = {
  dashboard: {
    title: 'Dashboard',
    icon:  'dashboard',
    desc:  'Your system at a glance — live session count, revenue today, and quick links to every section.',
    points: [
      'Real-time active sessions and today\'s revenue update every 30 s',
      'Pending settlement alerts with a direct action link',
      'Quick-access cards to all major sections of the platform',
    ],
  },
  sessions: {
    title: 'Sessions',
    icon:  'sessions',
    desc:  'View and control every WiFi connection on your network, past and present.',
    points: [
      'See all active sessions filtered by MAC address, operator, or bundle',
      'Manually grant access to any device using an existing bundle',
      'Terminate a live session immediately — it disconnects from MikroTik instantly',
    ],
  },
  transactions: {
    title: 'Transactions',
    icon:  'transactions',
    desc:  'Full log of every M-Pesa payment processed through this platform.',
    points: [
      'Filter by date range, payment status (paid / failed / pending), or operator',
      'Export any filtered view to CSV for accounting or reconciliation',
      'Failed STK push payments are flagged so you can follow up with the customer',
    ],
  },
  bundles: {
    title: 'Bundles',
    icon:  'bundles',
    desc:  'Define the WiFi packages that customers can purchase on the portal.',
    points: [
      'Set price (KES), duration in minutes, and optional data cap per package',
      'Toggle a bundle inactive without deleting it — it stops appearing on the portal',
      'Bundles deleted here are soft-removed; existing sessions are unaffected',
    ],
  },
  vouchers: {
    title: 'Vouchers',
    icon:  'vouchers',
    desc:  'Generate single-use codes that grant instant WiFi access without M-Pesa.',
    points: [
      'Bulk-generate codes tied to any existing bundle in one click',
      'Print or export the code list as CSV for physical distribution',
      'Revoke any unused voucher at any time to prevent misuse',
    ],
  },
  analytics: {
    title: 'Analytics',
    icon:  'analytics',
    desc:  'Visual charts and trend reports across the entire platform for the last 30 days.',
    points: [
      'Daily revenue bar chart and bundle distribution pie chart',
      'Hourly transaction heatmap to identify your busiest times',
      'Per-operator performance table to compare revenue contribution',
    ],
  },
  operators: {
    title: 'Operators',
    icon:  'operators',
    desc:  'Manage the hotspot business owners connected to your platform.',
    points: [
      'Approve pending sign-up requests or suspend active accounts',
      'View each operator\'s revenue, wallet balance, and session count',
      'Edit credentials, branding name, or short code for any operator',
    ],
  },
  settlements: {
    title: 'Settlements',
    icon:  'settlements',
    desc:  'Process operator payout requests and track what has been paid.',
    points: [
      'Review pending payout amounts calculated from collected revenue minus platform fee',
      'Mark a settlement as paid and attach the M-Pesa transaction reference',
      'Full settlement history with timestamps available per operator',
    ],
  },
  users: {
    title: 'Admin Users',
    icon:  'users',
    desc:  'Control who can log into this admin dashboard and what they can access.',
    points: [
      'Create new admin accounts with name, email, and a temporary password',
      'Assign role: admin (management access) or superadmin (full platform access)',
      'Deactivate an account instantly without losing its audit history',
    ],
  },
  auditLogs: {
    title: 'Audit Logs',
    icon:  'auditLogs',
    desc:  'An immutable trail of every action performed by admins and operators.',
    points: [
      'Filter by action type — e.g. BUNDLE_CREATED, SESSION_TERMINATED, SETTLEMENT_MARKED_PAID',
      'Each entry records who did it, when, and on which resource',
      'Logs are retained automatically for 90 days then purged',
    ],
  },
  settings: {
    title: 'Settings',
    icon:  'settings',
    desc:  'Configure platform-wide credentials and operational behaviour.',
    points: [
      'M-Pesa / Daraja API keys, short code, and passkey for STK push',
      'MikroTik router IP, port, and credentials for session provisioning',
      'Platform fee percentage and allowed CORS origins for the portal',
    ],
  },
  disputes: {
    title: 'Disputes',
    icon:  'disputes',
    desc:  'Review and resolve customer-reported payment and session issues.',
    points: [
      'Customers file disputes when they pay but don\'t get internet',
      'Update status to Investigating → Resolved or Rejected with a note',
      'Track refund amounts issued against each resolved dispute',
    ],
  },
  health: {
    title: 'Network Health',
    icon:  'health',
    desc:  'Real-time health status for all operator routers on the platform.',
    points: [
      'See which MikroTik routers are online or offline right now',
      'Health is checked every 5 minutes by the background monitor',
      'Offline routers are flagged — new sessions will fail for those operators',
    ],
  },
};

// ── Page info banner ──────────────────────────────────────────────────────────
function PageInfoBanner({ infoKey, onDismiss, autoClose = true }) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef(null);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(onDismiss, 280);
  }, [onDismiss]);

  useEffect(() => {
    if (!autoClose) return;
    timerRef.current = setTimeout(dismiss, BANNER_TTL);
    return () => clearTimeout(timerRef.current);
  }, [dismiss, autoClose]);

  const info = PAGE_INFO[infoKey];
  if (!info) return null;

  return (
    <div style={{
      marginBottom: '1.5rem',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderLeft: '4px solid var(--accent)',
      borderRadius: '12px',
      padding: '1rem 1.1rem',
      boxShadow: 'var(--shadow)',
      animation: exiting
        ? 'bannerOut 0.28s ease forwards'
        : 'bannerIn 0.25s ease',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Progress bar — only shown when auto-closing */}
      {autoClose && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0,
          height: 2, background: 'var(--accent)',
          borderRadius: '0 0 0 8px',
          animation: `bannerProgress ${BANNER_TTL}ms linear forwards`,
          opacity: 0.5,
        }} />
      )}

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent)' }}>
          <Icon d={ICONS[info.icon]} size={15} />
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>{info.title}</span>
        </div>
        <button
          onClick={dismiss}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', padding: '2px 4px', borderRadius: '4px',
            display: 'flex', alignItems: 'center', lineHeight: 0,
            transition: 'color 0.14s',
          }}
          title="Dismiss"
        >
          <Icon d={ICONS.close} size={13} />
        </button>
      </div>

      {/* Description */}
      <p style={{ fontSize: '0.78rem', color: 'var(--text-2)', lineHeight: 1.55, marginBottom: '0.65rem' }}>
        {info.desc}
      </p>

      {/* Bullet points */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
        {info.points.map((pt, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <span style={{
              marginTop: '0.35rem', width: 5, height: 5, borderRadius: '50%',
              background: 'var(--accent)', flexShrink: 0, opacity: 0.7,
            }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', lineHeight: 1.5 }}>{pt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Nav item ──────────────────────────────────────────────────────────────────
const NavItem = ({ to, end, icon, label, onClick, badge }) => (
  <NavLink
    to={to}
    end={end}
    title={label}
    data-badge={badge ? 'true' : undefined}
    className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
    onClick={onClick}
  >
    <Icon d={ICONS[icon]} />
    <span>{label}</span>
    {badge && <span className="nav-badge">{badge > 99 ? '99+' : badge}</span>}
  </NavLink>
);

// ── Layout ────────────────────────────────────────────────────────────────────
export default function Layout({ children }) {
  const navigate   = useNavigate();
  const location   = useLocation();
  const superAdmin = isSuperAdmin();
  const name       = getName();

  const [theme, setTheme]               = useState(getTheme);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [collapsed, setCollapsed]       = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');
  const [mikrotikStatus, setMikrotikStatus] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Banner state: null = not shown, string = shown for this key
  const [bannerKey, setBannerKey]     = useState(null);
  const [bannerManual, setBannerManual] = useState(false);
  // Track which routes have been dismissed in this session
  const dismissedRef = useRef(new Set());

  const handleToggle = () => { const next = toggleTheme(); setTheme(next); };
  const logout       = () => { clearAuth(); navigate('/login'); };
  const closeSidebar = () => setSidebarOpen(false);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('sidebar-collapsed', next);
      return next;
    });
  };

  // Show banner automatically on route change (once per route per session)
  useEffect(() => {
    const key = ROUTE_MAP[location.pathname];
    if (key && !dismissedRef.current.has(location.pathname)) {
      setBannerKey(key);
      setBannerManual(false);
    } else {
      setBannerKey(null);
      setBannerManual(false);
    }
  }, [location.pathname]);

  const dismissBanner = useCallback(() => {
    dismissedRef.current.add(location.pathname);
    setBannerKey(null);
  }, [location.pathname]);

  const reopenBanner = () => {
    dismissedRef.current.delete(location.pathname);
    const key = ROUTE_MAP[location.pathname];
    if (key) {
      setBannerKey(key);
      setBannerManual(true); // manually opened — no auto-close
    }
  };

  // Router health
  useEffect(() => {
    const check = () => {
      client.get('/admin/health/mikrotik')
        .then((r) => setMikrotikStatus(r.data.ok ? 'ok' : 'error'))
        .catch(() => setMikrotikStatus('error'));
    };
    check();
    const id = setInterval(check, MIKROTIK_POLL);
    return () => clearInterval(id);
  }, []);

  // Pending settlements badge
  useEffect(() => {
    if (!superAdmin) return;
    const check = () => {
      client.get('/admin/stats')
        .then((r) => {
          const pending = r.data?.data?.pendingSettlements;
          setPendingCount(pending > 0 ? 1 : 0);
        })
        .catch(() => {});
    };
    check();
    const id = setInterval(check, SETTLE_POLL);
    return () => clearInterval(id);
  }, [superAdmin]);

  const initials = name
    ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  const sidebarClass = [
    'sidebar',
    sidebarOpen ? 'sidebar-open' : '',
    collapsed   ? 'sidebar--collapsed' : '',
  ].filter(Boolean).join(' ');

  const showReopenPill = !bannerKey && !!ROUTE_MAP[location.pathname];

  return (
    <div className="layout">
      <style>{`
        @keyframes bannerIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bannerOut {
          from { opacity: 1; transform: translateY(0); max-height: 200px; }
          to   { opacity: 0; transform: translateY(-6px); max-height: 0; padding: 0; margin: 0; }
        }
        @keyframes bannerProgress {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>

      {/* Mobile topbar */}
      <div className="mobile-topbar">
        <button className="hamburger" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle menu">
          <span /><span /><span />
        </button>
        <div className="mobile-brand">
          <Icon d={ICONS.wifi} size={18} />
          <span className="mobile-logo">GlimmerInk WiFi</span>
        </div>
      </div>

      {sidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar} />}

      <aside className={sidebarClass}>
        {/* Brand */}
        <div className="sidebar-brand">
          {!collapsed && (
            <div className="sidebar-brand-icon">
              <Icon d={ICONS.wifi} size={18} />
            </div>
          )}
          {!collapsed && (
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">GlimmerInk WiFi</span>
              {superAdmin && <span className="sidebar-brand-role">Superadmin</span>}
            </div>
          )}
          <button
            className="sidebar-collapse-btn"
            onClick={toggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Icon d={collapsed ? ICONS.chevronRight : ICONS.chevronLeft} size={13} />
          </button>
        </div>

        {/* Primary nav */}
        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Management</div>
          <NavItem to="/"            end icon="dashboard"    label="Dashboard"    onClick={closeSidebar} />
          <NavItem to="/sessions"       icon="sessions"      label="Sessions"     onClick={closeSidebar} />
          <NavItem to="/transactions"   icon="transactions"  label="Transactions" onClick={closeSidebar} />
          <NavItem to="/bundles"        icon="bundles"       label="Bundles"      onClick={closeSidebar} />
          <NavItem to="/vouchers"       icon="vouchers"      label="Vouchers"     onClick={closeSidebar} />
        </nav>

        {/* Superadmin nav */}
        {superAdmin && (
          <nav className="sidebar-nav">
            <div className="sidebar-section-label">Platform</div>
            <NavItem to="/analytics"   icon="analytics"   label="Analytics"     onClick={closeSidebar} />
            <NavItem to="/operators"   icon="operators"   label="Operators"     onClick={closeSidebar} />
            <NavItem to="/settlements" icon="settlements" label="Settlements"   onClick={closeSidebar} badge={pendingCount || undefined} />
            <NavItem to="/disputes"    icon="disputes"    label="Disputes"      onClick={closeSidebar} />
            <NavItem to="/health"      icon="health"      label="Network Health" onClick={closeSidebar} />
            <NavItem to="/users"       icon="users"       label="Admin Users"   onClick={closeSidebar} />
            <NavItem to="/audit-logs"  icon="auditLogs"   label="Audit Logs"   onClick={closeSidebar} />
            <NavItem to="/settings"    icon="settings"    label="Settings"      onClick={closeSidebar} />
          </nav>
        )}

        {/* Footer */}
        <div className="sidebar-footer">
          {mikrotikStatus !== null && (
            <div className={`router-status router-status--${mikrotikStatus}`} title={`Router ${mikrotikStatus === 'ok' ? 'connected' : 'unreachable'}`}>
              <span className="router-dot" />
              <span>Router {mikrotikStatus === 'ok' ? 'connected' : 'unreachable'}</span>
            </div>
          )}
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{name || 'Admin'}</span>
              <span className="sidebar-user-role">{superAdmin ? 'Superadmin' : 'Operator'}</span>
            </div>
            <button className="sidebar-logout-icon" onClick={logout} title="Sign out">
              <Icon d={ICONS.logout} size={15} />
            </button>
          </div>
          <button className="theme-toggle" onClick={handleToggle} title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
            <Icon d={theme === 'light' ? ICONS.moon : ICONS.sun} size={14} />
            <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
          </button>
          {!collapsed && (
            <div className="sidebar-credit">
              Managed by{' '}
              <a href="https://glimmerink.co.ke" target="_blank" rel="noopener noreferrer">
                GlimmerInk Creations
              </a>
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        {/* Page info banner */}
        {bannerKey && (
          <PageInfoBanner key={bannerKey} infoKey={bannerKey} onDismiss={dismissBanner} autoClose={!bannerManual} />
        )}

        {/* Re-open pill — shown after banner is dismissed */}
        {showReopenPill && (
          <button
            onClick={reopenBanner}
            title="Show page guide"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              marginBottom: '1.25rem',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '999px',
              padding: '0.25rem 0.65rem',
              fontSize: '0.7rem', fontWeight: 600,
              color: 'var(--text-3)',
              cursor: 'pointer',
              transition: 'border-color 0.14s, color 0.14s',
              width: 'fit-content',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <Icon d={ICONS.auditLogs} size={11} />
            About this page
          </button>
        )}

        {children}
      </main>
    </div>
  );
}
