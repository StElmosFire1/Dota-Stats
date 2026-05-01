import React, { useState, useEffect } from 'react';
import { useSeason } from '../context/SeasonContext';
import { useAdmin } from '../context/AdminContext';
import { useSuperuser } from '../context/SuperuserContext';
import {
  createSeason, activateSeason, deleteSeasonApi,
} from '../api';


export default function Seasons() {
  const { seasons, activeSeason, refreshSeasons } = useSeason();
  const { isAdmin, adminKey, setShowModal: setAdminModal } = useAdmin();
  const { isSuperuser, superuserKey, setShowModal: setSuperuserModal } = useSuperuser();
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);



  function feedback(err, ok) {
    setError(err || '');
    setSuccess(ok || '');
    if (ok) setTimeout(() => setSuccess(''), 3000);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    if (!isAdmin) { setAdminModal(true); return; }
    setLoading(true);
    try {
      await createSeason(newName.trim(), adminKey);
      setNewName('');
      await refreshSeasons();
      feedback('', 'Season created and set as active.');
    } catch (err) {
      feedback(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleActivate(id) {
    if (!isAdmin) { setAdminModal(true); return; }
    setLoading(true);
    try {
      await activateSeason(id, adminKey);
      await refreshSeasons();
      feedback('', id === null ? 'No active season (uploads unassigned).' : 'Season activated.');
    } catch (err) {
      feedback(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(season) {
    if (!isSuperuser) { setSuperuserModal(true); return; }
    setLoading(true);
    try {
      await deleteSeasonApi(season.id, superuserKey);
      await refreshSeasons();
      setDeleteConfirm(null);
      feedback('', `Season "${season.name}" deleted.`);
    } catch (err) {
      feedback(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!isSuperuser) {
    return (
      <div style={{ maxWidth: 600, margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Superuser Access Required</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
          Season management is restricted to superusers only.
        </p>
        <button className="btn btn-primary" onClick={() => setSuperuserModal(true)}>
          Login as Superuser
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 24 }}>Seasons</h2>


      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 400, margin: 16 }}>
            <h3 style={{ marginTop: 0, color: 'var(--danger, #f87171)' }}>Delete Season?</h3>
            <p style={{ color: 'var(--muted)' }}>
              Are you sure you want to permanently delete <strong>{deleteConfirm.name}</strong>?
              Matches assigned to this season will have their season reference cleared.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)} disabled={loading}>
                {loading ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Create New Season</h3>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>
          Creating a season sets it as active — new replay uploads will be automatically assigned to it.
        </p>
        {!isAdmin && (
          <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--muted)' }}>
            <button className="btn btn-small" onClick={() => setAdminModal(true)}>Login as admin</button>
            {' '}to manage seasons.
          </div>
        )}
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text" className="input"
            placeholder="Season name (e.g. Season 1, Winter 2025)"
            value={newName} onChange={e => setNewName(e.target.value)}
            style={{ flex: '1 1 200px', minWidth: 160 }} required disabled={!isAdmin}
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !isAdmin}>
            {loading ? 'Creating…' : 'Create Season'}
          </button>
        </form>
        {error && <div className="error-msg" style={{ marginTop: 10 }}>{error}</div>}
        {success && <div className="success-msg" style={{ marginTop: 10 }}>{success}</div>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>All Seasons</h3>
        {seasons.length === 0 ? (
          <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>No seasons yet. Create one above.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map(s => {
                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.name}</strong>
                        {s.is_legacy && (
                          <span style={{
                            marginLeft: 8, fontSize: 11, padding: '1px 6px',
                            background: 'var(--surface2, #2a2a3a)', color: 'var(--muted)',
                            borderRadius: 4, verticalAlign: 'middle', border: '1px solid var(--border)'
                          }}>Legacy</span>
                        )}
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                          {new Date(s.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td>
                        {s.active
                          ? <span className="badge badge-radiant">Active</span>
                          : s.is_legacy
                            ? <span style={{ color: 'var(--muted)', fontSize: 13 }}>Legacy</span>
                            : <span style={{ color: 'var(--muted)', fontSize: 13 }}>Inactive</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                          {!s.active && (
                            <button className="btn btn-small" disabled={loading} onClick={() => handleActivate(s.id)}>Set Active</button>
                          )}
                          {s.active && (
                            <button className="btn btn-small btn-danger" disabled={loading} onClick={() => handleActivate(null)}>Deactivate</button>
                          )}
                          {isSuperuser && (
                            <button
                              className="btn btn-small btn-danger"
                              style={{ fontSize: 11, opacity: 0.8 }}
                              onClick={() => setDeleteConfirm(s)}
                              title="Superuser: delete this season"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {seasons.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>
            {activeSeason
              ? <>Active season: <strong>{activeSeason.name}</strong> — new uploads will be tagged to this season.</>
              : 'No active season — new uploads will have no season assigned.'}
          </div>
        )}
      </div>
    </div>
  );
}
