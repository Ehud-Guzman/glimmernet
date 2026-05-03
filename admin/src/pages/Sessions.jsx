import { useEffect, useState } from 'react';
import client from '../api/client';
import { useToast } from '../context/ToastContext';

const fmtDuration = (mins) => {
  if (!mins) return '—';
  if (mins >= 1440) return `${mins / 1440}d`;
  if (mins >= 60) return `${mins / 60}h`;
  return `${mins}m`;
};

const EmptyState = ({ icon, title, body }) => (
  <div style={{
    padding: '3rem 1.5rem', textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem',
  }}>
    <div style={{
      width: 56, height: 56, borderRadius: '16px',
      background: 'var(--accent-dim)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: '1.6rem',
    }}>{icon}</div>
    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)' }}>{title}</div>
    <div style={{ fontSize: '0.82rem', color: 'var(--text-3)', maxWidth: 280, lineHeight: 1.6 }}>{body}</div>
  </div>
);

function GrantModal({ onClose, onSuccess }) {
  const toast = useToast();
  const [bundles, setBundles]     = useState([]);
  const [operators, setOperators] = useState([]);
  const [selectedOp, setSelectedOp] = useState('');
  const [form, setForm] = useState({ macAddress: '', bundleId: '', phone: '', durationMinutes: '', note: '' });
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState('');
  const [lookupPhone, setLookupPhone] = useState('');
  const [looking, setLooking]         = useState(false);
  const [lookupHint, setLookupHint]   = useState('');

  useEffect(() => {
    client.get('/admin/operators').then((r) => setOperators(r.data.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const url = selectedOp === '' ? '/admin/bundles' : `/admin/bundles?operatorId=${selectedOp}`;
    client.get(url).then((r) => setBundles(r.data.data)).catch(() => {});
  }, [selectedOp]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const lookupByPhone = async () => {
    const q = lookupPhone.trim();
    if (!q) return;
    setLooking(true); setLookupHint('');
    try {
      const r = await client.get(`/admin/customer-lookup?phone=${encodeURIComponent(q)}`);
      const { lastMac, activeSession } = r.data.data;
      if (lastMac) {
        set('macAddress', lastMac);
        set('phone', q);
        setLookupHint(`MAC filled from previous session${activeSession ? ' (has active session)' : ''}.`);
      } else {
        setLookupHint('No previous MAC found for this number — enter it manually.');
      }
    } catch {
      setLookupHint('Lookup failed.');
    } finally {
      setLooking(false);
    }
  };

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
      toast.success('Access granted successfully.');
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

        {/* Phone lookup — fills MAC automatically */}
        <div style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '0.85rem 1rem', marginBottom: '1.25rem',
        }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: '0.55rem' }}>
            Look up by phone to auto-fill MAC
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              className="input"
              placeholder="0712345678"
              value={lookupPhone}
              onChange={(e) => { setLookupPhone(e.target.value); setLookupHint(''); }}
              onKeyDown={(e) => e.key === 'Enter' && lookupByPhone()}
              style={{ flex: 1, fontSize: '0.85rem' }}
            />
            <button className="btn btn-ghost" onClick={lookupByPhone} disabled={looking || !lookupPhone.trim()} style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
              {looking ? '…' : 'Look Up'}
            </button>
          </div>
          {lookupHint && (
            <div style={{ fontSize: '0.75rem', marginTop: '0.4rem', color: lookupHint.includes('filled') ? 'var(--green)' : 'var(--text-3)' }}>
              {lookupHint}
            </div>
          )}
        </div>

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
  const toast = useToast();
  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [terminating, setTerminating] = useState(null);
  const [extendTarget, setExtendTarget] = useState(null);
  const [extendMins, setExtendMins] = useState('');
  const [extending, setExtending] = useState(false);
  const [extendErr, setExtendErr] = useState('');
  const [grantOpen, setGrantOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

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
      await client.delete(`/admin/sessions/${id}`);
      toast.success('Session terminated.');
      fetchSessions();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not terminate session.');
    } finally {
      setTerminating(null);
    }
  };

  const submitExtend = async () => {
    const mins = Number(extendMins);
    if (!mins || mins < 1) { setExtendErr('Enter a positive number of minutes.'); return; }
    setExtending(true); setExtendErr('');
    try {
      await client.patch(`/admin/sessions/${extendTarget._id}/extend`, { minutes: mins });
      toast.success(`Session extended by ${mins} minute${mins !== 1 ? 's' : ''}.`);
      setExtendTarget(null); setExtendMins('');
      fetchSessions();
    } catch (e) {
      setExtendErr(e.response?.data?.message || 'Could not extend session.');
    } finally {
      setExtending(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await client.get('/admin/sessions/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sessions-${new Date().toISOString().slice(0, 10)}.csv`;
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
      {extendTarget && (
        <div className="modal-overlay" onClick={() => { setExtendTarget(null); setExtendMins(''); setExtendErr(''); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340 }}>
            <h3>Extend Session</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', marginBottom: '1rem' }}>
              Add time for <strong>{extendTarget.phone || extendTarget.username}</strong>
            </p>
            <div className="form-group">
              <label>Add minutes</label>
              <input
                className="input"
                type="number"
                min="1"
                max="10080"
                placeholder="e.g. 60"
                value={extendMins}
                onChange={(e) => { setExtendMins(e.target.value); setExtendErr(''); }}
                autoFocus
              />
            </div>
            {extendErr && <p className="error-msg">{extendErr}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button className="btn btn-primary" onClick={submitExtend} disabled={extending}>
                {extending ? 'Extending…' : 'Extend'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setExtendTarget(null); setExtendMins(''); setExtendErr(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {grantOpen && (
        <GrantModal
          onClose={() => setGrantOpen(false)}
          onSuccess={() => { setGrantOpen(false); fetchSessions(); }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="page-title" style={{ margin: 0 }}>Sessions</div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={exportCsv} disabled={exporting} style={{ fontSize: '0.82rem' }}>
            {exporting ? 'Exporting…' : '⬇ Export CSV'}
          </button>
          <button className="btn btn-primary" onClick={() => setGrantOpen(true)} style={{ fontSize: '0.82rem' }}>
            + Grant Access
          </button>
        </div>
      </div>

      <div className="table-wrap">
        {loading ? <div className="spinner" /> : sessions.length === 0 ? (
          <EmptyState
            icon="📡"
            title="No sessions yet"
            body="Active and past sessions will appear here once devices connect through the captive portal."
          />
        ) : (
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
                  <td>{s.phone || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.username}</td>
                  <td>{s.bundleId?.name || '—'}</td>
                  <td>{s.expiresAt ? new Date(s.expiresAt).toLocaleString() : '—'}</td>
                  <td><span className={`badge badge-${s.status.toLowerCase()}`}>{s.status}</span></td>
                  <td>
                    {s.status === 'ACTIVE' && (
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                          onClick={() => { setExtendTarget(s); setExtendMins(''); setExtendErr(''); }}
                        >
                          Extend
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                          onClick={() => terminate(s._id)}
                          disabled={terminating === s._id}
                        >
                          Terminate
                        </button>
                      </div>
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
