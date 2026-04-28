import { useEffect, useState } from 'react';
import client from '../api/client';

const EMPTY = {
  shortCode: '', name: '', businessName: '', ownerPhone: '',
  email: '', platformFeePercent: '', mikrotikHost: '',
  mikrotikPort: '8728', mikrotikUser: '', mikrotikPass: '', notes: '',
  status: 'ACTIVE', brandName: '', accentColor: '#00c853',
  brandTagline: '', logoUrl: '', supportWhatsapp: '', supportEmail: '',
  hotspotLoginUrl: '', trialMinutes: '0', supportPhone: '',
};

const fmt = (n) => `KES ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

const Section = ({ label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.25rem 0 1rem' }}>
    <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
      {label}
    </span>
    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
  </div>
);

const BrandPreview = ({ form }) => {
  const name = form.brandName || form.name || 'Your Brand Name';
  const color = form.accentColor || '#00c853';
  const tagline = form.brandTagline || '';
  const logo = form.logoUrl || '';
  const support = [form.supportPhone, form.supportWhatsapp && `WA: ${form.supportWhatsapp}`, form.supportEmail].filter(Boolean);

  return (
    <div style={{
      margin: '1rem 0 0.25rem',
      padding: '0.85rem 1rem',
      borderRadius: '10px',
      border: `1px solid ${color}44`,
      background: `linear-gradient(135deg, ${color}14, transparent 60%)`,
    }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: '0.6rem' }}>
        Portal preview
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{
          width: 44, height: 44, flexShrink: 0, borderRadius: '10px',
          border: `1px solid ${color}40`,
          background: `${color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {logo ? (
            <img src={logo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          ) : (
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <circle cx="12" cy="20" r="1" fill={color} stroke="none" />
            </svg>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)' }}>{name}</div>
          {tagline
            ? <div style={{ fontSize: '0.77rem', color: 'var(--text-2)', marginTop: '0.18rem' }}>{tagline}</div>
            : <div style={{ fontSize: '0.73rem', color: 'var(--text-3)', marginTop: '0.18rem', fontStyle: 'italic' }}>No tagline set</div>
          }
          {support.length > 0 && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.3rem' }}>
              Support: {support.join(' · ')}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--text-3)' }}>{color}</span>
        </div>
      </div>
    </div>
  );
};

const RouterFeedback = ({ status }) => {
  if (!status) return null;
  const ok = status.type === 'ok';
  return (
    <div style={{
      marginTop: '0.75rem',
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      fontSize: '0.82rem',
      background: ok ? 'var(--green-dim)' : 'var(--red-dim)',
      border: `1px solid ${ok ? 'var(--green)' : 'var(--red)'}44`,
      color: ok ? 'var(--green)' : 'var(--red)',
    }}>
      {ok ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1rem' }}>✓</span>
          <div>
            <div style={{ fontWeight: 700 }}>Connected</div>
            <div style={{ opacity: 0.85, fontSize: '0.77rem', marginTop: '0.15rem' }}>
              Router identity: <strong>{status.identity}</strong>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>✗</span>
          <div>
            <div style={{ fontWeight: 700 }}>Failed</div>
            <div style={{ opacity: 0.9, fontSize: '0.77rem', marginTop: '0.15rem', lineHeight: 1.5 }}>{status.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function Operators() {
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | operator obj
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testingRouter, setTestingRouter] = useState(false);
  const [routerStatus, setRouterStatus] = useState(null);
  const [portalPassword, setPortalPassword] = useState('');
  const [settling, setSettling] = useState(null);
  const [settleForm, setSettleForm] = useState({ amount: '', method: 'B2C', notes: '' });
  const [settleError, setSettleError] = useState('');
  const [settleLoading, setSettleLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const globalFeePercent = parseFloat(import.meta.env.VITE_PLATFORM_FEE_PERCENT || '5');
  const isCreate = modal === 'create';

  const load = () => {
    setLoading(true);
    client.get('/admin/operators').then((r) => setOperators(r.data.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(EMPTY); setError(''); setRouterStatus(null); setPortalPassword(''); setModal('create'); };
  const openEdit = (op) => {
    setForm({
      ...op,
      platformFeePercent: op.platformFeePercent !== null ? String(op.platformFeePercent) : '',
      mikrotikPort: String(op.mikrotikPort || 8728),
      brandName: op.brandName || '',
      accentColor: op.accentColor || '#00c853',
      brandTagline: op.brandTagline || '',
      logoUrl: op.logoUrl || '',
      hotspotLoginUrl: op.hotspotLoginUrl || '',
      trialMinutes: String(op.trialMinutes || 0),
      supportPhone: op.supportPhone || '',
      supportWhatsapp: op.supportWhatsapp || '',
      supportEmail: op.supportEmail || '',
    });
    setError(''); setRouterStatus(null); setPortalPassword(''); setModal(op);
  };
  const closeModal = () => { setModal(null); setPortalPassword(''); };

  const setField = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const setRouterField = (key, val) => { setRouterStatus(null); setField(key, val); };

  const handleTestRouter = async () => {
    setTestingRouter(true); setRouterStatus(null);
    try {
      const res = await client.post(`/admin/operators/${modal._id}/test-mikrotik`, {
        mikrotikHost: form.mikrotikHost,
        mikrotikUser: form.mikrotikUser,
        mikrotikPass: form.mikrotikPass,
        mikrotikPort: form.mikrotikPort,
      });
      setRouterStatus({ type: 'ok', identity: res.data.data?.identity || 'unknown' });
    } catch (err) {
      setRouterStatus({ type: 'err', message: err.response?.data?.message || 'Connection failed — check host and credentials.' });
    } finally {
      setTestingRouter(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    const payload = {
      ...form,
      platformFeePercent: form.platformFeePercent !== '' ? Number(form.platformFeePercent) : null,
      mikrotikPort: Number(form.mikrotikPort),
      trialMinutes: Number(form.trialMinutes) || 0,
      ...(portalPassword ? { portalPassword } : {}),
    };
    try {
      if (isCreate) {
        await client.post('/admin/operators', payload);
      } else {
        await client.put(`/admin/operators/${modal._id}`, payload);
      }
      closeModal(); load();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const openSettle = (op) => {
    setSettling(op);
    setSettleForm({ amount: op.walletBalance.toFixed(2), method: 'B2C', notes: '' });
    setSettleError('');
  };

  const handleSettle = async (e) => {
    e.preventDefault();
    setSettleLoading(true); setSettleError('');
    try {
      await client.post('/admin/settlements', { operatorId: settling._id, amount: Number(settleForm.amount), method: settleForm.method, notes: settleForm.notes });
      setSettling(null); load();
    } catch (err) {
      setSettleError(err.response?.data?.message || 'Settlement failed.');
    } finally {
      setSettleLoading(false);
    }
  };

  const effectiveFee = (op) => op.platformFeePercent !== null ? op.platformFeePercent : globalFeePercent;

  const handleDelete = async () => {
    setDeleteLoading(true); setDeleteError('');
    try {
      await client.delete(`/admin/operators/${deleting._id}`);
      setDeleting(null); load();
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Delete failed.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await client.put(`/admin/operators/${id}`, { status: 'ACTIVE' });
      load();
    } catch (err) {
      console.error('Approve failed', err);
    }
  };

  const healthBadge = (op) => {
    const s = op.healthStatus || 'UNKNOWN';
    const styles = {
      OK:      { background: '#dcfce744', color: 'var(--green)', border: '1px solid #86efac55' },
      DOWN:    { background: '#fee2e222', color: 'var(--red)',   border: '1px solid #fca5a555' },
      UNKNOWN: { background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' },
    };
    return (
      <span style={{ fontSize: '0.7rem', fontWeight: 600, borderRadius: '4px', padding: '1px 6px', ...(styles[s] || styles.UNKNOWN) }}>
        {s}
      </span>
    );
  };

  const totalWallet   = operators.reduce((s, o) => s + (o.walletBalance  || 0), 0);
  const totalLifetime = operators.reduce((s, o) => s + (o.lifetimeGross || 0), 0);
  const activeCount   = operators.filter((o) => o.status === 'ACTIVE').length;
  const pendingCount  = operators.filter((o) => o.status === 'PENDING').length;

  return (
    <>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem' }}>
        <div>
          <div className="page-title" style={{ marginBottom: '0.15rem' }}>Operators</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
            {activeCount} active{pendingCount > 0 && ` · ${pendingCount} pending approval`}
            &nbsp;·&nbsp;Global fee <strong style={{ color: 'var(--green)' }}>{globalFeePercent}%</strong>
            &nbsp;·&nbsp;Portal URL: <code style={{ fontSize: '0.75rem' }}>http://&lt;server&gt;:3000/?mac=$mac&amp;op=SHORTCODE</code>
          </div>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Operator</button>
      </div>

      {/* Summary strip */}
      {operators.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '0.75rem', marginBottom: '1.75rem',
        }}>
          {[
            { label: 'Operators', value: operators.length },
            { label: 'Active', value: activeCount },
            { label: 'Pending Wallets', value: fmt(totalWallet) },
            { label: 'Lifetime Volume', value: fmt(totalLifetime) },
          ].map(({ label, value }) => (
            <div key={label} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '0.9rem 1.1rem',
            }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: '0.3rem' }}>{label}</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Cards grid */}
      {loading ? (
        <div className="spinner" />
      ) : operators.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-3)',
          border: '1px dashed var(--border)', borderRadius: '12px',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🏪</div>
          <div style={{ fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-2)' }}>No operators yet</div>
          <div style={{ fontSize: '0.85rem' }}>Add your first hotspot location to get started.</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '1rem',
        }}>
          {operators.map((op) => {
            const color = op.accentColor || '#00c853';
            const health = op.healthStatus || 'UNKNOWN';
            const healthColor = { OK: 'var(--green)', DOWN: 'var(--red)', UNKNOWN: 'var(--text-3)' }[health];
            return (
              <div key={op._id} style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                transition: 'box-shadow 0.15s',
              }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = `0 4px 20px ${color}22`}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
              >
                {/* Color bar + header */}
                <div style={{ height: 4, background: color }} />
                <div style={{ padding: '1rem 1.1rem 0.75rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  {/* Logo / initials */}
                  <div style={{
                    width: 40, height: 40, borderRadius: '8px', flexShrink: 0,
                    background: `${color}20`, border: `1px solid ${color}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                  }}>
                    {op.logoUrl ? (
                      <img src={op.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color, letterSpacing: '-0.02em' }}>
                        {(op.brandName || op.name).slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {op.brandName || op.name}
                    </div>
                    {op.businessName && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {op.businessName}
                      </div>
                    )}
                  </div>
                  {/* Status badge */}
                  <span style={{
                    flexShrink: 0,
                    fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: '4px',
                    ...(op.status === 'ACTIVE'
                      ? { background: '#dcfce744', color: 'var(--green)', border: '1px solid #86efac44' }
                      : op.status === 'PENDING'
                        ? { background: '#fef3c722', color: '#d97706', border: '1px solid #d9770688' }
                        : { background: '#fee2e222', color: 'var(--red)', border: '1px solid #fca5a544' }),
                  }}>
                    {op.status}
                  </span>
                </div>

                {/* Stats row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                  borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                  margin: '0 0',
                }}>
                  {[
                    { label: 'Wallet', value: fmt(op.walletBalance), highlight: op.walletBalance > 0 },
                    { label: 'Lifetime', value: fmt(op.lifetimeGross) },
                    { label: 'Fee', value: `${effectiveFee(op)}%`, sub: op.platformFeePercent !== null ? 'custom' : 'global' },
                  ].map(({ label, value, sub, highlight }) => (
                    <div key={label} style={{ padding: '0.6rem 0.85rem', borderRight: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: '0.2rem' }}>{label}</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: highlight ? 'var(--green)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
                      {sub && <div style={{ fontSize: '0.65rem', color: 'var(--text-3)' }}>{sub}</div>}
                    </div>
                  ))}
                </div>

                {/* Router + contact row */}
                <div style={{ padding: '0.65rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', minHeight: 38 }}>
                  <span style={{ fontSize: '0.72rem', color: healthColor, fontWeight: 600 }}>
                    ● {health}
                  </span>
                  {op.mikrotikHost ? (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontFamily: 'monospace' }}>{op.mikrotikHost}</span>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontStyle: 'italic' }}>no router configured</span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-3)' }}>
                    {op.ownerPhone}
                  </span>
                </div>

                {/* Short code + action buttons */}
                <div style={{
                  padding: '0.6rem 1.1rem',
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                }}>
                  <code style={{ fontSize: '0.72rem', color, background: `${color}18`, border: `1px solid ${color}30`, borderRadius: '4px', padding: '1px 6px', letterSpacing: '0.05em', marginRight: 'auto' }}>
                    {op.shortCode}
                  </code>
                  {op.status === 'PENDING' && (
                    <button className="btn btn-primary"
                      style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem', background: '#d97706', borderColor: '#d97706' }}
                      onClick={() => handleApprove(op._id)}>
                      Approve
                    </button>
                  )}
                  {op.walletBalance > 0 && (
                    <button className="btn btn-primary"
                      style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                      onClick={() => openSettle(op)}>
                      Settle
                    </button>
                  )}
                  <button className="btn btn-ghost"
                    style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                    onClick={() => openEdit(op)}>
                    Edit
                  </button>
                  <button className="btn btn-ghost"
                    style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem', color: 'var(--red)' }}
                    onClick={() => { setDeleteError(''); setDeleting(op); }}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Operator Modal ── */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 600, padding: 0, display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>

            {/* Header */}
            <div style={{ padding: '1.4rem 1.75rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)' }}>
                  {isCreate ? 'Add Operator' : modal.name}
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-3)' }}>
                  {isCreate ? 'Register a new location or business on the platform.' : `Short code: ${modal.shortCode}`}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-3)', lineHeight: 1, padding: '0.1rem 0.25rem', marginLeft: '1rem' }}
              >
                ×
              </button>
            </div>

            {/* Scrollable body */}
            <form id="op-form" onSubmit={handleSave} style={{ flex: 1, overflowY: 'auto', padding: '0 1.75rem' }}>

              {/* ── Identity ── */}
              <Section label="Identity" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label>Short Code</label>
                  <input
                    type="text" required value={form.shortCode}
                    placeholder="e.g. KAFE1"
                    style={{ textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: '0.05em' }}
                    onChange={(e) => setField('shortCode', e.target.value.toUpperCase())}
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>3–10 alphanumeric chars</div>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setField('status', e.target.value)}>
                    {form.status === 'PENDING' && <option value="PENDING" disabled>PENDING (awaiting approval)</option>}
                    <option value="ACTIVE">Active</option>
                    <option value="SUSPENDED">Suspended</option>
                  </select>
                </div>
              </div>

              {/* ── Business Details ── */}
              <Section label="Business Details" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label>Display Name *</label>
                  <input type="text" required value={form.name} placeholder="Karen Cafe" onChange={(e) => setField('name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Business / M-Pesa Name</label>
                  <input type="text" value={form.businessName} placeholder="Legal or till name" onChange={(e) => setField('businessName', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Settlement Phone *</label>
                  <input type="text" required value={form.ownerPhone} placeholder="07xxxxxxxx" onChange={(e) => setField('ownerPhone', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.email} placeholder="owner@example.com" onChange={(e) => setField('email', e.target.value)} />
                </div>
              </div>

              {/* ── Billing ── */}
              <Section label="Billing" />
              <div className="form-group">
                <label>Platform Fee %</label>
                <input
                  type="number" min={0} max={100} step={0.5}
                  value={form.platformFeePercent}
                  placeholder={`Leave blank to use global default (${globalFeePercent}%)`}
                  onChange={(e) => setField('platformFeePercent', e.target.value)}
                />
              </div>

              {/* ── Portal Branding ── */}
              <Section label="Portal Branding" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Brand Name</label>
                  <input
                    type="text"
                    value={form.brandName}
                    placeholder={form.name || 'e.g. Westgate Cafe WiFi'}
                    onChange={(e) => setField('brandName', e.target.value)}
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>
                    Shown on the captive portal. Leave blank to use the display name.
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Accent Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="color"
                      value={form.accentColor || '#00c853'}
                      onChange={(e) => setField('accentColor', e.target.value)}
                      style={{ width: 44, height: 38, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'var(--surface)' }}
                    />
                    <input
                      type="text"
                      value={form.accentColor || '#00c853'}
                      onChange={(e) => setField('accentColor', e.target.value)}
                      style={{ width: 90, fontFamily: 'monospace' }}
                    />
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label>Tagline</label>
                <input
                  type="text"
                  value={form.brandTagline}
                  placeholder="e.g. Fast, secure guest internet"
                  onChange={(e) => setField('brandTagline', e.target.value)}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>
                  One-line subtitle shown below the brand name on the portal.
                </div>
              </div>
              <div className="form-group">
                <label>Logo URL</label>
                <input
                  type="url"
                  value={form.logoUrl}
                  placeholder="https://example.com/logo.png"
                  onChange={(e) => setField('logoUrl', e.target.value)}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>
                  Optional. Replaces the WiFi icon on the portal header. Use a square image, min 80×80 px.
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label>Support Phone</label>
                  <input
                    type="text"
                    value={form.supportPhone}
                    placeholder="0700 000 000"
                    onChange={(e) => setField('supportPhone', e.target.value)}
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>
                    Shown on timeout screen &amp; SMS.
                  </div>
                </div>
                <div className="form-group">
                  <label>Support WhatsApp</label>
                  <input
                    type="text"
                    value={form.supportWhatsapp}
                    placeholder="0700 000 000"
                    onChange={(e) => setField('supportWhatsapp', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Support Email</label>
                  <input
                    type="email"
                    value={form.supportEmail}
                    placeholder="help@cafe.co.ke"
                    onChange={(e) => setField('supportEmail', e.target.value)}
                  />
                </div>
              </div>
              <BrandPreview form={form} />

              {/* ── Hotspot & Trial ── */}
              <Section label="Hotspot & Free Trial" />
              <div className="form-group">
                <label>MikroTik Hotspot Login URL</label>
                <input
                  type="text"
                  value={form.hotspotLoginUrl}
                  placeholder="http://192.168.88.1/login"
                  onChange={(e) => setField('hotspotLoginUrl', e.target.value)}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>
                  Where the portal auto-submits credentials after payment. Set to your router's login page URL.
                </div>
              </div>
              <div className="form-group">
                <label>Free Trial (minutes)</label>
                <input
                  type="number" min={0} max={60} step={1}
                  value={form.trialMinutes}
                  placeholder="0 = disabled"
                  onChange={(e) => setField('trialMinutes', e.target.value)}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>
                  New devices get this many free minutes before the payment wall. 0 = disabled.
                </div>
              </div>

              {/* ── Operator Portal Login ── */}
              <Section label="Operator Portal Login" />
              <div className="form-group">
                <label>{isCreate ? 'Portal Password *' : 'Set / Change Portal Password'}</label>
                <input
                  type="password"
                  value={portalPassword}
                  autoComplete="new-password"
                  placeholder={isCreate ? 'Min 8 characters' : 'Leave blank to keep existing password'}
                  onChange={(e) => setPortalPassword(e.target.value)}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>
                  Operator uses their <strong>email</strong> + this password to log in at <code>/operator/login</code>. Login requires a valid email above.
                </div>
              </div>

              {/* ── MikroTik Router ── */}
              <Section label="MikroTik Router" />
              <div style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '1rem',
                marginBottom: '0.75rem',
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Host / IP Address</label>
                    <input type="text" value={form.mikrotikHost} placeholder="192.168.88.1"
                      autoComplete="off" onChange={(e) => setRouterField('mikrotikHost', e.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, width: 90 }}>
                    <label>API Port</label>
                    <input type="text" value={form.mikrotikPort} placeholder="8728"
                      onChange={(e) => setRouterField('mikrotikPort', e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>API Username</label>
                    <input type="text" value={form.mikrotikUser} placeholder="admin"
                      autoComplete="off" onChange={(e) => setRouterField('mikrotikUser', e.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>API Password</label>
                    <input type="password" value={form.mikrotikPass} placeholder="••••••••"
                      autoComplete="new-password" onChange={(e) => setRouterField('mikrotikPass', e.target.value)} />
                  </div>
                </div>

                {/* Test connection — only after operator exists */}
                {!isCreate && (
                  <div style={{ marginTop: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem' }}
                        disabled={testingRouter || !form.mikrotikHost}
                        onClick={handleTestRouter}
                      >
                        {testingRouter ? 'Testing…' : 'Test Connection'}
                      </button>
                      {!form.mikrotikHost && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Enter a host IP above to test</span>
                      )}
                    </div>
                    {form.mikrotikHost && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.35rem' }}>
                        Tests the values currently entered above — no need to save first.
                      </div>
                    )}
                  </div>
                )}
                {isCreate && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.75rem', marginBottom: 0 }}>
                    Save the operator first, then test the connection from the edit form.
                  </p>
                )}
                <RouterFeedback status={routerStatus} />
              </div>

              {/* Portal URL — shown in edit mode once router host is set */}
              {!isCreate && form.mikrotikHost && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'var(--accent-dim)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: '0.4rem' }}>
                    Portal URL for MikroTik Hotspot
                  </div>
                  <code style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>
                    http://{form.mikrotikHost.startsWith('192') ? '<server-ip>' : form.mikrotikHost}:3000/?mac=$mac&amp;op={form.shortCode || modal.shortCode}
                  </code>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.35rem' }}>
                    Set this as the Login page URL in MikroTik Hotspot settings.
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="form-group">
                <label>Notes</label>
                <input type="text" value={form.notes} placeholder="Internal notes (optional)"
                  onChange={(e) => setField('notes', e.target.value)} />
              </div>

              {error && <p className="error-msg">{error}</p>}

              {/* Spacer so content doesn't sit flush against sticky footer */}
              <div style={{ height: '0.5rem' }} />
            </form>

            {/* Sticky footer — outside the form, so we trigger submit manually */}
            <div style={{
              padding: '1rem 1.75rem',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.5rem',
              flexShrink: 0,
              background: 'var(--surface)',
              borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
            }}>
              <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button type="submit" form="op-form" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : isCreate ? 'Create Operator' : 'Save Changes'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleting && (
        <div className="modal-overlay" onClick={() => !deleteLoading && setDeleting(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, padding: 0 }}>
            <div style={{ padding: '1.4rem 1.75rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--red)' }}>Delete Operator</h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-3)' }}>
                  This cannot be undone.
                </p>
              </div>
              <button type="button" onClick={() => setDeleting(null)} disabled={deleteLoading}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-3)', lineHeight: 1, padding: '0.1rem 0.25rem', marginLeft: '1rem' }}>
                ×
              </button>
            </div>
            <div style={{ padding: '1.25rem 1.75rem' }}>
              <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
                Delete <strong>{deleting.name}</strong> (<code>{deleting.shortCode}</code>)?
                Their bundles will be deactivated. Transactions and sessions are kept as historical records.
              </p>
              {deleteError && (
                <div style={{
                  padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem',
                  background: 'var(--red-dim)', border: '1px solid #fca5a544',
                  fontSize: '0.85rem', color: 'var(--red)', lineHeight: 1.5,
                }}>
                  {deleteError}
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setDeleting(null)} disabled={deleteLoading}>Cancel</button>
                <button type="button" className="btn btn-primary"
                  style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
                  disabled={deleteLoading} onClick={handleDelete}>
                  {deleteLoading ? 'Deleting…' : 'Yes, delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Settle Operator Modal ── */}
      {settling && (
        <div className="modal-overlay" onClick={() => setSettling(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, padding: 0 }}>

            <div style={{ padding: '1.4rem 1.75rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)' }}>Settle — {settling.name}</h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-3)' }}>
                  Payout to <strong style={{ color: 'var(--text-2)' }}>{settling.ownerPhone}</strong>
                </p>
              </div>
              <button type="button" onClick={() => setSettling(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-3)', lineHeight: 1, padding: '0.1rem 0.25rem', marginLeft: '1rem' }}>
                ×
              </button>
            </div>

            <div style={{ padding: '1rem 1.75rem' }}>
              <div style={{
                padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem',
                background: 'var(--green-dim)', border: '1px solid var(--border)',
                fontSize: '0.875rem', color: 'var(--text-2)',
              }}>
                Available balance: <strong style={{ color: 'var(--green)', fontSize: '1rem' }}>{fmt(settling.walletBalance)}</strong>
              </div>

              <form onSubmit={handleSettle}>
                <div className="form-group">
                  <label>Amount to settle (KES)</label>
                  <input type="number" min={1} max={settling.walletBalance} step={0.01}
                    value={settleForm.amount} required
                    onChange={(e) => setSettleForm({ ...settleForm, amount: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Method</label>
                  <select value={settleForm.method} onChange={(e) => setSettleForm({ ...settleForm, method: e.target.value })}>
                    <option value="B2C">Auto B2C (requires PayBill credentials)</option>
                    <option value="MANUAL">Manual — I already sent the money</option>
                  </select>
                </div>
                {settleForm.method === 'MANUAL' && (
                  <div className="form-group">
                    <label>M-Pesa receipt / notes</label>
                    <input type="text" placeholder="e.g. RLC9AB12CD"
                      value={settleForm.notes}
                      onChange={(e) => setSettleForm({ ...settleForm, notes: e.target.value })} />
                  </div>
                )}
                {settleError && <p className="error-msg">{settleError}</p>}
                <div className="modal-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setSettling(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={settleLoading}>
                    {settleLoading ? 'Processing…' : 'Confirm Settlement'}
                  </button>
                </div>
              </form>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
