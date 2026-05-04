import { useEffect, useState } from 'react';
import client from '../api/client';
import { getName } from '../utils/auth';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';

const ROLE_COLORS = { superadmin: '#00c853', admin: '#2196f3' };
const ROLE_LABELS = { superadmin: 'Superadmin', admin: 'Admin' };

const EMPTY = { name: '', email: '', password: '', role: 'admin' };

export default function AdminUsers() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | user obj
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toggleTarget, setToggleTarget] = useState(null); // user to activate/deactivate
  const [toggling, setToggling] = useState(false);
  const [resetTarget, setResetTarget] = useState(null); // user to reset password
  const [resetPass, setResetPass] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState('');
  const myName = getName();

  const fetch = () => {
    setLoading(true);
    client.get('/admin/users')
      .then((r) => setUsers(r.data.data))
      .catch(() => toast.error('Could not load admin users.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  const openCreate = () => { setForm(EMPTY); setError(''); setModal('create'); };
  const openEdit = (u) => {
    setForm({ name: u.name, email: u.email, role: u.role, password: '' });
    setError('');
    setModal(u);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    const payload = { name: form.name, email: form.email, role: form.role };
    if (form.password) payload.password = form.password;

    try {
      if (modal === 'create') {
        if (!form.password) { setError('Password is required for new accounts.'); setSaving(false); return; }
        await client.post('/admin/users', { ...payload, password: form.password });
        toast.success('Admin user created.');
      } else {
        await client.put(`/admin/users/${modal._id}`, payload);
        toast.success('User updated.');
      }
      setModal(null);
      fetch();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmToggle = async () => {
    if (!toggleTarget) return;
    setToggling(true);
    try {
      await client.put(`/admin/users/${toggleTarget._id}`, { isActive: !toggleTarget.isActive });
      toast.success(`${toggleTarget.name} ${toggleTarget.isActive ? 'deactivated' : 'reactivated'}.`);
      setToggleTarget(null);
      fetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update user status.');
      setToggleTarget(null);
    } finally {
      setToggling(false);
    }
  };

  const submitResetPassword = async (e) => {
    e.preventDefault();
    if (resetPass.length < 6) { setResetError('Password must be at least 6 characters.'); return; }
    setResetSaving(true); setResetError('');
    try {
      await client.put(`/admin/users/${resetTarget._id}`, { password: resetPass });
      toast.success(`Password reset for ${resetTarget.name}.`);
      setResetTarget(null);
      setResetPass('');
    } catch (err) {
      setResetError(err.response?.data?.message || 'Failed to reset password.');
    } finally {
      setResetSaving(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="page-title" style={{ marginBottom: 0 }}>Admin Users</div>
        <button className="btn btn-primary" onClick={openCreate}>+ New User</button>
      </div>

      <div className="table-wrap">
        {loading ? <div className="spinner" /> : users.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-3)' }}>
            No admin users found.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} style={{ opacity: u.isActive ? 1 : 0.45 }}>
                  <td>
                    <div style={{ fontWeight: 500 }}>
                      {u.name}
                      {u.name === myName && (
                        <span style={{ fontSize: '0.7rem', color: '#555', marginLeft: '0.4rem' }}>(you)</span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.85rem', color: '#aaa' }}>{u.email}</td>
                  <td>
                    <span style={{
                      padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
                      background: (ROLE_COLORS[u.role] || '#888') + '22',
                      color: ROLE_COLORS[u.role] || '#888',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
                      background: u.isActive ? '#00c85322' : '#f4433622',
                      color: u.isActive ? '#00c853' : '#f44336',
                    }}>
                      {u.isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.78rem', color: '#666' }}>
                    {new Date(u.createdAt).toLocaleDateString('en-KE')}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button className="btn btn-ghost"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                        onClick={() => openEdit(u)}>
                        Edit
                      </button>
                      <button className="btn btn-ghost"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                        onClick={() => { setResetTarget(u); setResetPass(''); setResetError(''); }}>
                        Reset PWD
                      </button>
                      <button className="btn btn-ghost"
                        style={{
                          padding: '0.25rem 0.5rem', fontSize: '0.72rem',
                          color: u.isActive ? '#f44336' : '#00c853',
                        }}
                        onClick={() => setToggleTarget(u)}>
                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / Edit modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3>{modal === 'create' ? 'New Admin User' : `Edit — ${modal.name}`}</h3>
            <form onSubmit={handleSave}>
              {[
                { label: 'Full Name', key: 'name', type: 'text', required: true },
                { label: 'Email', key: 'email', type: 'email', required: true },
              ].map(({ label, key, type, required }) => (
                <div className="form-group" key={key}>
                  <label>{label}</label>
                  <input type={type} value={form[key]} required={required}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                </div>
              ))}

              <div className="form-group">
                <label>Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', background: '#111', color: '#fff', border: '1px solid #2a2a2a', borderRadius: '6px' }}>
                  <option value="admin">Admin — standard access</option>
                  <option value="superadmin">Superadmin — full platform control</option>
                </select>
              </div>

              <div className="form-group">
                <label>
                  {modal === 'create' ? 'Password' : 'New Password'}
                  {modal !== 'create' && (
                    <span style={{ color: '#555', fontSize: '0.75rem', marginLeft: '0.4rem' }}>(leave blank to keep current)</span>
                  )}
                </label>
                <input type="password" value={form.password} required={modal === 'create'} minLength={6}
                  placeholder={modal !== 'create' ? 'Leave blank to keep' : ''}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>

              {error && <p className="error-msg">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Activate / Deactivate confirmation */}
      {toggleTarget && (
        <ConfirmModal
          title={toggleTarget.isActive ? 'Deactivate User' : 'Reactivate User'}
          message={`${toggleTarget.isActive ? 'Deactivate' : 'Reactivate'} ${toggleTarget.name}? ${toggleTarget.isActive ? 'They will lose access to the admin panel.' : 'They will regain access to the admin panel.'}`}
          confirmLabel={toggleTarget.isActive ? 'Deactivate' : 'Reactivate'}
          danger={toggleTarget.isActive}
          loading={toggling}
          loadingLabel={toggleTarget.isActive ? 'Deactivating…' : 'Reactivating…'}
          onConfirm={confirmToggle}
          onCancel={() => setToggleTarget(null)}
        />
      )}

      {/* Reset Password modal */}
      {resetTarget && (
        <div className="modal-overlay" onClick={() => setResetTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <h3>Reset Password</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', margin: '0.25rem 0 1rem' }}>
              Set a new password for <strong>{resetTarget.name}</strong>.
            </p>
            <form onSubmit={submitResetPassword}>
              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={resetPass}
                  required
                  minLength={6}
                  autoFocus
                  placeholder="At least 6 characters"
                  onChange={(e) => { setResetPass(e.target.value); setResetError(''); }}
                />
              </div>
              {resetError && <p className="error-msg">{resetError}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setResetTarget(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={resetSaving}>
                  {resetSaving ? 'Saving…' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
