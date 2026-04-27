import { useEffect, useState } from 'react';
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

export default function Transactions() {
  const toast = useToast();
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    client.get(`/admin/transactions?page=${page}&limit=20`)
      .then((r) => { setTransactions(r.data.data); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  }, [page]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await client.get('/admin/transactions/export', { responseType: 'blob' });
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="page-title" style={{ margin: 0 }}>Transactions</div>
        <button className="btn btn-ghost" onClick={exportCsv} disabled={exporting} style={{ fontSize: '0.82rem' }}>
          {exporting ? 'Exporting…' : '⬇ Export CSV'}
        </button>
      </div>

      <div className="table-wrap">
        {loading ? <div className="spinner" /> : transactions.length === 0 ? (
          <EmptyState
            icon="💳"
            title="No transactions yet"
            body="M-Pesa payments will appear here once customers start buying bundles through the portal."
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
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t._id}>
                  <td>{t.phone}</td>
                  <td>KES {t.amount}</td>
                  <td>{t.bundleId?.name || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{t.mpesaReceiptNumber || '—'}</td>
                  <td><span className={`badge badge-${t.status.toLowerCase()}`}>{t.status}</span></td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>{new Date(t.createdAt).toLocaleString()}</td>
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
