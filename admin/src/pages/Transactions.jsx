import { useEffect, useState } from 'react';
import client from '../api/client';

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    client.get(`/admin/transactions?page=${page}&limit=20`)
      .then((r) => { setTransactions(r.data.data); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.ceil(total / 20);

  return (
    <>
      <div className="page-title">Transactions</div>
      <div className="table-wrap">
        {loading ? <div className="spinner" /> : (
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
                  <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{new Date(t.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {totalPages > 1 && (
        <div className="pagination">
          <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}>Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page === totalPages}>Next</button>
        </div>
      )}
    </>
  );
}
