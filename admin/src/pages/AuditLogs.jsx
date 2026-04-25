import { useEffect, useState } from 'react';
import client from '../api/client';

const ACTION_COLORS = {
  OPERATOR_CREATED: '#00c853', OPERATOR_UPDATED: '#2979ff',
  BUNDLE_CREATED: '#00c853', BUNDLE_UPDATED: '#2979ff', BUNDLE_DELETED: '#f44336',
  VOUCHERS_GENERATED: '#00c853', VOUCHER_REVOKED: '#f44336',
  SESSION_GRANTED: '#00c853', SESSION_TERMINATED: '#f44336',
  SETTLEMENT_CREATED: '#ff9800', SETTLEMENT_MARKED_PAID: '#00c853',
  ADMIN_USER_CREATED: '#00c853', ADMIN_USER_UPDATED: '#2979ff',
};

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState('');
  const [loading, setLoading] = useState(true);

  const LIMIT = 50;

  const fetch = (p = page, action = filterAction) => {
    setLoading(true);
    const qs = new URLSearchParams({ page: p, limit: LIMIT });
    if (action) qs.set('action', action);
    client.get(`/admin/audit-logs?${qs}`)
      .then((r) => { setLogs(r.data.data); setTotal(r.data.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  const actions = [
    'OPERATOR_CREATED', 'OPERATOR_UPDATED',
    'BUNDLE_CREATED', 'BUNDLE_UPDATED', 'BUNDLE_DELETED',
    'VOUCHERS_GENERATED', 'VOUCHER_REVOKED',
    'SESSION_GRANTED', 'SESSION_TERMINATED',
    'SETTLEMENT_CREATED', 'SETTLEMENT_MARKED_PAID',
    'ADMIN_USER_CREATED', 'ADMIN_USER_UPDATED',
    'PROFILE_UPDATED',
  ];

  const handleFilter = (val) => {
    setFilterAction(val);
    setPage(1);
    fetch(1, val);
  };

  const goPrev = () => { const p = page - 1; setPage(p); fetch(p); };
  const goNext = () => { const p = page + 1; setPage(p); fetch(p); };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="page-title" style={{ marginBottom: 0 }}>Audit Logs</div>
        <select
          value={filterAction}
          onChange={(e) => handleFilter(e.target.value)}
          style={{ padding: '0.45rem 0.75rem', borderRadius: '8px', fontSize: '0.82rem', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        >
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        {loading ? <div className="spinner" /> : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '2rem' }}>
                    No logs found.
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr key={log._id}>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                    {new Date(log.createdAt).toLocaleString('en-KE', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>
                    {log.actorName || '—'}
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', textTransform: 'uppercase' }}>
                      {log.actorModel}
                    </div>
                  </td>
                  <td>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.5rem',
                      borderRadius: '4px', background: `${ACTION_COLORS[log.action] || '#888'}22`,
                      color: ACTION_COLORS[log.action] || 'var(--text-3)',
                      letterSpacing: '0.04em',
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
                    {log.targetModel || '—'}
                    {log.targetId && (
                      <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', opacity: 0.6 }}>
                        {String(log.targetId).slice(-8)}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-3)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.meta ? JSON.stringify(log.meta) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1rem', fontSize: '0.82rem', color: 'var(--text-3)' }}>
          <button className="btn btn-ghost" onClick={goPrev} disabled={page === 1} style={{ padding: '0.3rem 0.75rem' }}>Prev</button>
          <span>Page {page} of {totalPages} — {total} entries</span>
          <button className="btn btn-ghost" onClick={goNext} disabled={page === totalPages} style={{ padding: '0.3rem 0.75rem' }}>Next</button>
        </div>
      )}
    </>
  );
}
