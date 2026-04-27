import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { isSuperAdmin, getName, clearAuth } from '../utils/auth';
import { getTheme, toggleTheme } from '../utils/theme';
import client from '../api/client';

const MIKROTIK_POLL = 60_000;

// ── Icons ────────────────────────────────────────────────────────────────────
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
  operators:    ['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
  settlements:  ['M12 1v22', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],
  users:        ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  auditLogs:    ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
  settings:     ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
  logout:       ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  sun:          ['M12 5V3', 'M12 21v-2', 'M4.22 4.22l1.42 1.42', 'M18.36 18.36l1.42 1.42', 'M3 12H1', 'M23 12h-2', 'M4.22 19.78l1.42-1.42', 'M18.36 5.64l1.42-1.42', 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z'],
  moon:         'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  wifi:         ['M5 12.55a11 11 0 0 1 14.08 0', 'M1.42 9a16 16 0 0 1 21.16 0', 'M8.53 16.11a6 6 0 0 1 6.95 0', 'M12 20h.01'],
};

const NavItem = ({ to, end, icon, label, onClick }) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
    onClick={onClick}
  >
    <Icon d={ICONS[icon]} />
    <span>{label}</span>
  </NavLink>
);

// ── Component ─────────────────────────────────────────────────────────────────
export default function Layout({ children }) {
  const navigate = useNavigate();
  const superAdmin = isSuperAdmin();
  const name = getName();
  const [theme, setTheme] = useState(getTheme);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mikrotikStatus, setMikrotikStatus] = useState(null);

  const handleToggle = () => { const next = toggleTheme(); setTheme(next); };
  const logout = () => { clearAuth(); navigate('/login'); };
  const closeSidebar = () => setSidebarOpen(false);

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

  const initials = name
    ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  return (
    <div className="layout">
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

      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>

        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <Icon d={ICONS.wifi} size={18} />
          </div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">GlimmerInk WiFi</span>
            {superAdmin && <span className="sidebar-brand-role">Superadmin</span>}
          </div>
        </div>

        {/* Primary nav */}
        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Management</div>
          <NavItem to="/" end icon="dashboard" label="Dashboard" onClick={closeSidebar} />
          <NavItem to="/sessions"     icon="sessions"     label="Sessions"     onClick={closeSidebar} />
          <NavItem to="/transactions" icon="transactions" label="Transactions"  onClick={closeSidebar} />
          <NavItem to="/bundles"      icon="bundles"      label="Bundles"       onClick={closeSidebar} />
          <NavItem to="/vouchers"     icon="vouchers"     label="Vouchers"      onClick={closeSidebar} />
        </nav>

        {/* Superadmin nav */}
        {superAdmin && (
          <nav className="sidebar-nav">
            <div className="sidebar-section-label">Platform</div>
            <NavItem to="/analytics"   icon="analytics"   label="Analytics"    onClick={closeSidebar} />
            <NavItem to="/operators"   icon="operators"   label="Operators"    onClick={closeSidebar} />
            <NavItem to="/settlements" icon="settlements" label="Settlements"  onClick={closeSidebar} />
            <NavItem to="/users"       icon="users"       label="Admin Users"  onClick={closeSidebar} />
            <NavItem to="/audit-logs"  icon="auditLogs"   label="Audit Logs"   onClick={closeSidebar} />
            <NavItem to="/settings"    icon="settings"    label="Settings"     onClick={closeSidebar} />
          </nav>
        )}

        {/* Footer */}
        <div className="sidebar-footer">

          {/* Router status chip */}
          {mikrotikStatus !== null && (
            <div className={`router-status router-status--${mikrotikStatus}`}>
              <span className="router-dot" />
              <span>Router {mikrotikStatus === 'ok' ? 'connected' : 'unreachable'}</span>
            </div>
          )}

          {/* User card */}
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

          {/* Theme toggle */}
          <button className="theme-toggle" onClick={handleToggle} title="Toggle theme">
            <Icon d={theme === 'light' ? ICONS.moon : ICONS.sun} size={14} />
            <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
          </button>

          <div className="sidebar-credit">
            Managed by{' '}
            <a href="https://glimmerink.co.ke" target="_blank" rel="noopener noreferrer">
              GlimmerInk Creations
            </a>
          </div>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
