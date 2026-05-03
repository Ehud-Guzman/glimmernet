import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getOperatorToken, getOperatorName, getOperatorCode, getOperatorBrandName, clearOperatorAuth } from '../utils/operatorAuth';

const POLL_INTERVAL = 30_000;

const authHeader = () => ({ headers: { Authorization: `Bearer ${getOperatorToken()}` } });
const api = (path, opts) => axios.get(`/api/v1/operator${path}`, { ...authHeader(), ...opts });
const apiPost = (path, data) => axios.post(`/api/v1/operator${path}`, data, authHeader());
const apiPut = (path, data) => axios.put(`/api/v1/operator${path}`, data, authHeader());
const apiPatch = (path, data) => axios.patch(`/api/v1/operator${path}`, data, authHeader());
const apiDel = (path) => axios.delete(`/api/v1/operator${path}`, authHeader());

const fmt = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

const fmtDuration = (mins) => {
  if (!mins) return '—';
  if (mins >= 1440) return `${mins / 1440}d`;
  if (mins >= 60) return `${mins / 60}h`;
  return `${mins}m`;
};

const STAT_META = {
  activeSessions:    { label: 'Active Sessions',     color: 'var(--accent)',  icon: '📡' },
  revenueToday:      { label: 'Revenue Today',        color: 'var(--green)',   icon: '📈', fmt: true, sub: 'your net after fees' },
  revenueMonth:      { label: 'Revenue This Month',   color: 'var(--blue)',    icon: '📅', fmt: true, sub: 'your net after fees' },
  walletBalance:     { label: 'Wallet Balance',        color: 'var(--purple)',  icon: '💳', fmt: true, sub: 'pending payout' },
  txnCount:          { label: 'Total Transactions',   color: 'var(--orange)',  icon: '🔄' },
  accessFailedCount: { label: 'Provision Failures',  color: '#ef4444',        icon: '⚠️', sub: 'paid but no access' },
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

// ── Analytics Tab ─────────────────────────────────────────────────────────────
function AnalyticsTab() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api(`/analytics?days=${days}`)
      .then((r) => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}><div className="spinner" /></div>;
  if (!data) return null;

  const { daily, topBundles } = data;
  const maxRev = Math.max(...daily.map((d) => d.revenue), 1);
  const chartH = 140;

  const fmtDate = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
  };

  const totalRev = daily.reduce((s, d) => s + d.revenue, 0);
  const totalTxn = daily.reduce((s, d) => s + d.count, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
        {[
          { label: `Revenue (${days}d)`, value: fmt(totalRev), color: 'var(--green)' },
          { label: `Transactions (${days}d)`, value: totalTxn, color: 'var(--blue)' },
          { label: 'Avg per day', value: fmt(totalRev / days), color: 'var(--purple)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '1rem 1.2rem', borderTop: `3px solid ${color}`,
          }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: '0.5rem' }}>{label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Chart header */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Net Revenue by Day (KES)</div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {[7, 14, 30].map((d) => (
              <button key={d}
                onClick={() => setDays(d)}
                style={{
                  padding: '0.3rem 0.7rem', borderRadius: 6, border: '1px solid var(--border)',
                  background: days === d ? 'var(--accent)' : 'var(--surface-2)',
                  color: days === d ? '#fff' : 'var(--text-3)',
                  fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >{d}d</button>
            ))}
          </div>
        </div>

        {/* SVG bar chart */}
        <div style={{ overflowX: 'auto' }}>
          <svg
            width={Math.max(days * 28, 300)}
            height={chartH + 32}
            style={{ display: 'block', minWidth: '100%' }}
          >
            {daily.map((d, i) => {
              const barH = d.revenue > 0 ? Math.max((d.revenue / maxRev) * chartH, 4) : 2;
              const x = (i / daily.length) * 100;
              const barW = (0.7 / daily.length) * 100;
              const xPos = `${x + (0.15 / daily.length) * 100}%`;
              const yPos = chartH - barH;
              return (
                <g key={d.date}>
                  <rect
                    x={xPos} y={yPos}
                    width={`${barW}%`} height={barH}
                    rx={3}
                    fill={d.revenue > 0 ? 'var(--accent)' : 'var(--border)'}
                    opacity={d.revenue > 0 ? 0.85 : 1}
                  >
                    <title>{fmtDate(d.date)}: KES {d.revenue.toLocaleString()} ({d.count} txn)</title>
                  </rect>
                  {i % Math.ceil(days / 7) === 0 && (
                    <text
                      x={`${x + (0.5 / daily.length) * 100}%`}
                      y={chartH + 20}
                      textAnchor="middle"
                      fontSize="9"
                      fill="var(--text-3)"
                    >
                      {fmtDate(d.date)}
                    </text>
                  )}
                </g>
              );
            })}
            {/* Zero line */}
            <line x1="0" y1={chartH} x2="100%" y2={chartH} stroke="var(--border)" strokeWidth="1" />
          </svg>
        </div>
      </div>

      {/* Top bundles */}
      {topBundles.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem' }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '1rem' }}>Top Bundles by Revenue</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {topBundles.map((b, i) => {
              const pct = (b.revenue / (topBundles[0]?.revenue || 1)) * 100;
              return (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.3rem' }}>
                    <span style={{ fontWeight: 500 }}>{b.name}</span>
                    <span style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(b.revenue)} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>· {b.count} txn</span></span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: 'var(--accent)', width: `${pct}%`, transition: 'width 0.4s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Setup Checklist ───────────────────────────────────────────────────────────
function SetupChecklist({ profile, bundles, txnCount, onGoTo }) {
  const steps = [
    {
      key: 'router',
      done: !!(profile?.mikrotikHost),
      label: 'Configure your MikroTik router',
      hint: 'Add your router IP, username, and password',
      action: () => onGoTo('settings'),
    },
    {
      key: 'loginUrl',
      done: !!(profile?.hotspotLoginUrl),
      label: 'Set your hotspot login URL',
      hint: 'The URL your router redirects customers to (e.g. http://192.168.88.1/login)',
      action: () => onGoTo('settings'),
    },
    {
      key: 'bundles',
      done: bundles.length > 0,
      label: 'Create at least one internet bundle',
      hint: 'Customers need packages to buy — price, duration or data cap',
      action: () => onGoTo('bundles'),
    },
    {
      key: 'firstPayment',
      done: txnCount > 0,
      label: 'Receive your first payment',
      hint: 'Share your portal link and do a test payment to confirm everything works',
      action: null,
    },
  ];

  const remaining = steps.filter((s) => !s.done).length;
  if (remaining === 0) return null;

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '14px', padding: '1.25rem 1.4rem', marginBottom: '1.5rem',
      borderLeft: '4px solid var(--accent)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>Get started — {remaining} step{remaining > 1 ? 's' : ''} to go live</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: '0.15rem' }}>Complete these to start receiving payments</div>
        </div>
        <div style={{
          fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent)',
          background: 'var(--accent-dim)', padding: '0.2rem 0.6rem', borderRadius: '6px',
        }}>
          {steps.filter((s) => s.done).length}/{steps.length}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
        {steps.map((step) => (
          <div key={step.key} style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            opacity: step.done ? 0.45 : 1,
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              border: `2px solid ${step.done ? 'var(--green)' : 'var(--border)'}`,
              background: step.done ? 'var(--green)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {step.done && (
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: step.done ? 'var(--text-3)' : 'var(--text)', textDecoration: step.done ? 'line-through' : 'none' }}>
                {step.label}
              </div>
              {!step.done && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.1rem' }}>{step.hint}</div>
              )}
            </div>
            {!step.done && step.action && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem', flexShrink: 0 }}
                onClick={step.action}
              >
                Go →
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Provision Failures Tab ────────────────────────────────────────────────────
function FailuresTab({ failures, onRetry }) {
  const [retrying, setRetrying] = useState({});
  const [msgs, setMsgs] = useState({});

  const retry = async (txn) => {
    setRetrying((p) => ({ ...p, [txn._id]: true }));
    setMsgs((p) => ({ ...p, [txn._id]: '' }));
    try {
      await apiPost(`/transactions/${txn._id}/retry-grant`, { macAddress: txn.macAddress });
      setMsgs((p) => ({ ...p, [txn._id]: 'Granted!' }));
      onRetry();
    } catch (e) {
      setMsgs((p) => ({ ...p, [txn._id]: e.response?.data?.message || 'Failed' }));
    } finally {
      setRetrying((p) => ({ ...p, [txn._id]: false }));
    }
  };

  if (!failures.length) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-3)', fontSize: '0.88rem' }}>
        No provision failures — all paid sessions were granted successfully.
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-3)', marginBottom: '1rem' }}>
        These customers paid successfully but did not receive internet access. Use Retry Grant to provision them now.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>Phone</th><th>Bundle</th><th>Amount</th><th>MAC</th><th>Receipt</th><th></th></tr>
          </thead>
          <tbody>
            {failures.map((t) => (
              <tr key={t._id}>
                <td style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                  {new Date(t.createdAt).toLocaleString('en-KE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{t.phone}</td>
                <td>{t.bundleId?.name || '—'}</td>
                <td style={{ fontWeight: 600 }}>{fmt(t.amount)}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.macAddress || '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.mpesaReceiptNumber || '—'}</td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-start' }}>
                    <button className="btn btn-sm btn-primary" onClick={() => retry(t)} disabled={retrying[t._id]}>
                      {retrying[t._id] ? 'Granting…' : 'Retry Grant'}
                    </button>
                    {msgs[t._id] && (
                      <span style={{ fontSize: '0.72rem', color: msgs[t._id] === 'Granted!' ? 'var(--green)' : 'var(--red)' }}>
                        {msgs[t._id]}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Routers Tab ───────────────────────────────────────────────────────────────
const EMPTY_ROUTER = { name: '', host: '', port: '8728', user: '', pass: '', hotspotServer: 'hotspot1', isActive: true };

function RouterModal({ router, onClose, onSuccess }) {
  const isEdit = !!router?._id;
  const [form, setForm] = useState(router ? {
    name: router.name, host: router.host, port: String(router.port || 8728),
    user: router.user, pass: '', hotspotServer: router.hotspotServer || 'hotspot1', isActive: router.isActive,
  } : EMPTY_ROUTER);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [err, setErr] = useState('');

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const testConn = async () => {
    setTesting(true); setTestMsg('');
    try {
      await apiPost(`/routers/${router?._id || 'new'}/test`, form);
      setTestMsg('Connected!');
    } catch (e) {
      setTestMsg(e.response?.data?.message || 'Connection failed');
    } finally { setTesting(false); }
  };

  const submit = async () => {
    if (!form.name || !form.host || !form.user) { setErr('Name, host and username are required.'); return; }
    if (!isEdit && !form.pass) { setErr('Password is required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = { ...form, port: Number(form.port) || 8728 };
      if (isEdit) await apiPut(`/routers/${router._id}`, payload);
      else await apiPost('/routers', payload);
      onSuccess();
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to save router.');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.05rem' }}>{isEdit ? 'Edit Router' : 'Add Router'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label>Display Name *</label>
            <input className="input" placeholder="e.g. Ground Floor" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Host / IP *</label>
            <input className="input" placeholder="192.168.88.1" value={form.host} onChange={(e) => set('host', e.target.value)} />
          </div>
          <div className="form-group">
            <label>API Port</label>
            <input className="input" type="number" value={form.port} onChange={(e) => set('port', e.target.value)} />
          </div>
          <div className="form-group">
            <label>API Username *</label>
            <input className="input" placeholder="admin" value={form.user} onChange={(e) => set('user', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Password {isEdit ? '(leave blank to keep)' : '*'}</label>
            <input className="input" type="password" value={form.pass} onChange={(e) => set('pass', e.target.value)} autoComplete="new-password" />
          </div>
          <div className="form-group">
            <label>Hotspot Server</label>
            <input className="input" placeholder="hotspot1" value={form.hotspotServer} onChange={(e) => set('hotspotServer', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select className="input" value={form.isActive ? 'true' : 'false'} onChange={(e) => set('isActive', e.target.value === 'true')}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>
        {isEdit && (
          <div style={{ marginTop: '0.75rem' }}>
            <button className="btn btn-ghost" onClick={testConn} disabled={testing} style={{ fontSize: '0.8rem' }}>
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
            {testMsg && (
              <span style={{ marginLeft: '0.75rem', fontSize: '0.82rem', color: testMsg === 'Connected!' ? 'var(--green)' : 'var(--red)' }}>
                {testMsg}
              </span>
            )}
          </div>
        )}
        {err && <p className="error-msg" style={{ marginTop: '0.75rem' }}>{err}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Router'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const HEALTH_COLOR = { OK: '#10b981', DOWN: '#ef4444', UNKNOWN: '#6b7280' };

function RoutersTab() {
  const [routers, setRouters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    api('/routers').then((r) => setRouters(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiDel(`/routers/${deleteTarget._id}`);
      setDeleteTarget(null);
      load();
    } catch { /* ignore */ } finally { setDeleting(false); }
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}><div className="spinner" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={() => setModal('new')} style={{ fontSize: '0.82rem' }}>
          + Add Router
        </button>
      </div>
      {modal !== null && (
        <RouterModal
          router={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); load(); }}
        />
      )}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <h3 style={{ margin: '0 0 0.75rem' }}>Remove router?</h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-3)', marginBottom: '1rem' }}>
              Remove <strong>{deleteTarget.name}</strong>? Active sessions using this router will be unaffected.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn" style={{ background: 'var(--red)', color: '#fff', border: 'none' }}
                onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Removing…' : 'Remove'}
              </button>
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {routers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-3)', fontSize: '0.88rem' }}>
          No additional routers configured. Your main router is set in Settings.
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Status</th><th>Name</th><th>Host</th><th>Server</th><th>Last Check</th><th></th></tr>
            </thead>
            <tbody>
              {routers.map((r) => (
                <tr key={r._id}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 700, color: HEALTH_COLOR[r.healthStatus] }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: HEALTH_COLOR[r.healthStatus], display: 'inline-block' }} />
                      {r.healthStatus}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-2)' }}>{r.host}:{r.port}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>{r.hotspotServer}</td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                    {r.lastHealthCheck ? new Date(r.lastHealthCheck).toLocaleString('en-KE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : 'Never'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                        onClick={() => setModal(r)}>Edit</button>
                      <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', color: 'var(--red)', borderColor: 'var(--red)' }}
                        onClick={() => setDeleteTarget(r)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Staff (Sub-users) Tab ─────────────────────────────────────────────────────
const ALL_PERMS = ['viewTransactions', 'viewSessions', 'viewAnalytics', 'grantSessions', 'extendSessions', 'terminateSessions', 'manageVouchers'];
const PERM_LABEL = {
  viewTransactions: 'View Transactions', viewSessions: 'View Sessions', viewAnalytics: 'View Analytics',
  grantSessions: 'Grant Sessions', extendSessions: 'Extend Sessions', terminateSessions: 'Terminate Sessions',
  manageVouchers: 'Manage Vouchers',
};
const EMPTY_SUBUSER = { name: '', email: '', password: '', permissions: { viewTransactions: true, viewSessions: true, viewAnalytics: false, grantSessions: false, extendSessions: false, terminateSessions: false, manageVouchers: false } };

function SubUserModal({ user, onClose, onSuccess }) {
  const isEdit = !!user?._id;
  const [form, setForm] = useState(user ? { name: user.name, email: user.email, password: '', permissions: { ...user.permissions } } : EMPTY_SUBUSER);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const togglePerm = (p) => setForm((prev) => ({ ...prev, permissions: { ...prev.permissions, [p]: !prev.permissions[p] } }));

  const submit = async () => {
    if (!form.name || !form.email) { setErr('Name and email are required.'); return; }
    if (!isEdit && !form.password) { setErr('Password is required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = { name: form.name, email: form.email, permissions: form.permissions };
      if (form.password) payload.password = form.password;
      if (isEdit) await apiPut(`/sub-users/${user._id}`, payload);
      else await apiPost('/sub-users', payload);
      onSuccess();
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to save staff user.');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.05rem' }}>{isEdit ? 'Edit Staff User' : 'Add Staff User'}</h3>
        <div className="form-group">
          <label>Name *</label>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Jane Doe" />
        </div>
        <div className="form-group">
          <label>Email *</label>
          <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="jane@example.com" />
        </div>
        <div className="form-group">
          <label>Password {isEdit ? '(leave blank to keep)' : '*'}</label>
          <input className="input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '0.5rem' }}>Permissions</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
            {ALL_PERMS.map((p) => (
              <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!form.permissions[p]} onChange={() => togglePerm(p)} />
                {PERM_LABEL[p]}
              </label>
            ))}
          </div>
        </div>
        {err && <p className="error-msg">{err}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add User'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function StaffTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    api('/sub-users').then((r) => setUsers(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiDel(`/sub-users/${deleteTarget._id}`);
      setDeleteTarget(null);
      load();
    } catch { /* ignore */ } finally { setDeleting(false); }
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}><div className="spinner" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={() => setModal('new')} style={{ fontSize: '0.82rem' }}>
          + Add Staff User
        </button>
      </div>
      {modal !== null && (
        <SubUserModal
          user={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); load(); }}
        />
      )}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <h3 style={{ margin: '0 0 0.75rem' }}>Remove staff user?</h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-3)', marginBottom: '1rem' }}>
              Remove <strong>{deleteTarget.name}</strong>? They will no longer be able to log in.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn" style={{ background: 'var(--red)', color: '#fff', border: 'none' }}
                onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Removing…' : 'Remove'}
              </button>
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-3)', fontSize: '0.88rem' }}>
          No staff users yet. Add one to let staff log in with limited permissions.
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Permissions</th><th>Status</th><th>Last Login</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{u.email}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                      {ALL_PERMS.filter((p) => u.permissions?.[p]).map((p) => (
                        <span key={p} style={{ fontSize: '0.65rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: 4, background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                          {PERM_LABEL[p]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: u.isActive ? 'var(--green)' : 'var(--text-3)' }}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('en-KE') : 'Never'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                        onClick={() => setModal(u)}>Edit</button>
                      <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', color: 'var(--red)', borderColor: 'var(--red)' }}
                        onClick={() => setDeleteTarget(u)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
  const [extendTarget, setExtendTarget] = useState(null);
  const [extendMins, setExtendMins] = useState('');
  const [extending, setExtending] = useState(false);
  const [extendErr, setExtendErr] = useState('');
  const [failures, setFailures] = useState([]);
  const [kickTarget, setKickTarget] = useState(null);
  const [kickSaving, setKickSaving] = useState(false);
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
      api('/provision-failures'),
    ]).then(([s, sess, t, b, p, settle, f]) => {
      setStats(s.data.data);
      setSessions(sess.data.data);
      setTxns(t.data.data);
      setBundles(b.data.data);
      setProfile(p.data.data);
      setSettlements(settle.data.data);
      setFailures(f.data.data);
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

  const handleExtend = async () => {
    const mins = Number(extendMins);
    if (!mins || mins < 1) { setExtendErr('Enter a positive number of minutes.'); return; }
    setExtending(true); setExtendErr('');
    try {
      await apiPatch(`/sessions/${extendTarget._id}/extend`, { minutes: mins });
      setExtendTarget(null); setExtendMins('');
      fetchAll().catch(() => {});
    } catch (e) {
      setExtendErr(e.response?.data?.message || 'Could not extend session.');
    } finally {
      setExtending(false);
    }
  };

  const handleKick = async () => {
    setKickSaving(true);
    try {
      await apiDel(`/sessions/${kickTarget._id}`);
      setKickTarget(null);
      fetchAll().catch(() => {});
    } catch { /* ignore */ } finally { setKickSaving(false); }
  };

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

  const tabs = ['sessions', 'transactions', 'settlements', 'bundles', 'failures', 'routers', 'staff', 'analytics', 'settings', 'account'];

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
      {extendTarget && (
        <div className="modal-overlay" onClick={() => { setExtendTarget(null); setExtendMins(''); setExtendErr(''); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340 }}>
            <h3 style={{ margin: '0 0 0.75rem' }}>Extend Session</h3>
            <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Add time for <strong>{extendTarget.phone || extendTarget.username}</strong>
            </p>
            <div className="form-group">
              <label>Add minutes</label>
              <input
                className="input"
                type="number"
                min="1"
                max="10080"
                placeholder="e.g. 60"
                value={extendMins}
                onChange={(e) => { setExtendMins(e.target.value); setExtendErr(''); }}
                autoFocus
              />
            </div>
            {extendErr && <p className="error-msg">{extendErr}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button className="btn btn-primary" onClick={handleExtend} disabled={extending}>
                {extending ? 'Extending…' : 'Extend'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setExtendTarget(null); setExtendMins(''); setExtendErr(''); }}>Cancel</button>
            </div>
          </div>
        </div>
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

      {kickTarget && (
        <div className="modal-overlay" onClick={() => setKickTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <h3 style={{ margin: '0 0 0.75rem' }}>Force-terminate session?</h3>
            <p style={{ color: 'var(--text-3)', fontSize: '0.88rem', marginBottom: '1rem' }}>
              This will immediately kick <strong>{kickTarget.phone || kickTarget.username}</strong> from the hotspot and end their session.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn" style={{ background: 'var(--red)', color: '#fff', border: 'none' }}
                onClick={handleKick} disabled={kickSaving}>
                {kickSaving ? 'Terminating…' : 'Terminate'}
              </button>
              <button className="btn btn-ghost" onClick={() => setKickTarget(null)}>Cancel</button>
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

        {/* Setup checklist — only shown when steps remain */}
        <SetupChecklist
          profile={profile}
          bundles={bundles}
          txnCount={stats?.txnCount ?? 0}
          onGoTo={(t) => setTab(t)}
        />

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
      {tab === 'sessions' && (() => {
        const now = Date.now();
        const expiringSoon = sessions.filter(
          (s) => s.expiresAt && new Date(s.expiresAt).getTime() - now <= 60 * 60 * 1000 && new Date(s.expiresAt).getTime() > now
        );
        const fmtMinsLeft = (iso) => {
          const mins = Math.ceil((new Date(iso).getTime() - now) / 60000);
          return mins <= 0 ? 'now' : mins < 60 ? `${mins}m` : `${Math.ceil(mins / 60)}h`;
        };
        return (
          <>
            {expiringSoon.length > 0 && (
              <div style={{
                padding: '0.85rem 1.1rem', borderRadius: '12px', marginBottom: '1rem',
                background: 'var(--orange-dim)', border: '1px solid #f59e0b44',
                fontSize: '0.85rem', color: 'var(--orange)',
              }}>
                <strong>{expiringSoon.length} session{expiringSoon.length > 1 ? 's' : ''} expiring within the hour</strong>
                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {expiringSoon.map((s) => (
                    <div key={s._id} style={{ display: 'flex', gap: '0.75rem', fontSize: '0.82rem' }}>
                      <span style={{ fontFamily: 'monospace', minWidth: 110 }}>{s.phone || 'unknown'}</span>
                      <span>{s.bundleId?.name || '—'}</span>
                      <span style={{ marginLeft: 'auto', fontWeight: 700 }}>expires in {fmtMinsLeft(s.expiresAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Phone</th><th>Bundle</th><th>Expires</th><th>Started</th><th></th><th></th></tr>
                </thead>
                <tbody>
                  {sessions.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No active sessions.</td></tr>
                  )}
                  {sessions.map((s) => {
                    const soonExpiry = s.expiresAt && new Date(s.expiresAt).getTime() - now <= 60 * 60 * 1000 && new Date(s.expiresAt).getTime() > now;
                    return (
                      <tr key={s._id} style={soonExpiry ? { background: 'var(--orange-dim)' } : {}}>
                        <td style={{ fontFamily: 'monospace' }}>{s.phone || '—'}</td>
                        <td>{s.bundleId?.name || '—'}</td>
                        <td style={{ fontSize: '0.82rem', color: soonExpiry ? 'var(--orange)' : 'inherit', fontWeight: soonExpiry ? 600 : 'normal' }}>
                          {s.expiresAt ? new Date(s.expiresAt).toLocaleString('en-KE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : 'No expiry'}
                          {soonExpiry && <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem' }}>({fmtMinsLeft(s.expiresAt)})</span>}
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>
                          {new Date(s.createdAt).toLocaleString('en-KE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', whiteSpace: 'nowrap' }}
                            onClick={() => { setExtendTarget(s); setExtendMins(''); setExtendErr(''); }}
                          >
                            Extend
                          </button>
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', color: 'var(--red)', borderColor: 'var(--red)', whiteSpace: 'nowrap' }}
                            onClick={() => setKickTarget(s)}
                          >
                            Kick
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}

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

      {/* Provision Failures */}
      {tab === 'failures' && (
        <FailuresTab failures={failures} onRetry={() => fetchAll().catch(() => {})} />
      )}

      {/* Routers */}
      {tab === 'routers' && <RoutersTab />}

      {/* Staff */}
      {tab === 'staff' && <StaffTab />}

      {/* Analytics */}
      {tab === 'analytics' && <AnalyticsTab />}

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
