import { useEffect, useState } from 'react';
import client from '../api/client';

const STATUS_COLORS = {
  PENDING: '#ff9800',
  PROCESSING: '#2196f3',
  PAID: '#00c853',
  FAILED: '#f44336',
};

const fmt = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

function ReconciliationPanel() {
  const [data, setData] = useState(null);

  useEffect(() => {
    client.get('/admin/analytics/reconciliation')
      .then((r) => setData(r.data.data))
      .catch(() => {});
  }, []);

  if (!data) return null;

  const hasIssues = data.stuckSettlements > 0 || data.recentFailures > 0;
  if (!hasIssues) return null;

  return (
    <div style={{
      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
      borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.25rem',
      display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap',
    }}>
      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Reconciliation Alert
      </div>
      {data.stuckSettlements > 0 && (
        <div style={{ fontSize: '0.83rem' }}>
          <strong style={{ color: '#ef4444' }}>{data.stuckSettlements}</strong>
          <span style={{ color: 'var(--text-3)', marginLeft: '0.35rem' }}>stuck in PROCESSING for &gt;24h</span>
        </div>
      )}
      {data.recentFailures > 0 && (
        <div style={{ fontSize: '0.83rem' }}>
          <strong style={{ color: '#f59e0b' }}>{data.recentFailures}</strong>
          <span style={{ color: 'var(--text-3)', marginLeft: '0.35rem' }}>failed payouts in last 24h</span>
        </div>
      )}
      {data.paidLast24h > 0 && (
        <div style={{ fontSize: '0.83rem', marginLeft: 'auto' }}>
          <strong style={{ color: '#10b981' }}>{data.paidLast24h}</strong>
          <span style={{ color: 'var(--text-3)', marginLeft: '0.35rem' }}>paid successfully in last 24h</span>
        </div>
      )}
    </div>
  );
}

export default function Settlements() {
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [markPaidModal, setMarkPaidModal] = useState(null);
  const [markForm, setMarkForm] = useState({ mpesaRef: '', notes: '' });
  const [markSaving, setMarkSaving] = useState(false);

  const LIMIT = 20;

  const fetch = () => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: LIMIT });
    if (filterStatus) params.set('status', filterStatus);
    client.get(`/admin/settlements?${params}`)
      .then((r) => { setSettlements(r.data.data); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, [page, filterStatus]);

  const handleMarkPaid = async (e) => {
    e.preventDefault();
    setMarkSaving(true);
    try {
      await client.put(`/admin/settlements/${markPaidModal._id}/mark-paid`, markForm);
      setMarkPaidModal(null);
      fetch();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update settlement.');
    } finally {
      setMarkSaving(false);
    }
  };

  const pages = Math.ceil(total / LIMIT);

  return (
    <>
      <ReconciliationPanel />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="page-title" style={{ marginBottom: 0 }}>Settlements</div>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          style={{ padding: '0.4rem 0.75rem', background: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: '6px' }}
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PROCESSING">Processing</option>
          <option value="PAID">Paid</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      <div className="table-wrap">
        {loading ? <div className="spinner" /> : (
          <table>
            <thead>
              <tr>
                <th>Operator</th>
                <th>Amount</th>
                <th>Platform Fee</th>
                <th>Method</th>
                <th>Status</th>
                <th>M-Pesa Ref</th>
                <th>Paid At</th>
                <th>Initiated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {settlements.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: '#555' }}>No settlements yet.</td></tr>
              )}
              {settlements.map((s) => (
                <tr key={s._id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{s.operatorId?.name || '—'}</div>
                    <div style={{ fontSize: '0.72rem', color: '#666', fontFamily: 'monospace' }}>
                      {s.operatorId?.shortCode}
                    </div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{fmt(s.amount)}</td>
                  <td style={{ color: '#00c853', fontSize: '0.85rem' }}>{fmt(s.platformFee)}</td>
                  <td style={{ fontSize: '0.78rem', color: '#aaa' }}>{s.method}</td>
                  <td>
                    <span style={{
                      padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
                      background: STATUS_COLORS[s.status] + '22',
                      color: STATUS_COLORS[s.status],
                    }}>
                      {s.status}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                    {s.mpesaRef || '—'}
                  </td>
                  <td style={{ fontSize: '0.78rem', color: '#888' }}>
                    {s.paidAt ? new Date(s.paidAt).toLocaleString('en-KE') : '—'}
                  </td>
                  <td style={{ fontSize: '0.75rem', color: '#666' }}>
                    {new Date(s.createdAt).toLocaleDateString('en-KE')}
                    {s.triggeredBy?.name && (
                      <div style={{ color: '#444' }}>{s.triggeredBy.name}</div>
                    )}
                  </td>
                  <td>
                    {(s.status === 'PROCESSING' || s.status === 'FAILED') && (
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', color: '#00c853' }}
                        onClick={() => { setMarkPaidModal(s); setMarkForm({ mpesaRef: '', notes: '' }); }}
                      >
                        Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'center' }}>
          <button className="btn btn-ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <span style={{ alignSelf: 'center', color: '#888', fontSize: '0.85rem' }}>{page} / {pages}</span>
          <button className="btn btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}

      {/* Mark Paid Modal */}
      {markPaidModal && (
        <div className="modal-overlay" onClick={() => setMarkPaidModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3>Mark as Paid</h3>
            <p style={{ fontSize: '0.83rem', color: '#888', marginBottom: '1rem' }}>
              Settlement of <strong style={{ color: '#00c853' }}>{fmt(markPaidModal.amount)}</strong>
              &nbsp;to <strong>{markPaidModal.operatorId?.name}</strong>
            </p>
            <form onSubmit={handleMarkPaid}>
              <div className="form-group">
                <label>M-Pesa Receipt (optional)</label>
                <input type="text" placeholder="e.g. RLC9AB12CD"
                  value={markForm.mpesaRef}
                  onChange={(e) => setMarkForm({ ...markForm, mpesaRef: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input type="text" value={markForm.notes}
                  onChange={(e) => setMarkForm({ ...markForm, notes: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setMarkPaidModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={markSaving}>
                  {markSaving ? 'Saving…' : 'Confirm Paid'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
