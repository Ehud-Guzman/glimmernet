import { useEffect, useState } from 'react';
import axios from 'axios';
import { getToken } from '../utils/auth';

const api = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });

const GROUP_LABELS = {
  billing: 'Billing & Fees',
  mpesa: 'M-Pesa / Daraja',
  mikrotik: 'MikroTik (Default Router)',
  notifications: 'SMS Notifications',
  support: 'Support Contacts',
  security: 'Security',
  general: 'General',
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
  const [saveState, setSaveState] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState({});

  useEffect(() => {
    axios.get('/api/v1/admin/settings', api())
      .then((r) => {
        setSettings(r.data.data);
        const initial = {};
        r.data.data.forEach((s) => { initial[s.key] = s.value; });
        setValues(initial);
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

  const groupOrder = ['billing', 'mpesa', 'mikrotik', 'notifications', 'support', 'security', 'general'];

  const saveBtn = {
    idle:   { label: 'Save All',  cls: 'btn btn-primary', style: {} },
    saving: { label: 'Saving…',   cls: 'btn btn-primary', style: {} },
    saved:  { label: 'Saved ✓',   cls: 'btn btn-primary', style: { background: 'var(--green)', borderColor: 'var(--green)' } },
    error:  { label: 'Save All',  cls: 'btn btn-primary', style: {} },
  }[saveState];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Platform Settings</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-3)' }}>
            All configuration stored in database — no server restart needed.
          </p>
        </div>
        <button
          className={saveBtn.cls}
          onClick={handleSave}
          disabled={saving}
          style={{ minWidth: 100, transition: 'background 0.2s, border-color 0.2s', ...saveBtn.style }}
        >
          {saveBtn.label}
        </button>
      </div>

      {/* Save / error banner */}
      {saveState === 'saved' && (
        <div style={{
          marginBottom: '1.25rem', padding: '0.75rem 1.1rem', borderRadius: '8px',
          background: 'var(--green-dim)', border: '1px solid var(--green)44',
          color: 'var(--green)', fontSize: '0.85rem', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <span>✓</span> Settings saved successfully.
        </div>
      )}
      {saveState === 'error' && error && (
        <div style={{
          marginBottom: '1.25rem', padding: '0.75rem 1.1rem', borderRadius: '8px',
          background: 'var(--red-dim)', border: '1px solid var(--red)44',
          color: 'var(--red)', fontSize: '0.85rem', fontWeight: 500,
        }}>
          {error}
        </div>
      )}

      {groupOrder.map((groupKey) => {
        const items = groups[groupKey];
        if (!items?.length) return null;
        return (
          <div key={groupKey} style={{ marginBottom: '2rem' }}>
            <div style={{
              fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: '0.75rem',
            }}>
              {GROUP_LABELS[groupKey] || groupKey}
            </div>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '10px', overflow: 'hidden',
            }}>
              {items.map((s, i) => {
                const isSensitive = SENSITIVE_KEYS.has(s.key);
                const isRevealed = revealed[s.key] || false;
                return (
                  <div key={s.key} style={{
                    display: 'grid', gridTemplateColumns: '1fr 1.4fr',
                    gap: '1rem', alignItems: 'start',
                    padding: '1rem 1.25rem',
                    borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {s.label}
                        {isSensitive && (
                          <span style={{ fontSize: '0.65rem', fontWeight: 500, color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0 4px' }}>
                            secret
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.2rem', lineHeight: 1.4 }}>
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
                              background: 'var(--surface-2)', cursor: 'pointer',
                              color: isRevealed ? 'var(--green)' : 'var(--text-3)',
                              transition: 'color 0.15s',
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
          </div>
        );
      })}
    </>
  );
}
