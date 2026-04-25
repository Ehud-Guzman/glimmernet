import { useEffect, useState } from 'react';
import client from '../api/client';
import { isSuperAdmin } from '../utils/auth';

const STATUS_COLORS = {
  ACTIVE: '#00c853',
  FULLY_REDEEMED: '#ff9800',
  EXPIRED: '#888',
  REVOKED: '#f44336',
};

const TYPE_LABELS = { MPESA: 'M-Pesa Receipt', ADMIN: 'Admin Voucher', PROMO: 'Promo Code' };

const fmtBundle = (b) => {
  if (!b) return '—';
  const parts = [b.name];
  if (b.durationMinutes) {
    if (b.durationMinutes < 60) parts.push(`${b.durationMinutes} min`);
    else if (b.durationMinutes < 1440) parts.push(`${b.durationMinutes / 60} hrs`);
    else parts.push(`${Math.round(b.durationMinutes / 1440)}d`);
  }
  if (b.dataMB) parts.push(b.dataMB >= 1024 ? `${b.dataMB / 1024}GB` : `${b.dataMB}MB`);
  return parts.join(' · ');
};

const EMPTY_FORM = {
  bundleId: '',
  quantity: 10,
  maxDevices: 1,
  type: 'ADMIN',
  expiresAt: '',
  note: '',
};

export default function Vouchers() {
  const [vouchers, setVouchers] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [genError, setGenError] = useState('');

  const LIMIT = 25;

  const fetchVouchers = () => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: LIMIT });
    if (filterType) params.set('type', filterType);
    if (filterStatus) params.set('status', filterStatus);
    client.get(`/admin/vouchers?${params}`)
      .then((r) => { setVouchers(r.data.data); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  };

  const fetchBundles = () => {
    client.get('/admin/bundles').then((r) => setBundles(r.data.data));
  };

  useEffect(() => { fetchBundles(); }, []);
  useEffect(() => { fetchVouchers(); }, [page, filterType, filterStatus]);

  const handleRevoke = async (id) => {
    if (!confirm('Revoke this voucher? This cannot be undone.')) return;
    await client.put(`/admin/vouchers/${id}/revoke`);
    fetchVouchers();
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setGenerating(true);
    setGenError('');
    setGenResult(null);
    try {
      const payload = {
        bundleId: form.bundleId,
        quantity: Number(form.quantity),
        maxDevices: Number(form.maxDevices),
        type: form.type,
        note: form.note,
      };
      if (form.expiresAt) payload.expiresAt = form.expiresAt;
      const res = await client.post('/admin/vouchers/generate', payload);
      setGenResult(res.data);
      fetchVouchers();
    } catch (err) {
      setGenError(err.response?.data?.message || 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const handleExportAll = () => {
    const params = new URLSearchParams();
    if (filterType) params.set('type', filterType);
    if (filterStatus) params.set('status', filterStatus);
    window.open(`/api/v1/admin/vouchers/export?${params}`, '_blank');
  };

  const handleExportBatch = (batchId) => {
    window.open(`/api/v1/admin/vouchers/export?batchId=${batchId}`, '_blank');
  };

  const pages = Math.ceil(total / LIMIT);

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div className="page-title" style={{ marginBottom: 0 }}>Vouchers & Codes</div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={handleExportAll}>⬇ Export CSV</button>
          {isSuperAdmin() && (
            <button className="btn btn-primary" onClick={() => { setModal(true); setGenResult(null); setForm(EMPTY_FORM); }}>
              + Generate Batch
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
          style={{ padding: '0.4rem 0.75rem', background: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: '6px' }}
        >
          <option value="">All types</option>
          <option value="MPESA">M-Pesa Receipt</option>
          <option value="ADMIN">Admin Voucher</option>
          <option value="PROMO">Promo Code</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          style={{ padding: '0.4rem 0.75rem', background: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: '6px' }}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="FULLY_REDEEMED">Fully Redeemed</option>
          <option value="EXPIRED">Expired</option>
          <option value="REVOKED">Revoked</option>
        </select>
        <span style={{ marginLeft: 'auto', color: '#666', fontSize: '0.85rem', alignSelf: 'center' }}>
          {total} voucher{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="table-wrap">
        {loading ? <div className="spinner" /> : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Type</th>
                <th>Bundle</th>
                <th>Status</th>
                <th>Devices</th>
                <th>Expires</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {vouchers.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#555' }}>No vouchers found.</td></tr>
              )}
              {vouchers.map((v) => (
                <tr key={v._id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', letterSpacing: '0.05em' }}>{v.code}</td>
                  <td style={{ fontSize: '0.78rem', color: '#aaa' }}>{TYPE_LABELS[v.type] || v.type}</td>
                  <td style={{ fontSize: '0.82rem' }}>{fmtBundle(v.bundleId)}</td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '999px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      background: STATUS_COLORS[v.status] + '22',
                      color: STATUS_COLORS[v.status],
                    }}>
                      {v.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                    {v.redemptions.length} / {v.maxDevices}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: '#888' }}>
                    {v.expiresAt ? new Date(v.expiresAt).toLocaleDateString('en-KE') : 'Never'}
                  </td>
                  <td style={{ fontSize: '0.78rem', color: '#666' }}>
                    {new Date(v.createdAt).toLocaleDateString('en-KE')}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      {v.batchId && (
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                          onClick={() => handleExportBatch(v.batchId)}
                          title="Export this batch as CSV"
                        >
                          ⬇
                        </button>
                      )}
                      {v.status === 'ACTIVE' && isSuperAdmin() && (
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', color: '#f44336' }}
                          onClick={() => handleRevoke(v._id)}
                        >
                          Revoke
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

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'center' }}>
          <button className="btn btn-ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <span style={{ alignSelf: 'center', color: '#888', fontSize: '0.85rem' }}>{page} / {pages}</span>
          <button className="btn btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}

      {/* Generate Batch Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3>Generate Voucher Batch</h3>

            {genResult ? (
              <>
                <p style={{ color: '#00c853', marginBottom: '0.75rem' }}>
                  ✅ {genResult.count} codes generated (batch <code>{genResult.batchId}</code>)
                </p>
                <div style={{
                  background: '#111',
                  border: '1px solid #222',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  maxHeight: 200,
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '0.82rem',
                  lineHeight: 1.8,
                  marginBottom: '1rem',
                }}>
                  {genResult.codes.map((c) => <div key={c}>{c}</div>)}
                </div>
                <div className="modal-actions">
                  <button className="btn btn-ghost" onClick={() => handleExportBatch(genResult.batchId)}>⬇ Download CSV</button>
                  <button className="btn btn-primary" onClick={() => setModal(false)}>Done</button>
                </div>
              </>
            ) : (
              <form onSubmit={handleGenerate}>
                <div className="form-group">
                  <label>Bundle</label>
                  <select
                    value={form.bundleId}
                    onChange={(e) => setForm({ ...form, bundleId: e.target.value })}
                    required
                    style={{ width: '100%', padding: '0.6rem', background: '#111', color: '#fff', border: '1px solid #2a2a2a', borderRadius: '6px' }}
                  >
                    <option value="">Select a bundle…</option>
                    {bundles.map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.name} — KES {b.price}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label>Quantity (max 500)</label>
                    <input type="number" min={1} max={500} value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Max devices per code</label>
                    <input type="number" min={1} max={50} value={form.maxDevices}
                      onChange={(e) => setForm({ ...form, maxDevices: e.target.value })} required />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label>Type</label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', background: '#111', color: '#fff', border: '1px solid #2a2a2a', borderRadius: '6px' }}
                    >
                      <option value="ADMIN">Admin Voucher</option>
                      <option value="PROMO">Promo / Free</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Expires on (optional)</label>
                    <input type="date" value={form.expiresAt}
                      onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
                  </div>
                </div>

                <div className="form-group">
                  <label>Note (optional)</label>
                  <input type="text" placeholder="e.g. Promotion April 2026"
                    value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </div>

                {genError && <p className="error-msg">{genError}</p>}

                <div className="modal-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={generating}>
                    {generating ? 'Generating…' : 'Generate'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
