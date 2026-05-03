import { useEffect, useState } from 'react';
import client from '../api/client';
import { useToast } from '../context/ToastContext';

const STATUSES = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'REJECTED'];
const ISSUES = {
  PAID_NO_INTERNET: 'Paid — No Internet',
  WRONG_AMOUNT_CHARGED: 'Wrong Amount',
  SESSION_EXPIRED_TOO_EARLY: 'Session Expired Early',
  DOUBLE_CHARGE: 'Double Charge',
  OTHER: 'Other',
};
const STATUS_COLOR = {
  OPEN: '#ef4444', INVESTIGATING: '#f59e0b', RESOLVED: '#10b981', REJECTED: '#6b7280',
};

function StatusBadge({ status }) {
  return (
    <span style={{
      background: `${STATUS_COLOR[status]}22`, color: STATUS_COLOR[status],
      borderRadius: '5px', padding: '0.15rem 0.5rem',
      fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
    }}>{status}</span>
  );
}

function ResolveModal({ dispute, onClose, onSaved }) {
  const [status, setStatus] = useState('INVESTIGATING');
  const [resolution, setResolution] = useState('');
  const [refundIssued, setRefundIssued] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!resolution.trim()) { setErr('Please add a resolution note.'); return; }
    setSaving(true); setErr('');
    try {
      await client.patch(`/disputes/${dispute._id}/status`, {
        status, resolution: resolution.trim(),
        refundIssued, refundAmount: refundIssued ? Number(refundAmount) : 0,
      });
      onSaved();
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to update dispute.');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: 480 }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Update Dispute</h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-3)', margin: '0 0 1rem' }}>
          Phone: <strong>{dispute.phone}</strong> · Issue: <strong>{ISSUES[dispute.issue] || dispute.issue}</strong>
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-2)' }}>New Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ marginTop: '0.3rem' }}>
              <option value="INVESTIGATING">Investigating</option>
              <option value="RESOLVED">Resolved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-2)' }}>Resolution Note</label>
            <textarea className="input" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)}
              placeholder="Describe what action was taken or why it was rejected..."
              style={{ marginTop: '0.3rem', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={refundIssued} onChange={(e) => setRefundIssued(e.target.checked)} />
            Refund issued
          </label>
          {refundIssued && (
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-2)' }}>Refund Amount (KES)</label>
              <input className="input" type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)}
                style={{ marginTop: '0.3rem' }} placeholder="0" />
            </div>
          )}
          {err && <p style={{ color: 'var(--red)', fontSize: '0.8rem', margin: 0 }}>{err}</p>}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Disputes() {
  const { addToast } = useToast();
  const [disputes, setDisputes] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);

  const load = async (p = page, sf = statusFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: 20 });
      if (sf) params.set('status', sf);
      const [dRes, sRes] = await Promise.all([
        client.get(`/disputes?${params}`),
        client.get('/disputes/stats'),
      ]);
      setDisputes(dRes.data.data);
      setTotal(dRes.data.total);
      setStats(sRes.data.data);
    } catch { addToast('Failed to load disputes', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const applyFilter = (sf) => { setStatusFilter(sf); setPage(1); load(1, sf); };
  const handleSaved = () => { setSelected(null); addToast('Dispute updated', 'success'); load(); };

  const pages = Math.ceil(total / 20);

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Disputes</h1>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-3)' }}>
          Customer-reported payment and session issues
        </p>
      </div>

      {/* Stats bar */}
      {stats && (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {['OPEN', 'INVESTIGATING', 'RESOLVED', 'REJECTED'].map((s) => (
            <button key={s} onClick={() => applyFilter(statusFilter === s ? '' : s)}
              style={{
                background: statusFilter === s ? `${STATUS_COLOR[s]}22` : 'var(--surface)',
                color: STATUS_COLOR[s], border: `1px solid ${STATUS_COLOR[s]}44`,
                borderRadius: '8px', padding: '0.4rem 0.9rem', cursor: 'pointer',
                fontSize: '0.78rem', fontWeight: 600,
              }}>
              {s} · {stats[s.toLowerCase()] ?? 0}
            </button>
          ))}
        </div>
      )}

      {loading ? <div className="spinner" /> : (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Phone', 'Issue', 'Operator', 'M-Pesa Ref', 'Status', 'Filed', 'Action'].map((h) => (
                    <th key={h} style={{ padding: '0.8rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-3)', fontSize: '0.72rem', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {disputes.map((d) => (
                  <tr key={d._id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>{d.phone}</td>
                    <td style={{ padding: '0.85rem 1rem', color: 'var(--text-2)' }}>{ISSUES[d.issue] || d.issue}</td>
                    <td style={{ padding: '0.85rem 1rem', color: 'var(--text-3)' }}>{d.operatorId?.name || '—'}</td>
                    <td style={{ padding: '0.85rem 1rem', fontFamily: 'monospace', fontSize: '0.78rem' }}>{d.mpesaReceiptNumber || '—'}</td>
                    <td style={{ padding: '0.85rem 1rem' }}><StatusBadge status={d.status} /></td>
                    <td style={{ padding: '0.85rem 1rem', color: 'var(--text-3)', fontSize: '0.78rem' }}>{new Date(d.createdAt).toLocaleDateString('en-KE')}</td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      {d.status !== 'RESOLVED' && d.status !== 'REJECTED' && (
                        <button className="btn btn-sm btn-primary" onClick={() => setSelected(d)}>Update</button>
                      )}
                      {(d.status === 'RESOLVED' || d.status === 'REJECTED') && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{d.resolution ? d.resolution.slice(0, 40) + '…' : 'Closed'}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {disputes.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)' }}>No disputes found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem' }}>
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <button key={p} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => { setPage(p); load(p); }}>{p}</button>
              ))}
            </div>
          )}
        </>
      )}

      {selected && <ResolveModal dispute={selected} onClose={() => setSelected(null)} onSaved={handleSaved} />}
    </div>
  );
}
