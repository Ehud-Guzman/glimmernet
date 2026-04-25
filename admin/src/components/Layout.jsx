import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { isSuperAdmin, getName, clearAuth } from '../utils/auth';
import { getTheme, toggleTheme } from '../utils/theme';

export default function Layout({ children }) {
  const navigate = useNavigate();
  const superAdmin = isSuperAdmin();
  const name = getName();
  const [theme, setTheme] = useState(getTheme);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleToggle = () => {
    const next = toggleTheme();
    setTheme(next);
  };

  const logout = () => {
    clearAuth();
    navigate('/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="layout">
      {/* Mobile top bar — hidden on desktop via CSS */}
      <div className="mobile-topbar">
        <button className="hamburger" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle menu">
          <span />
          <span />
          <span />
        </button>
        <span className="mobile-logo">GlimmerInk WiFi</span>
      </div>

      {/* Dim overlay — tapping it closes the sidebar on mobile */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar} />}

      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        {/* Logo */}
        <div className="logo">
          GlimmerInk WiFi
          {superAdmin && (
            <span style={{
              display: 'block', fontSize: '0.65rem', color: 'var(--green)',
              textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '2px', fontWeight: 600,
            }}>
              Superadmin
            </span>
          )}
        </div>

        {/* General nav */}
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''} onClick={closeSidebar}>Dashboard</NavLink>
        <NavLink to="/sessions"     className={({ isActive }) => isActive ? 'active' : ''} onClick={closeSidebar}>Sessions</NavLink>
        <NavLink to="/transactions" className={({ isActive }) => isActive ? 'active' : ''} onClick={closeSidebar}>Transactions</NavLink>
        <NavLink to="/bundles"      className={({ isActive }) => isActive ? 'active' : ''} onClick={closeSidebar}>Bundles</NavLink>
        <NavLink to="/vouchers"     className={({ isActive }) => isActive ? 'active' : ''} onClick={closeSidebar}>Vouchers</NavLink>

        {/* Platform nav — superadmin only */}
        {superAdmin && (
          <>
            <div className="sidebar-section-label">Platform</div>
            <NavLink to="/analytics"   className={({ isActive }) => isActive ? 'active' : ''} onClick={closeSidebar}>Analytics</NavLink>
            <NavLink to="/operators"   className={({ isActive }) => isActive ? 'active' : ''} onClick={closeSidebar}>Operators</NavLink>
            <NavLink to="/settlements" className={({ isActive }) => isActive ? 'active' : ''} onClick={closeSidebar}>Settlements</NavLink>
            <NavLink to="/users"       className={({ isActive }) => isActive ? 'active' : ''} onClick={closeSidebar}>Admin Users</NavLink>
            <NavLink to="/audit-logs"  className={({ isActive }) => isActive ? 'active' : ''} onClick={closeSidebar}>Audit Logs</NavLink>
            <NavLink to="/settings"    className={({ isActive }) => isActive ? 'active' : ''} onClick={closeSidebar}>Settings</NavLink>
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button className="theme-toggle" onClick={handleToggle} title="Toggle light / dark mode">
            <span>{theme === 'light' ? 'Light mode' : 'Dark mode'}</span>
            <span style={{ fontSize: '1rem' }}>{theme === 'light' ? '☀️' : '🌙'}</span>
          </button>

          {name && (
            <div style={{
              fontSize: '0.75rem',
              color: 'var(--sidebar-text)',
              padding: '0.25rem 0.75rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              opacity: 0.7,
            }}>
              {name}
            </div>
          )}

          <button
            className="btn btn-ghost"
            style={{ width: '100%', textAlign: 'left', color: 'var(--sidebar-text)', borderColor: 'var(--sidebar-section)' }}
            onClick={logout}
          >
            Sign out
          </button>

          <div style={{ fontSize: '0.63rem', color: 'var(--sidebar-text)', textAlign: 'center', padding: '0.1rem 0.5rem 0.25rem', lineHeight: 1.5 }}>
            Managed by{' '}
            <a href="https://glimmerink.co.ke" target="_blank" rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
              GlimmerInk Creations
            </a>
          </div>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
