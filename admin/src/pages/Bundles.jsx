import { useEffect, useState } from 'react';
import client from '../api/client';
import { isSuperAdmin } from '../utils/auth';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';

const EMPTY = { name: '', price: '', durationMinutes: '', dataMB: '', speedLimitMbps: '', mikrotikProfile: '', isActive: true, multiDevice: false, maxDevices: '', validFromHour: '', validToHour: '' };

const fmtDuration = (min) => {
  if (!min) return '—';
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${min / 60} hr`;
  if (min < 10080) return `${min / 1440} day${min / 1440 > 1 ? 's' : ''}`;
  if (min < 43200) return `${Math.round(min / 10080)} wk`;
  return `${Math.round(min / 43200)} mo`;
};

export default function Bundles() {
  const toast = useToast();
  const superAdmin = isSuperAdmin();
  const [operators, setOperators] = useState([]);
  const [selectedOpId, setSelectedOpId] = useState(''); // '' = global/platform
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | bundle object
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState('');

  // Load operators once for the selector
  useEffect(() => {
    client.get('/admin/operators').then((r) => setOperators(r.data.data));
  }, []);

  const loadBundles = () => {
    setLoading(true);
    const qs = selectedOpId ? `?operatorId=${selectedOpId}` : '';
    client.get(`/admin/bundles${qs}`)
      .then((r) => setBundles(r.data.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadBundles(); }, [selectedOpId]);

  const selectedOp = operators.find((o) => o._id === selectedOpId) || null;

  const openCreate = () => {
    setForm(EMPTY); setError(''); setModal('create');
  };
  const openEdit = (b) => {
    setForm({
      ...b,
      price: String(b.price),
      durationMinutes: String(b.durationMinutes || ''),
      dataMB: String(b.dataMB || ''),
      speedLimitMbps: String(b.speedLimitMbps || ''),
      multiDevice: b.multiDevice || false,
      maxDevices: b.maxDevices != null ? String(b.maxDevices) : '',
      validFromHour: b.validFromHour != null ? String(b.validFromHour) : '',
      validToHour: b.validToHour != null ? String(b.validToHour) : '',
    });
    setError(''); setModal(b);
  };
  const closeModal = () => setModal(null);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    const payload = {
      name: form.name,
      price: Number(form.price),
      durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
      dataMB: form.dataMB ? Number(form.dataMB) : null,
      speedLimitMbps: form.speedLimitMbps ? Number(form.speedLimitMbps) : null,
      mikrotikProfile: form.mikrotikProfile,
      isActive: form.isActive,
      operatorId: selectedOpId || null,
      multiDevice: form.multiDevice,
      maxDevices: form.multiDevice && form.maxDevices !== '' ? Number(form.maxDevices) : null,
      validFromHour: form.validFromHour !== '' ? Number(form.validFromHour) : null,
      validToHour: form.validFromHour !== '' && form.validToHour !== '' ? Number(form.validToHour) : null,
    };
    try {
      if (modal === 'create') {
        await client.post('/admin/bundles', payload);
      } else {
        await client.put(`/admin/bundles/${modal._id}`, payload);
      }
      closeModal(); loadBundles();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(deleteTarget._id);
    try {
      await client.delete(`/admin/bundles/${deleteTarget._id}`);
      toast.success(`Bundle "${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      loadBundles();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not delete bundle.');
      setDeleteTarget(null);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="page-title" style={{ marginBottom: 0 }}>Bundles</div>
        <button className="btn btn-primary" onClick={openCreate}>+ New Bundle</button>
      </div>

      {/* Operator selector */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '1rem 1.25rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
          Viewing plans for:
        </span>
        <select
          value={selectedOpId}
          onChange={(e) => setSelectedOpId(e.target.value)}
          style={{ flex: 1, maxWidth: 280, padding: '0.5rem 0.75rem', borderRadius: '8px' }}
        >
          <option value="">Platform Default (global)</option>
          {operators.map((op) => (
            <option key={op._id} value={op._id}>{op.name} — {op.shortCode}</option>
          ))}
        </select>
        {selectedOp && (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
            Bundles here are shown <strong style={{ color: 'var(--text-2)' }}>only</strong> on {selectedOp.name}'s portal
          </span>
        )}
        {!selectedOpId && (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
            Global bundles appear on portals with no operator-specific plans configured
          </span>
        )}
      </div>

      <div className="table-wrap">
        {loading ? <div className="spinner" /> : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Price</th>
                <th>Duration</th>
                <th>Data</th>
                <th>Speed</th>
                <th>MikroTik Profile</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bundles.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '2rem' }}>
                    {selectedOp
                      ? `No bundles for ${selectedOp.name} yet. Add one above.`
                      : 'No global bundles yet. Add one above.'}
                  </td>
                </tr>
              )}
              {bundles.map((b) => (
                <tr key={b._id}>
                  <td style={{ fontWeight: 500, color: 'var(--text)' }}>{b.name}</td>
                  <td>KES {b.price}</td>
                  <td>{fmtDuration(b.durationMinutes)}</td>
                  <td>{b.dataMB ? `${b.dataMB} MB` : '—'}</td>
                  <td>{b.speedLimitMbps ? `${b.speedLimitMbps} Mbps` : '—'}</td>
                  <td><code>{b.mikrotikProfile}</code></td>
                  <td>
                    <span className={`badge badge-${b.isActive ? 'active' : 'expired'}`}>
                      {b.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button className="btn btn-ghost" style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                        onClick={() => openEdit(b)}>Edit</button>
                      {superAdmin && (
                        <button className="btn btn-danger" style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                          disabled={deleting === b._id}
                          onClick={() => setDeleteTarget(b)}>
                          {deleting === b._id ? '…' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Bundle"
          message={`Delete "${deleteTarget.name}"? This cannot be undone. Any active sessions using this bundle will not be affected, but the bundle will no longer be available for purchase.`}
          confirmLabel="Delete"
          danger
          loading={!!deleting}
          loadingLabel="Deleting…"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Add / Edit Bundle Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480, padding: 0, display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>

            {/* Header */}
            <div style={{ padding: '1.4rem 1.75rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                  {modal === 'create' ? 'New Bundle' : 'Edit Bundle'}
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-3)' }}>
                  {selectedOp ? `For ${selectedOp.name} (${selectedOp.shortCode})` : 'Platform default — shown on all unconfigured portals'}
                </p>
              </div>
              <button type="button" onClick={closeModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-3)', lineHeight: 1, padding: '0.1rem 0.25rem', marginLeft: '1rem' }}>
                ×
              </button>
            </div>

            {/* Body */}
            <form id="bundle-form" onSubmit={handleSave} style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.75rem' }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Name *</label>
                  <input type="text" required value={form.name} placeholder="e.g. Daily (24 hrs)"
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Price (KES) *</label>
                  <input type="number" required min={1} value={form.price} placeholder="50"
                    onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Speed Limit (Mbps)</label>
                  <input type="number" min={0} step={0.1} value={form.speedLimitMbps} placeholder="5"
                    onChange={(e) => setForm({ ...form, speedLimitMbps: e.target.value })} />
                </div>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.85rem', marginBottom: '1rem', background: 'var(--surface-2)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: '0.65rem' }}>
                  Plan type — fill one
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Duration (minutes)</label>
                    <input type="number" min={1} value={form.durationMinutes} placeholder="1440 = 24 hrs"
                      onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Data (MB)</label>
                    <input type="number" min={1} value={form.dataMB} placeholder="1024 = 1 GB"
                      onChange={(e) => setForm({ ...form, dataMB: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>MikroTik Profile *</label>
                <input type="text" required value={form.mikrotikProfile} placeholder="default"
                  onChange={(e) => setForm({ ...form, mikrotikProfile: e.target.value })} />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>
                  Must match a profile name in MikroTik IP → Hotspot → User Profiles
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  style={{ width: 'auto', accentColor: 'var(--accent)' }} />
                Active (visible on portal)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-2)', cursor: 'pointer', marginTop: '0.6rem' }}>
                <input type="checkbox" checked={form.multiDevice}
                  onChange={(e) => setForm({ ...form, multiDevice: e.target.checked, maxDevices: e.target.checked ? (form.maxDevices || '2') : '' })}
                  style={{ width: 'auto', accentColor: 'var(--accent)' }} />
                Shared voucher for multiple devices
              </label>
              {form.multiDevice && (
                <div className="form-group" style={{ marginTop: '0.5rem', maxWidth: 180 }}>
                  <label>Max Devices</label>
                  <input type="number" min={1} value={form.maxDevices} placeholder="2"
                    onChange={(e) => setForm({ ...form, maxDevices: e.target.value })} />
                </div>
              )}

              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.85rem', marginTop: '0.75rem', background: 'var(--surface-2)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: '0.65rem' }}>
                  Happy Hour (optional)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Start Hour (0–23)</label>
                    <input type="number" min={0} max={23} value={form.validFromHour} placeholder="e.g. 8"
                      onChange={(e) => setForm({ ...form, validFromHour: e.target.value, validToHour: e.target.value === '' ? '' : form.validToHour })} />
                  </div>
                  {form.validFromHour !== '' && (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>End Hour (0–23)</label>
                      <input type="number" min={0} max={23} value={form.validToHour} placeholder="e.g. 17"
                        onChange={(e) => setForm({ ...form, validToHour: e.target.value })} />
                    </div>
                  )}
                </div>
              </div>

              {error && <p className="error-msg" style={{ marginTop: '0.75rem' }}>{error}</p>}
              <div style={{ height: '0.5rem' }} />
            </form>

            {/* Footer */}
            <div style={{
              padding: '1rem 1.75rem',
              borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'flex-end', gap: '0.5rem',
              flexShrink: 0, background: 'var(--surface)',
              borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
            }}>
              <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button type="submit" form="bundle-form" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : modal === 'create' ? 'Create Bundle' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
