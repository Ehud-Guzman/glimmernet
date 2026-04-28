import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { isSuperAdmin, getName, clearAuth } from '../utils/auth';
import { getTheme, toggleTheme } from '../utils/theme';
import client from '../api/client';

const MIKROTIK_POLL = 60_000;
const SETTLE_POLL   = 5 * 60_000;

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0 }}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const ICONS = {
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
  info:         ['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M12 8h.01', 'M11 12h1v4h1'],
};

// ── Section info content ───────────────────────────────────────────────────────
const NAV_INFO = {
  dashboard: {
    title: 'Dashboard',
    desc:  'Your system at a glance — live metrics, revenue summary, and quick links to every section.',
    points: [
      'Real-time active session count and today\'s revenue',
      'Pending settlement alerts with a direct action link',
      'Quick access cards to all major sections',
    ],
  },
  sessions: {
    title: 'Sessions',
    desc:  'View and control every WiFi connection on your network, past and present.',
    points: [
      'See all active sessions with MAC address and duration',
      'Manually grant access to a device for any bundle',
      'Terminate a live session immediately from the table',
    ],
  },
  transactions: {
    title: 'Transactions',
    desc:  'Full log of every payment processed through M-Pesa on this platform.',
    points: [
      'Filter by date range, status (paid / failed), or operator',
      'Export transaction history to CSV for accounting',
      'Track pending or failed M-Pesa STK push payments',
    ],
  },
  bundles: {
    title: 'Bundles',
    desc:  'Define the WiFi packages available for customers to buy.',
    points: [
      'Set price, duration, and data cap per package',
      'Toggle bundles active or inactive without deleting',
      'Bundles can be scoped to specific operators',
    ],
  },
  vouchers: {
    title: 'Vouchers',
    desc:  'Generate single-use codes that grant instant WiFi access without M-Pesa.',
    points: [
      'Bulk-generate codes linked to any bundle',
      'Print or export code lists for distribution',
      'Revoke unused vouchers at any time',
    ],
  },
  analytics: {
    title: 'Analytics',
    desc:  'Visual charts and trends across the entire platform for the last 30 days.',
    points: [
      'Daily revenue bar chart and bundle distribution pie',
      'Hourly transaction heatmap to spot peak hours',
      'Per-operator performance comparison table',
    ],
  },
  operators: {
    title: 'Operators',
    desc:  'Manage the hotspot business owners connected to your platform.',
    points: [
      'Approve pending operator sign-up requests',
      'Suspend or reactivate an operator account',
      'View per-operator revenue and wallet balance',
    ],
  },
  settlements: {
    title: 'Settlements',
    desc:  'Process payout requests from operators and track what has been paid.',
    points: [
      'Review pending payout amounts per operator',
      'Mark a settlement as paid with the M-Pesa reference',
      'Full settlement history with timestamps',
    ],
  },
  users: {
    title: 'Admin Users',
    desc:  'Control who can log into this admin dashboard and what they can do.',
    points: [
      'Create new admin accounts with name, email and password',
      'Assign role: admin (limited) or superadmin (full access)',
      'Deactivate accounts without deleting their history',
    ],
  },
  auditLogs: {
    title: 'Audit Logs',
    desc:  'An immutable record of every action performed by admins and operators.',
    points: [
      'Filter by action type (e.g. BUNDLE_CREATED, SESSION_GRANTED)',
      'See who did what and when, with metadata',
      'Logs are retained for 90 days automatically',
    ],
  },
  settings: {
    title: 'Settings',
    desc:  'Configure platform-wide integration credentials and behaviour.',
    points: [
      'M-Pesa / Daraja API keys and short code',
      'MikroTik router connection details',
      'Platform fee rate and allowed CORS origins',
    ],
  },
};

// ── Info popover (fixed, appears to the right of the sidebar) ─────────────────
function InfoPopover({ infoKey, anchorRect, sidebarWidth, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  const info = NAV_INFO[infoKey];
  if (!info || !anchorRect) return null;

  // Position to the right of the sidebar, vertically centred on the anchor
  const left = sidebarWidth + 10;
  const cardHeight = 190;
  const top  = Math.min(
    Math.max(8, anchorRect.top + anchorRect.height / 2 - cardHeight / 2),
    window.innerHeight - cardHeight - 8
  );

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left,
        top,
        width: 270,
        zIndex: 2000,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        boxShadow: 'var(--shadow-lg)',
        padding: '1.1rem 1.2rem',
        animation: 'fadeSlideIn 0.15s ease',
      }}
    >
      {/* Arrow pointing left */}
      <div style={{
        position: 'absolute',
        left: -7,
        top: cardHeight / 2 - 7,
        width: 14,
        height: 14,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRight: 'none',
        borderTop: 'none',
        transform: 'rotate(45deg)',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Icon d={ICONS[infoKey]} size={15} />
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)' }}>{info.title}</span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', padding: '2px', borderRadius: '4px',
            display: 'flex', alignItems: 'center',
          }}
        >
          <Icon d={ICONS.close} size={13} />
        </button>
      </div>

      {/* Description */}
      <p style={{ fontSize: '0.77rem', color: 'var(--text-2)', lineHeight: 1.55, marginBottom: '0.75rem' }}>
        {info.desc}
      </p>

      {/* Bullet points */}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {info.points.map((pt, i) => (
          <li key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <span style={{
              marginTop: '0.3rem', width: 5, height: 5, borderRadius: '50%',
              background: 'var(--accent)', flexShrink: 0,
            }} />
            <span style={{ fontSize: '0.74rem', color: 'var(--text-3)', lineHeight: 1.5 }}>{pt}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Nav item ──────────────────────────────────────────────────────────────────
function NavItem({ to, end, icon, label, onClick, badge, onInfo }) {
  return (
    <div className="nav-item-wrap">
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
      {onInfo && (
        <button
          className="nav-info-btn"
          onClick={(e) => { e.stopPropagation(); onInfo(e, icon); }}
          title={`About ${label}`}
          tabIndex={-1}
        >
          <Icon d={ICONS.info} size={12} />
        </button>
      )}
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────
export default function Layout({ children }) {
  const navigate   = useNavigate();
  const superAdmin = isSuperAdmin();
  const name       = getName();

  const [theme, setTheme]               = useState(getTheme);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [collapsed, setCollapsed]       = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');
  const [mikrotikStatus, setMikrotikStatus] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [popover, setPopover]           = useState(null); // { key, rect }
  const sidebarRef                      = useRef(null);

  const handleToggle = () => { const next = toggleTheme(); setTheme(next); };
  const logout       = () => { clearAuth(); navigate('/login'); };
  const closeSidebar = () => setSidebarOpen(false);
  const closePopover = useCallback(() => setPopover(null), []);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('sidebar-collapsed', next);
      return next;
    });
  };

  const handleInfo = useCallback((e, key) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover((prev) => prev?.key === key ? null : { key, rect });
  }, []);

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

  // Pending settlements badge (superadmin only)
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

  // Close popover on navigation
  useEffect(() => { setPopover(null); }, []);

  const initials = name
    ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  const sidebarWidth = collapsed ? 68 : 248;

  const sidebarClass = [
    'sidebar',
    sidebarOpen ? 'sidebar-open' : '',
    collapsed   ? 'sidebar--collapsed' : '',
  ].filter(Boolean).join(' ');

  // Only show info buttons in expanded state (collapsed uses title tooltip)
  const infoHandler = collapsed ? undefined : handleInfo;

  return (
    <div className="layout">
      {/* Keyframe for popover animation */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .nav-item-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .nav-item-wrap .nav-info-btn {
          position: absolute;
          right: 6px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: rgba(255,255,255,0.25);
          padding: 3px;
          border-radius: 4px;
          display: none;
          align-items: center;
          justify-content: center;
          transition: color 0.14s, background 0.14s;
          line-height: 0;
        }
        .nav-item-wrap:hover .nav-info-btn {
          display: flex;
        }
        .nav-item-wrap .nav-info-btn:hover {
          color: rgba(255,255,255,0.75);
          background: rgba(255,255,255,0.08);
        }
        .nav-item-wrap .nav-item {
          flex: 1;
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

      <aside className={sidebarClass} ref={sidebarRef}>

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
          <NavItem to="/"            end icon="dashboard"    label="Dashboard"    onClick={closeSidebar} onInfo={infoHandler} />
          <NavItem to="/sessions"       icon="sessions"      label="Sessions"     onClick={closeSidebar} onInfo={infoHandler} />
          <NavItem to="/transactions"   icon="transactions"  label="Transactions" onClick={closeSidebar} onInfo={infoHandler} />
          <NavItem to="/bundles"        icon="bundles"       label="Bundles"      onClick={closeSidebar} onInfo={infoHandler} />
          <NavItem to="/vouchers"       icon="vouchers"      label="Vouchers"     onClick={closeSidebar} onInfo={infoHandler} />
        </nav>

        {/* Superadmin nav */}
        {superAdmin && (
          <nav className="sidebar-nav">
            <div className="sidebar-section-label">Platform</div>
            <NavItem to="/analytics"   icon="analytics"   label="Analytics"   onClick={closeSidebar} onInfo={infoHandler} />
            <NavItem to="/operators"   icon="operators"   label="Operators"   onClick={closeSidebar} onInfo={infoHandler} />
            <NavItem to="/settlements" icon="settlements" label="Settlements"  onClick={closeSidebar} onInfo={infoHandler} badge={pendingCount || undefined} />
            <NavItem to="/users"       icon="users"       label="Admin Users" onClick={closeSidebar} onInfo={infoHandler} />
            <NavItem to="/audit-logs"  icon="auditLogs"   label="Audit Logs"  onClick={closeSidebar} onInfo={infoHandler} />
            <NavItem to="/settings"    icon="settings"    label="Settings"    onClick={closeSidebar} onInfo={infoHandler} />
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

      {/* Info popover — rendered outside the sidebar so it's never clipped */}
      {popover && (
        <InfoPopover
          infoKey={popover.key}
          anchorRect={popover.rect}
          sidebarWidth={sidebarWidth}
          onClose={closePopover}
        />
      )}

      <main className="main">{children}</main>
    </div>
  );
}
