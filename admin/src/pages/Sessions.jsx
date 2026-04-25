import { useEffect, useState } from 'react';
import client from '../api/client';

const fmtDuration = (mins) => {
  if (!mins) return '—';
  if (mins >= 1440) return `${mins / 1440}d`;
  if (mins >= 60) return `${mins / 60}h`;
  return `${mins}m`;
};

function GrantModal({ onClose, onSuccess }) {
  const [bundles, setBundles] = useState([]);
  const [operators, setOperators] = useState([]);
  const [selectedOp, setSelectedOp] = useState('');
  const [form, setForm] = useState({ macAddress: '', bundleId: '', phone: '', durationMinutes: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    client.get('/admin/operators').then((r) => setOperators(r.data.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedOp === '') {
      client.get('/admin/bundles').then((r) => setBundles(r.data.data)).catch(() => {});
    } else {
      client.get(`/admin/bundles?operatorId=${selectedOp}`).then((r) => setBundles(r.data.data)).catch(() => {});
    }
  }, [selectedOp]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.macAddress || !form.bundleId) { setErr('MAC address and bundle are required.'); return; }
    setSaving(true); setErr('');
    try {
      await client.post('/admin/sessions/grant', {
        macAddress: form.macAddress.trim().toUpperCase(),
        bundleId: form.bundleId,
        phone: form.phone.trim(),
        durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
        note: form.note || 'Admin manual grant',
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
        <h3>Grant Access</h3>
        <div className="form-group">
          <label>Filter by Operator (optional)</label>
          <select className="input" value={selectedOp} onChange={(e) => { setSelectedOp(e.target.value); set('bundleId', ''); }}>
            <option value="">— all operators —</option>
            {operators.map((op) => (
              <option key={op._id} value={op._id}>{op.name} ({op.shortCode})</option>
            ))}
          </select>
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
          <label>Device MAC Address *</label>
          <input className="input" placeholder="AA:BB:CC:DD:EE:FF" value={form.macAddress}
            onChange={(e) => set('macAddress', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Phone (optional)</label>
          <input className="input" placeholder="0712345678" value={form.phone}
            onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Duration override (minutes — leave blank for bundle default)</label>
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

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [terminating, setTerminating] = useState(null);
  const [grantOpen, setGrantOpen] = useState(false);

  const fetchSessions = async (p = page) => {
    setLoading(true);
    try {
      const res = await client.get(`/admin/sessions?page=${p}&limit=20`);
      setSessions(res.data.data);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSessions(); }, [page]);

  const terminate = async (id) => {
    if (!confirm('Terminate this session?')) return;
    setTerminating(id);
    try {
      await client.delete(`/admin/session/${id}`);
      fetchSessions();
    } finally {
      setTerminating(null);
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <>
      {grantOpen && (
        <GrantModal
          onClose={() => setGrantOpen(false)}
          onSuccess={() => { setGrantOpen(false); fetchSessions(); }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div className="page-title" style={{ margin: 0 }}>Sessions</div>
        <button className="btn btn-primary" onClick={() => setGrantOpen(true)} style={{ fontSize: '0.82rem' }}>
          + Grant Access
        </button>
      </div>

      <div className="table-wrap">
        {loading ? <div className="spinner" /> : (
          <table>
            <thead>
              <tr>
                <th>Phone</th>
                <th>Username</th>
                <th>Bundle</th>
                <th>Expires</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s._id}>
                  <td>{s.phone}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.username}</td>
                  <td>{s.bundleId?.name || '—'}</td>
                  <td>{s.expiresAt ? new Date(s.expiresAt).toLocaleString() : '—'}</td>
                  <td><span className={`badge badge-${s.status.toLowerCase()}`}>{s.status}</span></td>
                  <td>
                    {s.status === 'ACTIVE' && (
                      <button
                        className="btn btn-danger"
                        style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                        onClick={() => terminate(s._id)}
                        disabled={terminating === s._id}
                      >
                        Terminate
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
          <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}>Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page === totalPages}>Next</button>
        </div>
      )}
    </>
  );
}
