import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { useToast } from '../context/ToastContext';

const EmptyState = ({ icon, title, body }) => (
  <div style={{
    padding: '3rem 1.5rem', textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem',
  }}>
    <div style={{
      width: 56, height: 56, borderRadius: '16px',
      background: 'var(--blue-dim)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: '1.6rem',
    }}>{icon}</div>
    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)' }}>{title}</div>
    <div style={{ fontSize: '0.82rem', color: 'var(--text-3)', maxWidth: 280, lineHeight: 1.6 }}>{body}</div>
  </div>
);

function FixModal({ txn, onClose, onSuccess }) {
  const toast = useToast();
  const [mac, setMac] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!mac.trim()) { setErr('MAC address is required'); return; }
    setSaving(true); setErr('');
    try {
      await client.post(`/admin/transactions/${txn._id}/retry-grant`, { macAddress: mac.trim().toUpperCase() });
      toast.success('Internet granted!');
      onSuccess();
    } catch (e) {
      setErr(e.response?.data?.message || 'Could not grant access.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h3>Fix Internet Access</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '1.25rem' }}>
          <strong>{txn.phone}</strong> paid KES {txn.amount} for <strong>{txn.bundleId?.name}</strong> but
          internet was not granted. Enter their device MAC address to fix it now.
        </p>
        <div className="form-group">
          <label>Device MAC Address</label>
          <input
            className="input"
            placeholder="AA:BB:CC:DD:EE:FF"
            value={mac}
            onChange={(e) => setMac(e.target.value)}
            autoFocus
          />
        </div>
        {err && <p className="error-msg">{err}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Granting…' : 'Grant Internet'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const STATUS_OPTS = [
  { value: '',              label: 'All Transactions' },
  { value: 'SUCCESS',       label: 'Paid' },
  { value: 'ACCESS_FAILED', label: 'No Internet — Fix Needed' },
  { value: 'FAILED',        label: 'Payment Failed' },
  { value: 'PENDING',       label: 'Pending' },
  { value: 'CANCELLED',     label: 'Cancelled' },
];

export default function Transactions() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || '');
  const [loading, setLoading]           = useState(true);
  const [exporting, setExporting]       = useState(false);
  const [retrying, setRetrying]         = useState(null);
  const [fixModal, setFixModal]         = useState(null);

  const fetchTxns = () => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 20 });
    if (statusFilter) params.set('status', statusFilter);
    client.get(`/admin/transactions?${params}`)
      .then((r) => { setTransactions(r.data.data); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTxns(); }, [page, statusFilter]);

  const handleFilterChange = (val) => { setStatusFilter(val); setPage(1); };

  const retryGrant = async (txn) => {
    if (!txn.macAddress) { setFixModal(txn); return; }
    setRetrying(txn._id);
    try {
      await client.post(`/admin/transactions/${txn._id}/retry-grant`, {});
      toast.success('Internet granted!');
      fetchTxns();
    } catch (e) {
      const msg = e.response?.data?.message || 'Could not grant access.';
      if (msg.toLowerCase().includes('mac')) setFixModal(txn);
      else toast.error(msg);
    } finally {
      setRetrying(null);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const res = await client.get(`/admin/transactions/export${qs}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded.');
    } catch {
      toast.error('Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <>
      {fixModal && (
        <FixModal
          txn={fixModal}
          onClose={() => setFixModal(null)}
          onSuccess={() => { setFixModal(null); fetchTxns(); }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="page-title" style={{ margin: 0 }}>Transactions</div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.65rem', width: 'auto' }}
          >
            {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={exportCsv} disabled={exporting} style={{ fontSize: '0.82rem' }}>
            {exporting ? 'Exporting…' : '⬇ Export CSV'}
          </button>
        </div>
      </div>

      {statusFilter === 'ACCESS_FAILED' && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '10px', marginBottom: '1rem',
          background: 'var(--red-dim)', border: '1px solid #fca5a544',
          fontSize: '0.82rem', color: 'var(--red)',
        }}>
          These customers paid but their internet was not granted — likely a MikroTik provisioning error.
          Click <strong>Fix</strong> on each row to retry granting access immediately.
        </div>
      )}

      <div className="table-wrap">
        {loading ? <div className="spinner" /> : transactions.length === 0 ? (
          <EmptyState
            icon={statusFilter === 'ACCESS_FAILED' ? '✅' : '💳'}
            title={statusFilter === 'ACCESS_FAILED' ? 'All clear' : 'No transactions yet'}
            body={statusFilter === 'ACCESS_FAILED'
              ? 'No paid transactions are missing internet access.'
              : 'M-Pesa payments will appear here once customers start buying bundles through the portal.'}
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Phone</th>
                <th>Amount</th>
                <th>Bundle</th>
                <th>Receipt</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr
                  key={t._id}
                  style={t.status === 'ACCESS_FAILED' ? { background: 'var(--red-dim)' } : {}}
                >
                  <td>{t.phone}</td>
                  <td>KES {t.amount}</td>
                  <td>{t.bundleId?.name || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{t.mpesaReceiptNumber || '—'}</td>
                  <td>
                    <span className={`badge badge-${t.status.toLowerCase()}`}>
                      {t.status === 'ACCESS_FAILED' ? 'NO INTERNET' : t.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>{new Date(t.createdAt).toLocaleString()}</td>
                  <td>
                    {t.status === 'ACCESS_FAILED' && (
                      <button
                        className="btn btn-danger"
                        style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                        onClick={() => retryGrant(t)}
                        disabled={retrying === t._id}
                      >
                        {retrying === t._id ? '…' : 'Fix'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}>← Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page === totalPages}>Next →</button>
        </div>
      )}
    </>
  );
}
