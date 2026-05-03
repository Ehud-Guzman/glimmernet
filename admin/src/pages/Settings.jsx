import { useEffect, useState } from 'react';
import axios from 'axios';
import { getToken } from '../utils/auth';

const api = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });

const GROUP_LABELS = {
  billing: 'Billing & Fees',
  mpesa: 'M-Pesa / Daraja',
  mikrotik: 'MikroTik',
  notifications: 'SMS & WhatsApp',
  email: 'SMTP / Email',
  support: 'Support',
  security: 'Security',
  general: 'General',
};

const GROUP_ICONS = {
  billing: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  ),
  mpesa: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
    </svg>
  ),
  mikrotik: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
    </svg>
  ),
  notifications: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.72 12.9 19.79 19.79 0 0 1 1.65 4.27 2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  ),
  support: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  security: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  email: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
    </svg>
  ),
  general: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/>
    </svg>
  ),
};

const GROUP_ORDER = ['billing', 'mpesa', 'mikrotik', 'notifications', 'email', 'support', 'security', 'general'];

const GROUP_HELP = {
  billing: {
    summary: 'Controls fees, grace periods, and billing behaviour applied to all subscriber plans.',
    tips: [
      'Set SMS reminder hours to at least 24 h before plan expiry so users have time to renew.',
      'Grace period gives expired users limited access — keep it short (0–12 h) to avoid abuse.',
      'Changes here apply to new billing cycles only; active plans are not retroactively affected.',
    ],
  },
  mpesa: {
    summary: 'Daraja API credentials that the system uses to initiate STK Push payments and receive callbacks.',
    tips: [
      'Use Sandbox credentials and set environment to "sandbox" while testing; switch to "production" before going live.',
      'The Passkey and Consumer Secret are sensitive — rotate them if they are ever exposed.',
      'Callback URL must be publicly reachable (HTTPS, not localhost) for payment confirmations to land.',
      'Shortcode is your Paybill or Till number registered on Safaricom Daraja.',
    ],
  },
  mikrotik: {
    summary: 'RouterOS API connection used to provision internet access and revoke expired subscribers.',
    tips: [
      'Create a dedicated RouterOS user with only api, read, and write permissions — avoid using admin.',
      'Default API port is 8728 (plain) or 8729 (SSL). Open it in the firewall for the server IP only.',
      'Check live connection status via the Router Status chip in the sidebar footer.',
      'Wrong credentials will prevent plan activation — test after saving.',
    ],
  },
  notifications: {
    summary: "Africa's Talking SMS gateway credentials used to send subscription alerts and receipts to users.",
    tips: [
      'Use username "sandbox" with a test API key while in development.',
      'Switch to your live AT username and production API key before going live.',
      'SMS sender ID must be approved by Africa\'s Talking before it appears on outgoing messages.',
      'Monitor your AT wallet balance — low credit silently drops outgoing SMS.',
    ],
  },
  support: {
    summary: 'Contact details surfaced to subscribers in the self-service portal, receipts, and outgoing SMS.',
    tips: [
      'WhatsApp number must be in international format without the "+" prefix (e.g. 254712345678).',
      'Support email appears on payment receipts and the portal footer — use a monitored inbox.',
    ],
  },
  security: {
    summary: 'Authentication and session security for the admin panel.',
    tips: [
      'JWT secret should be a random string of 32+ characters. Changing it immediately logs out all admins.',
      'Use a short token expiry (e.g. 8h) on shared machines; longer (7d) is fine for personal devices.',
      'Never reuse this secret across other services.',
    ],
  },
  email: {
    summary: 'SMTP settings for outbound operator report emails. Requires nodemailer-compatible mail server credentials.',
    tips: [
      'Use port 587 with STARTTLS (smtp_secure = false) for most providers including Gmail and Outlook.',
      'For Gmail, enable 2FA and generate an App Password — do not use your main account password.',
      'Set smtp_from to match the authenticated sender address to avoid rejection by mail servers.',
      'Test by enabling a single operator report — check that email arrives before enabling globally.',
    ],
  },
  general: {
    summary: 'Global platform identity — business name, currency, and timezone shown across the system.',
    tips: [
      'Business name appears on vouchers, receipts, and the subscriber portal header.',
      'Timezone affects plan expiry calculations — set it correctly before creating any plans.',
      'Currency symbol is cosmetic only; all M-Pesa transactions are processed in KES.',
    ],
  },
};

const SENSITIVE_KEYS = new Set([
  'daraja_passkey', 'daraja_consumer_secret', 'daraja_b2c_security_credential',
  'at_api_key', 'mikrotik_pass',
]);

const EyeIcon = ({ open }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {open ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    )}
  </svg>
);

export default function Settings() {
  const [settings, setSettings] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState({});
  const [activeTab, setActiveTab] = useState(null);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [helpOpen, setHelpOpen] = useState(() => localStorage.getItem('settings_help_dismissed') !== '1');

  useEffect(() => {
    axios.get('/api/v1/admin/settings', api())
      .then((r) => {
        setSettings(r.data.data);
        const initial = {};
        r.data.data.forEach((s) => { initial[s.key] = s.value; });
        setValues(initial);
        const firstGroup = GROUP_ORDER.find((g) => r.data.data.some((s) => s.group === g));
        setActiveTab(firstGroup || null);
      })
      .catch(() => setError('Could not load settings.'))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (key, rawValue, type) => {
    let v = rawValue;
    if (type === 'number') v = rawValue === '' ? '' : Number(rawValue);
    if (type === 'boolean') v = rawValue === 'true' || rawValue === true;
    setValues((prev) => ({ ...prev, [key]: v }));
  };

  const toggleReveal = (key) => setRevealed((r) => ({ ...r, [key]: !r[key] }));

  const handleSave = async () => {
    setSaving(true);
    setSaveState('saving');
    setError('');
    try {
      await axios.put('/api/v1/admin/settings', { settings: values }, api());
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 4000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save settings.');
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 5000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="spinner" style={{ margin: '3rem auto' }} />;

  const groups = {};
  settings.forEach((s) => {
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push(s);
  });

  const availableTabs = GROUP_ORDER.filter((g) => groups[g]?.length);

  const saveBtn = {
    idle:   { label: 'Save',     cls: 'btn btn-primary', style: {} },
    saving: { label: 'Saving…',  cls: 'btn btn-primary', style: {} },
    saved:  { label: 'Saved ✓',  cls: 'btn btn-primary', style: { background: 'var(--green)', borderColor: 'var(--green)' } },
    error:  { label: 'Save',     cls: 'btn btn-primary', style: {} },
  }[saveState];

  const tabItems = activeTab ? (groups[activeTab] || []) : [];

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Platform Settings</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-3)' }}>
            Stored in database — no restart needed.
          </p>
        </div>
        <button
          className={saveBtn.cls}
          onClick={handleSave}
          disabled={saving}
          style={{ minWidth: 90, transition: 'background 0.2s, border-color 0.2s', ...saveBtn.style }}
        >
          {saveBtn.label}
        </button>
      </div>

      {/* Banners */}
      {saveState === 'saved' && (
        <div style={{
          marginBottom: '1rem', padding: '0.65rem 1rem', borderRadius: '8px',
          background: 'var(--green-dim)', border: '1px solid var(--green)44',
          color: 'var(--green)', fontSize: '0.85rem', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          ✓ Settings saved successfully.
        </div>
      )}
      {saveState === 'error' && error && (
        <div style={{
          marginBottom: '1rem', padding: '0.65rem 1rem', borderRadius: '8px',
          background: 'var(--red-dim)', border: '1px solid var(--red)44',
          color: 'var(--red)', fontSize: '0.85rem', fontWeight: 500,
        }}>
          {error}
        </div>
      )}

      {/* Tab bar — segmented pill control */}
      <div
        className="tab-bar"
        style={{ marginBottom: '1.5rem', width: '100%', overflowX: 'auto', flexShrink: 0 }}
      >
        {availableTabs.map((g) => {
          const active = g === activeTab;
          const count = groups[g]?.length ?? 0;
          return (
            <button
              key={g}
              onClick={() => setActiveTab(g)}
              className={`tab${active ? ' active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
            >
              <span style={{ display: 'flex', opacity: active ? 1 : 0.55, transition: 'opacity 0.15s' }}>
                {GROUP_ICONS[g]}
              </span>
              {GROUP_LABELS[g] || g}
              {active && count > 0 && (
                <span style={{
                  fontSize: '0.6rem', fontWeight: 700, lineHeight: 1.6,
                  background: 'var(--accent)', color: '#fff',
                  borderRadius: '999px', padding: '0 5px', letterSpacing: '0.02em',
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow)',
      }}>
        {/* Section header */}
        {activeTab && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.55rem',
            padding: '0.85rem 1.25rem',
            background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ display: 'flex', color: 'var(--accent)', opacity: 0.85 }}>
              {GROUP_ICONS[activeTab]}
            </span>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {GROUP_LABELS[activeTab] || activeTab}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                fontSize: '0.72rem', color: 'var(--text-3)',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '999px', padding: '1px 8px', fontWeight: 500,
              }}>
                {tabItems.length} {tabItems.length === 1 ? 'setting' : 'settings'}
              </span>
              {GROUP_HELP[activeTab] && (
                <button
                  onClick={() => setHelpOpen((v) => { if (v) localStorage.setItem('settings_help_dismissed', '1'); else localStorage.removeItem('settings_help_dismissed'); return !v; })}
                  title={helpOpen ? 'Hide guide' : 'Show guide'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                    padding: '2px 8px', borderRadius: '999px',
                    border: `1px solid ${helpOpen ? 'var(--blue)44' : 'var(--border)'}`,
                    background: helpOpen ? 'var(--blue-dim)' : 'var(--surface)',
                    color: helpOpen ? 'var(--blue)' : 'var(--text-3)',
                    transition: 'all 0.15s',
                  }}
                >
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  Guide
                </button>
              )}
            </div>
          </div>
        )}

        {/* Help / instructions panel */}
        {activeTab && helpOpen && GROUP_HELP[activeTab] && (() => {
          const h = GROUP_HELP[activeTab];
          return (
            <div style={{
              margin: '1rem 1.25rem 0',
              background: 'var(--blue-dim)', border: '1px solid var(--blue)22',
              borderRadius: '8px', overflow: 'hidden',
            }}>
              {/* summary row */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                padding: '0.8rem 1rem',
              }}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.55, flex: 1 }}>
                  {h.summary}
                </p>
                <button
                  onClick={() => { localStorage.setItem('settings_help_dismissed', '1'); setHelpOpen(false); }}
                  style={{
                    flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-3)', fontSize: '1rem', lineHeight: 1, padding: '0 2px',
                    display: 'flex', alignItems: 'center', opacity: 0.6,
                  }}
                  title="Dismiss"
                >
                  ×
                </button>
              </div>

              {/* tips list */}
              {h.tips?.length > 0 && (
                <ul style={{
                  margin: 0, paddingLeft: 0,
                  borderTop: '1px solid var(--blue)18',
                  listStyle: 'none',
                  display: 'flex', flexDirection: 'column',
                }}>
                  {h.tips.map((tip, idx) => (
                    <li
                      key={idx}
                      style={{
                        display: 'flex', alignItems: 'baseline', gap: '0.55rem',
                        padding: '0.45rem 1rem',
                        borderTop: idx > 0 ? '1px solid var(--blue)10' : 'none',
                        fontSize: '0.77rem', color: 'var(--text-3)', lineHeight: 1.5,
                      }}
                    >
                      <span style={{ color: 'var(--blue)', flexShrink: 0, fontSize: '0.65rem', marginTop: '1px' }}>▸</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })()}

        {tabItems.map((s, i) => {
          const isSensitive = SENSITIVE_KEYS.has(s.key);
          const isRevealed = revealed[s.key] || false;
          const isHovered = hoveredRow === s.key;
          const isFirstRow = i === 0;
          return (
            <div
              key={s.key}
              onMouseEnter={() => setHoveredRow(s.key)}
              onMouseLeave={() => setHoveredRow(null)}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 1.4fr',
                gap: '1rem', alignItems: 'center',
                padding: '1rem 1.25rem',
                marginTop: isFirstRow ? '1rem' : 0,
                borderTop: (!isFirstRow) ? '1px solid var(--border)' : 'none',
                background: isHovered ? 'var(--surface-2)' : 'transparent',
                transition: 'background 0.12s',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {s.label}
                  {isSensitive && (
                    <span style={{
                      fontSize: '0.6rem', fontWeight: 600, color: 'var(--orange)',
                      background: 'var(--orange-dim)', border: '1px solid var(--orange)33',
                      borderRadius: '4px', padding: '0 5px', letterSpacing: '0.03em',
                    }}>
                      secret
                    </span>
                  )}
                </div>
                {s.description && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.25rem', lineHeight: 1.5 }}>
                    {s.description}
                  </div>
                )}
              </div>
              <div>
                {s.type === 'boolean' ? (
                  <select
                    className="input"
                    value={String(values[s.key] ?? false)}
                    onChange={(e) => handleChange(s.key, e.target.value, 'boolean')}
                    style={{ maxWidth: 160 }}
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                ) : isSensitive ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', maxWidth: 400 }}>
                    <input
                      className="input"
                      type={isRevealed ? 'text' : 'password'}
                      value={values[s.key] ?? ''}
                      onChange={(e) => handleChange(s.key, e.target.value, s.type)}
                      autoComplete="new-password"
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    <button
                      type="button"
                      onClick={() => toggleReveal(s.key)}
                      title={isRevealed ? 'Hide' : 'Show'}
                      style={{
                        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 34, height: 34, border: '1px solid var(--border)', borderRadius: '6px',
                        background: isRevealed ? 'var(--green-dim)' : 'var(--surface-2)',
                        cursor: 'pointer',
                        color: isRevealed ? 'var(--green)' : 'var(--text-3)',
                        transition: 'color 0.15s, background 0.15s',
                      }}
                    >
                      <EyeIcon open={isRevealed} />
                    </button>
                  </div>
                ) : (
                  <input
                    className="input"
                    type={s.type === 'number' ? 'number' : 'text'}
                    value={values[s.key] ?? ''}
                    onChange={(e) => handleChange(s.key, e.target.value, s.type)}
                    autoComplete="off"
                    style={{ maxWidth: 400, width: '100%' }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
