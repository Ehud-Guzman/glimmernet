import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getOperatorToken, getOperatorName, getOperatorCode, getOperatorBrandName, clearOperatorAuth } from '../utils/operatorAuth';

const POLL_INTERVAL = 30_000;

const authHeader = () => ({ headers: { Authorization: `Bearer ${getOperatorToken()}` } });
const api = (path, opts) => axios.get(`/api/v1/operator${path}`, { ...authHeader(), ...opts });
const apiPost = (path, data) => axios.post(`/api/v1/operator${path}`, data, authHeader());
const apiPut = (path, data) => axios.put(`/api/v1/operator${path}`, data, authHeader());
const apiDel = (path) => axios.delete(`/api/v1/operator${path}`, authHeader());

const fmt = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

const fmtDuration = (mins) => {
  if (!mins) return '—';
  if (mins >= 1440) return `${mins / 1440}d`;
  if (mins >= 60) return `${mins / 60}h`;
  return `${mins}m`;
};

const STAT_META = {
  activeSessions:   { label: 'Active Sessions',     color: 'var(--accent)',  icon: '📡' },
  revenueToday:     { label: 'Revenue Today',        color: 'var(--green)',   icon: '📈', fmt: true, sub: 'your net after fees' },
  revenueMonth:     { label: 'Revenue This Month',   color: 'var(--blue)',    icon: '📅', fmt: true, sub: 'your net after fees' },
  walletBalance:    { label: 'Wallet Balance',        color: 'var(--purple)',  icon: '💳', fmt: true, sub: 'pending payout' },
  txnCount:         { label: 'Total Transactions',   color: 'var(--orange)',  icon: '🔄' },
};

const StatCard = ({ id, value }) => {
  const meta = STAT_META[id] || { label: id, color: 'var(--accent)', icon: '—' };
  const display = meta.fmt ? fmt(value) : value;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '12px', padding: '1.25rem 1.4rem',
      borderTop: `3px solid ${meta.color}`,
      boxShadow: 'var(--shadow)', transition: 'box-shadow 0.15s, transform 0.15s',
      cursor: 'default',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)' }}>
          {meta.label}
        </div>
        <div style={{
          width: 30, height: 30, borderRadius: '8px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: `${meta.color}18`, fontSize: '0.9rem',
        }}>
          {meta.icon}
        </div>
      </div>
      <div style={{ fontSize: '1.55rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
        {display}
      </div>
      {meta.sub && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.35rem' }}>{meta.sub}</div>
      )}
    </div>
  );
};

// ── Grant Session Modal ────────────────────────────────────────────────────────
function GrantModal({ bundles, onClose, onSuccess }) {
  const [form, setForm] = useState({ macAddress: '', bundleId: '', phone: '', durationMinutes: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.macAddress || !form.bundleId) { setErr('MAC address and bundle are required.'); return; }
    setSaving(true); setErr('');
    try {
      await apiPost('/sessions/grant', {
        macAddress: form.macAddress.trim().toUpperCase(),
        bundleId: form.bundleId,
        phone: form.phone.trim(),
        durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
        note: form.note || 'Operator manual grant',
      });
      onSuccess();
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to grant session.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.05rem' }}>Grant Access</h3>
        <div className="form-group">
          <label>Device MAC Address *</label>
          <input className="input" placeholder="AA:BB:CC:DD:EE:FF" value={form.macAddress}
            onChange={(e) => set('macAddress', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Bundle *</label>
          <select className="input" value={form.bundleId} onChange={(e) => set('bundleId', e.target.value)}>
            <option value="">— select bundle —</option>
            {bundles.filter((b) => b.isActive).map((b) => (
              <option key={b._id} value={b._id}>{b.name} — KES {b.price} / {fmtDuration(b.durationMinutes)}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Phone (optional — for records)</label>
          <input className="input" placeholder="0712345678" value={form.phone}
            onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Duration override in minutes (leave blank = bundle default)</label>
          <input className="input" type="number" placeholder="e.g. 60" value={form.durationMinutes}
            onChange={(e) => set('durationMinutes', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Note</label>
          <input className="input" placeholder="Reason for manual grant" value={form.note}
            onChange={(e) => set('note', e.target.value)} />
        </div>
        {err && <p className="error-msg">{err}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Granting…' : 'Grant Access'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Bundle Form Modal ──────────────────────────────────────────────────────────
const EMPTY_BUNDLE = { name: '', price: '', durationMinutes: '', dataMB: '', speedLimitMbps: '', mikrotikProfile: 'default', isActive: true, multiDevice: false, maxDevices: '', validFromHour: '', validToHour: '' };

function BundleModal({ bundle, onClose, onSuccess }) {
  const isEdit = !!bundle?._id;
  const [form, setForm] = useState(bundle ? {
    name: bundle.name,
    price: bundle.price,
    durationMinutes: bundle.durationMinutes ?? '',
    dataMB: bundle.dataMB ?? '',
    speedLimitMbps: bundle.speedLimitMbps ?? '',
    mikrotikProfile: bundle.mikrotikProfile || 'default',
    isActive: bundle.isActive,
    multiDevice: bundle.multiDevice || false,
    maxDevices: bundle.maxDevices != null ? String(bundle.maxDevices) : '',
    validFromHour: bundle.validFromHour != null ? String(bundle.validFromHour) : '',
    validToHour: bundle.validToHour != null ? String(bundle.validToHour) : '',
  } : EMPTY_BUNDLE);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.name || !form.price || !form.mikrotikProfile) { setErr('Name, price and MikroTik profile are required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        name: form.name.trim(),
        price: Number(form.price),
        durationMinutes: form.durationMinutes !== '' ? Number(form.durationMinutes) : null,
        dataMB: form.dataMB !== '' ? Number(form.dataMB) : null,
        speedLimitMbps: form.speedLimitMbps !== '' ? Number(form.speedLimitMbps) : null,
        mikrotikProfile: form.mikrotikProfile.trim(),
        isActive: form.isActive,
        multiDevice: form.multiDevice,
        maxDevices: form.multiDevice && form.maxDevices !== '' ? Number(form.maxDevices) : null,
        validFromHour: form.validFromHour !== '' ? Number(form.validFromHour) : null,
        validToHour: form.validFromHour !== '' && form.validToHour !== '' ? Number(form.validToHour) : null,
      };
      if (isEdit) {
        await apiPut(`/bundles/${bundle._id}`, payload);
      } else {
        await apiPost('/bundles', payload);
      }
      onSuccess();
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to save bundle.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.05rem' }}>{isEdit ? 'Edit Bundle' : 'New Bundle'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label>Name *</label>
            <input className="input" placeholder="e.g. 1 Hour Browsing" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Price (KES) *</label>
            <input className="input" type="number" min="1" value={form.price} onChange={(e) => set('price', e.target.value)} />
          </div>
          <div className="form-group">
            <label>MikroTik Profile *</label>
            <input className="input" placeholder="default" value={form.mikrotikProfile} onChange={(e) => set('mikrotikProfile', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Duration (minutes)</label>
            <input className="input" type="number" min="1" placeholder="60" value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Data cap (MB)</label>
            <input className="input" type="number" min="1" placeholder="blank = unlimited" value={form.dataMB} onChange={(e) => set('dataMB', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Speed limit (Mbps)</label>
            <input className="input" type="number" min="1" placeholder="blank = no limit" value={form.speedLimitMbps} onChange={(e) => set('speedLimitMbps', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select className="input" value={form.isActive ? 'true' : 'false'} onChange={(e) => set('isActive', e.target.value === 'true')}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 'normal' }}>
              <input type="checkbox" checked={form.multiDevice}
                onChange={(e) => set('multiDevice', e.target.checked)}
                style={{ width: 'auto', accentColor: 'var(--accent)' }} />
              Shared voucher for multiple devices
            </label>
          </div>
          {form.multiDevice && (
            <div className="form-group">
              <label>Max Devices</label>
              <input className="input" type="number" min="1" value={form.maxDevices} placeholder="2"
                onChange={(e) => set('maxDevices', e.target.value)} />
            </div>
          )}
          <div className="form-group">
            <label>Happy-hour start (0–23)</label>
            <input className="input" type="number" min="0" max="23" value={form.validFromHour} placeholder="optional"
              onChange={(e) => set('validFromHour', e.target.value)} />
          </div>
          {form.validFromHour !== '' && (
            <div className="form-group">
              <label>Happy-hour end (0–23)</label>
              <input className="input" type="number" min="0" max="23" value={form.validToHour} placeholder="e.g. 17"
                onChange={(e) => set('validToHour', e.target.value)} />
            </div>
          )}
        </div>
        {err && <p className="error-msg">{err}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Bundle'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Settings / Profile Tab ─────────────────────────────────────────────────────
function SettingsTab({ profile, onSaved }) {
  const [form, setForm] = useState(profile ? {
    brandName:       profile.brandName       || '',
    brandTagline:    profile.brandTagline    || '',
    accentColor:     profile.accentColor     || '#00c853',
    logoUrl:         profile.logoUrl         || '',
    hotspotLoginUrl: profile.hotspotLoginUrl || '',
    supportPhone:    profile.supportPhone    || '',
    supportWhatsapp: profile.supportWhatsapp || '',
    supportEmail:    profile.supportEmail    || '',
    trialMinutes:    profile.trialMinutes    ?? 0,
    mikrotikHost:    profile.mikrotikHost    || '',
    mikrotikPort:    profile.mikrotikPort    || 8728,
    mikrotikUser:    profile.mikrotikUser    || '',
    mikrotikPass:    profile.mikrotikPass    || '',
    webhookUrl:      profile.webhookUrl      || '',
    webhookSecret:   profile.webhookSecret   || '',
    autoSettleEnabled:   profile.autoSettleEnabled   ?? false,
    autoSettleThreshold: profile.autoSettleThreshold ?? 500,
  } : {});
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState('');
  const [err, setErr]           = useState('');
  const [testing, setTesting]   = useState(false);
  const [testMsg, setTestMsg]   = useState('');
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState('');
  const [payoutErr, setPayoutErr] = useState('');

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true); setMsg(''); setErr('');
    try {
      await apiPut('/profile', form);
      setMsg('Settings saved.');
      onSaved();
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const testMikrotik = async () => {
    setTesting(true); setTestMsg('');
    try {
      const r = await apiPost('/test-mikrotik', {});
      setTestMsg(`Connected! Router identity: ${r.data.identity}`);
    } catch (e) {
      setTestMsg(`Failed: ${e.response?.data?.message || e.message}`);
    } finally {
      setTesting(false);
    }
  };

  const requestPayout = async () => {
    setPayoutSaving(true); setPayoutMsg(''); setPayoutErr('');
    try {
      const r = await apiPost('/settlements/request', {});
      setPayoutMsg(`Payout of KES ${r.data.data.amount} initiated via M-Pesa.`);
      setPayoutOpen(false);
      onSaved();
    } catch (e) {
      setPayoutErr(e.response?.data?.message || 'Payout failed.');
    } finally {
      setPayoutSaving(false);
    }
  };

  const fieldStyle = { marginBottom: '0.75rem' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 560, paddingTop: '0.25rem' }}>

      {/* Branding */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Portal Branding</h3>
        <div className="form-group" style={fieldStyle}>
          <label>Brand Name</label>
          <input className="input" value={form.brandName} onChange={(e) => set('brandName', e.target.value)} placeholder="Karen Cafe WiFi" />
        </div>
        <div className="form-group" style={fieldStyle}>
          <label>Tagline</label>
          <input className="input" value={form.brandTagline} onChange={(e) => set('brandTagline', e.target.value)} placeholder="Fast, secure guest internet" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label>Accent Color</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="color" value={form.accentColor} onChange={(e) => set('accentColor', e.target.value)}
                style={{ width: 40, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
              <input className="input" style={{ flex: 1 }} value={form.accentColor} onChange={(e) => set('accentColor', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Logo URL (optional)</label>
            <input className="input" value={form.logoUrl} onChange={(e) => set('logoUrl', e.target.value)} placeholder="https://..." />
          </div>
        </div>
        <div className="form-group">
          <label>MikroTik Hotspot Login URL</label>
          <input className="input" value={form.hotspotLoginUrl} onChange={(e) => set('hotspotLoginUrl', e.target.value)} placeholder="http://192.168.88.1/login" />
        </div>
        <div className="form-group">
          <label>Free Trial Minutes (0 = disabled)</label>
          <input className="input" type="number" min="0" value={form.trialMinutes} onChange={(e) => set('trialMinutes', Number(e.target.value))} />
        </div>
      </div>

      {/* Support */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Support Contact</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label>Phone</label>
            <input className="input" value={form.supportPhone} onChange={(e) => set('supportPhone', e.target.value)} placeholder="0712345678" />
          </div>
          <div className="form-group">
            <label>WhatsApp</label>
            <input className="input" value={form.supportWhatsapp} onChange={(e) => set('supportWhatsapp', e.target.value)} placeholder="0712345678" />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label>Email</label>
            <input className="input" type="email" value={form.supportEmail} onChange={(e) => set('supportEmail', e.target.value)} placeholder="support@example.com" />
          </div>
        </div>
      </div>

      {/* MikroTik */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>MikroTik Router</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label>Host / IP</label>
            <input className="input" value={form.mikrotikHost} onChange={(e) => set('mikrotikHost', e.target.value)} placeholder="192.168.88.1" />
          </div>
          <div className="form-group">
            <label>Port</label>
            <input className="input" type="number" value={form.mikrotikPort} onChange={(e) => set('mikrotikPort', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label>Username</label>
            <input className="input" value={form.mikrotikUser} onChange={(e) => set('mikrotikUser', e.target.value)} placeholder="admin" />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label>Password</label>
            <input className="input" type="password" value={form.mikrotikPass} onChange={(e) => set('mikrotikPass', e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        <button className="btn btn-ghost" onClick={testMikrotik} disabled={testing} style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>
          {testing ? 'Testing…' : 'Test Connection'}
        </button>
        {testMsg && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: testMsg.startsWith('Connected') ? 'var(--green)' : 'var(--red)' }}>
            {testMsg}
          </p>
        )}
      </div>

      {/* Webhook */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>Webhook</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', margin: '0 0 1rem' }}>
          We'll POST a signed JSON payload to this URL on every new session.
        </p>
        <div className="form-group" style={fieldStyle}>
          <label>Webhook URL</label>
          <input className="input" value={form.webhookUrl} onChange={(e) => set('webhookUrl', e.target.value)} placeholder="https://your-app.com/webhook" />
        </div>
        <div className="form-group">
          <label>Webhook Secret (HMAC-SHA256 key)</label>
          <input className="input" type="password" value={form.webhookSecret} onChange={(e) => set('webhookSecret', e.target.value)} autoComplete="new-password" placeholder="min 8 characters" />
        </div>
      </div>

      {/* Auto-settlement */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>Auto Payout</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', margin: '0 0 1rem' }}>
          Automatically M-Pesa your wallet to your registered number when balance reaches the threshold.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.88rem' }}>
            <input type="checkbox" checked={form.autoSettleEnabled} onChange={(e) => set('autoSettleEnabled', e.target.checked)} />
            Enable auto-payout
          </label>
        </div>
        {form.autoSettleEnabled && (
          <div className="form-group">
            <label>Threshold (KES)</label>
            <input className="input" type="number" min="10" value={form.autoSettleThreshold}
              onChange={(e) => set('autoSettleThreshold', Number(e.target.value))} style={{ maxWidth: 180 }} />
          </div>
        )}

        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-primary" onClick={() => { setPayoutMsg(''); setPayoutErr(''); setPayoutOpen(true); }}
            style={{ fontSize: '0.82rem' }}>
            Request Payout Now
          </button>
          {payoutMsg && <p style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: 'var(--green)' }}>{payoutMsg}</p>}
        </div>
      </div>

      {/* Save button */}
      {err && <p className="error-msg">{err}</p>}
      {msg && <p style={{ color: 'var(--green)', fontSize: '0.85rem' }}>{msg}</p>}
      <button className="btn btn-primary" onClick={save} disabled={saving} style={{ alignSelf: 'flex-start' }}>
        {saving ? 'Saving…' : 'Save Settings'}
      </button>

      {/* Payout confirm modal */}
      {payoutOpen && (
        <div className="modal-overlay" onClick={() => setPayoutOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <h3 style={{ margin: '0 0 0.75rem' }}>Confirm Payout</h3>
            <p style={{ color: 'var(--text-3)', fontSize: '0.88rem', marginBottom: '1rem' }}>
              Your full wallet balance will be sent to your registered M-Pesa number via B2C. This cannot be reversed.
            </p>
            {payoutErr && <p className="error-msg">{payoutErr}</p>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-primary" onClick={requestPayout} disabled={payoutSaving}>
                {payoutSaving ? 'Processing…' : 'Confirm Payout'}
              </button>
              <button className="btn btn-ghost" onClick={() => setPayoutOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Change Password Section ────────────────────────────────────────────────────
function ChangePassword() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setMsg(''); setErr('');
    if (form.newPassword !== form.confirm) { setErr('New passwords do not match.'); return; }
    if (form.newPassword.length < 8) { setErr('New password must be at least 8 characters.'); return; }
    setSaving(true);
    try {
      await axios.put('/api/v1/operator/auth/password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      }, authHeader());
      setMsg('Password updated successfully.');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to update password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '10px', padding: '1.5rem', maxWidth: 420,
    }}>
      <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Change Password</h3>
      <div className="form-group">
        <label>Current Password</label>
        <input className="input" type="password" value={form.currentPassword} onChange={(e) => set('currentPassword', e.target.value)} autoComplete="current-password" />
      </div>
      <div className="form-group">
        <label>New Password</label>
        <input className="input" type="password" value={form.newPassword} onChange={(e) => set('newPassword', e.target.value)} autoComplete="new-password" />
      </div>
      <div className="form-group">
        <label>Confirm New Password</label>
        <input className="input" type="password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} autoComplete="new-password" />
      </div>
      {err && <p className="error-msg">{err}</p>}
      {msg && <p style={{ color: 'var(--green)', fontSize: '0.85rem' }}>{msg}</p>}
      <button className="btn btn-primary" onClick={submit} disabled={saving} style={{ marginTop: '0.5rem' }}>
        {saving ? 'Updating…' : 'Update Password'}
      </button>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function OperatorDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [txns, setTxns] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [profile, setProfile] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [tab, setTab] = useState('sessions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [grantOpen, setGrantOpen] = useState(false);
  const [bundleModal, setBundleModal] = useState(null); // null | 'new' | bundle object
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteErr, setDeleteErr] = useState('');
  const timerRef = useRef(null);
  const operatorLabel = profile?.brandName || profile?.name || getOperatorBrandName() || getOperatorName();

  const fetchAll = () =>
    Promise.all([
      api('/stats'),
      api('/sessions?status=ACTIVE&limit=50'),
      api('/transactions?limit=50'),
      api('/bundles'),
      api('/profile'),
      api('/settlements'),
    ]).then(([s, sess, t, b, p, settle]) => {
      setStats(s.data.data);
      setSessions(sess.data.data);
      setTxns(t.data.data);
      setBundles(b.data.data);
      setProfile(p.data.data);
      setSettlements(settle.data.data);
      setSecondsAgo(0);
    });

  useEffect(() => {
    const token = getOperatorToken();
    if (!token) { navigate('/operator/login'); return; }

    fetchAll()
      .catch((err) => {
        if (err.response?.status === 401) { clearOperatorAuth(); navigate('/operator/login'); }
        else setError('Could not load dashboard data.');
      })
      .finally(() => setLoading(false));

    const pollId = setInterval(() => { fetchAll().catch(() => {}); }, POLL_INTERVAL);
    timerRef.current = setInterval(() => setSecondsAgo((s) => s + 1), 1000);

    return () => { clearInterval(pollId); clearInterval(timerRef.current); };
  }, [navigate]);

  const logout = () => { clearOperatorAuth(); navigate('/operator/login'); };

  const handleDeleteBundle = async (b) => {
    setDeleteErr('');
    try {
      await apiDel(`/bundles/${b._id}`);
      setDeleteConfirm(null);
      fetchAll().catch(() => {});
    } catch (e) {
      setDeleteErr(e.response?.data?.message || 'Could not delete bundle.');
    }
  };

  if (loading) return <div className="login-wrap"><div className="spinner" /></div>;
  if (error) return <div className="login-wrap"><p className="error-msg">{error}</p></div>;

  const tabs = ['sessions', 'transactions', 'settlements', 'bundles', 'settings', 'account'];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Modals */}
      {grantOpen && (
        <GrantModal
          bundles={bundles}
          onClose={() => setGrantOpen(false)}
          onSuccess={() => { setGrantOpen(false); fetchAll().catch(() => {}); }}
        />
      )}
      {bundleModal !== null && (
        <BundleModal
          bundle={bundleModal === 'new' ? null : bundleModal}
          onClose={() => setBundleModal(null)}
          onSuccess={() => { setBundleModal(null); fetchAll().catch(() => {}); }}
        />
      )}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => { setDeleteConfirm(null); setDeleteErr(''); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <h3 style={{ margin: '0 0 0.75rem' }}>Delete bundle?</h3>
            <p style={{ color: 'var(--text-3)', fontSize: '0.88rem', marginBottom: '1rem' }}>
              This will permanently delete <strong>{deleteConfirm.name}</strong>. You cannot undo this.
            </p>
            {deleteErr && <p className="error-msg">{deleteErr}</p>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn" style={{ background: 'var(--red)', color: '#fff', border: 'none' }}
                onClick={() => handleDeleteBundle(deleteConfirm)}>
                Delete
              </button>
              <button className="btn btn-ghost" onClick={() => { setDeleteConfirm(null); setDeleteErr(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Top bar ── */}
      <div style={{
        background: 'var(--sidebar-bg)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 2rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 60, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#e0e7ff', letterSpacing: '-0.01em' }}>
            {operatorLabel}
          </div>
          <code style={{
            fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '5px',
            background: 'rgba(99,102,241,0.25)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)',
            letterSpacing: '0.06em',
          }}>
            {profile?.shortCode || getOperatorCode()}
          </code>
          <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>
            {secondsAgo < 5 ? 'just updated' : `updated ${secondsAgo}s ago`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-primary" onClick={() => setGrantOpen(true)} style={{ fontSize: '0.82rem' }}>
            + Grant Access
          </button>
          <button onClick={logout} style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.6)', borderRadius: '8px', padding: '0.45rem 1rem',
            fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Sign out
          </button>
        </div>
      </div>

      {/* ── Page body ── */}
      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {Object.keys(STAT_META).map((key) => (
            <StatCard key={key} id={key} value={stats[key] ?? 0} />
          ))}
        </div>

        {/* Tab bar + action */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div className="tab-bar">
            {tabs.map((t) => (
              <button key={t} className={`tab ${tab === t ? 'active' : ''}`}
                onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
                {t}
              </button>
            ))}
          </div>
          {tab === 'bundles' && (
            <button className="btn btn-primary" onClick={() => setBundleModal('new')} style={{ fontSize: '0.82rem' }}>
              + New Bundle
            </button>
          )}
        </div>

      {/* Sessions */}
      {tab === 'sessions' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Phone</th><th>Bundle</th><th>Expires</th><th>Started</th></tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No active sessions.</td></tr>
              )}
              {sessions.map((s) => (
                <tr key={s._id}>
                  <td style={{ fontFamily: 'monospace' }}>{s.phone || '—'}</td>
                  <td>{s.bundleId?.name || '—'}</td>
                  <td style={{ fontSize: '0.82rem' }}>
                    {s.expiresAt ? new Date(s.expiresAt).toLocaleString('en-KE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : 'No expiry'}
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>
                    {new Date(s.createdAt).toLocaleString('en-KE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Transactions */}
      {tab === 'transactions' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Phone</th><th>Bundle</th><th>Amount</th><th>Your Net</th><th>Receipt</th></tr>
            </thead>
            <tbody>
              {txns.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No transactions yet.</td></tr>
              )}
              {txns.map((t) => (
                <tr key={t._id}>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
                    {new Date(t.createdAt).toLocaleString('en-KE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{t.phone}</td>
                  <td>{t.bundleId?.name || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(t.amount)}</td>
                  <td style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(t.operatorNet)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-3)' }}>
                    {t.mpesaReceiptNumber || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Settlements */}
      {tab === 'settlements' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Gross</th><th>Fee</th><th>Paid Out</th><th>Method</th><th>Status</th><th>M-Pesa Ref</th></tr>
            </thead>
            <tbody>
              {settlements.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No payouts yet.</td></tr>
              )}
              {settlements.map((s) => {
                const statusColor = { PAID: 'var(--green)', FAILED: 'var(--red)', PROCESSING: 'var(--orange)', PENDING: 'var(--text-3)' }[s.status] || 'var(--text-3)';
                return (
                  <tr key={s._id}>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
                      {new Date(s.createdAt).toLocaleString('en-KE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{fmt(s.grossAmount)}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>{fmt(s.platformFee)}</td>
                    <td style={{ fontWeight: 600, color: 'var(--green)' }}>{fmt(s.amount)}</td>
                    <td style={{ fontSize: '0.82rem' }}>{s.method}</td>
                    <td><span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor }}>{s.status}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-3)' }}>{s.mpesaRef || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bundles */}
      {tab === 'bundles' && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Price</th><th>Duration</th><th>Data</th><th>Speed</th><th>Profile</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {bundles.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-3)' }}>
                    No bundles yet. Click "+ New Bundle" to create one.
                  </td></tr>
                )}
                {bundles.map((b) => (
                  <tr key={b._id}>
                    <td style={{ fontWeight: 500 }}>{b.name}</td>
                    <td style={{ fontWeight: 600 }}>KES {b.price}</td>
                    <td style={{ fontSize: '0.85rem' }}>{fmtDuration(b.durationMinutes)}</td>
                    <td style={{ fontSize: '0.85rem' }}>{b.dataMB ? `${b.dataMB} MB` : 'Unlimited'}</td>
                    <td style={{ fontSize: '0.85rem' }}>{b.speedLimitMbps ? `${b.speedLimitMbps} Mbps` : '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-3)' }}>{b.mikrotikProfile}</td>
                    <td>
                      <span className={`badge badge-${b.isActive ? 'active' : 'terminated'}`}>
                        {b.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                          onClick={() => setBundleModal(b)}>
                          Edit
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', color: 'var(--red)', borderColor: 'var(--red)' }}
                          onClick={() => { setDeleteErr(''); setDeleteConfirm(b); }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Settings / Profile */}
      {tab === 'settings' && profile && (
        <SettingsTab profile={profile} onSaved={() => fetchAll().catch(() => {})} />
      )}

      {/* Account / Password */}
      {tab === 'account' && (
        <div style={{ paddingTop: '0.5rem' }}>
          <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem' }}>Account Settings</h2>
          <ChangePassword />
        </div>
      )}

      </div>{/* end page body */}
    </div>
  );
}
