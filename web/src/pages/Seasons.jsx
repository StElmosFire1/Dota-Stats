import React, { useState } from 'react';
import { useSeason } from '../context/SeasonContext';
import { createSeason, activateSeason } from '../api';

export default function Seasons() {
  const { seasons, activeSeason, refreshSeasons } = useSeason();
  const [newName, setNewName] = useState('');
  const [uploadKey, setUploadKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function feedback(err, ok) {
    setError(err || '');
    setSuccess(ok || '');
    if (ok) setTimeout(() => setSuccess(''), 3000);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setLoading(true);
    try {
      await createSeason(newName.trim(), uploadKey);
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
    setLoading(true);
    try {
      await activateSeason(id, uploadKey);
      await refreshSeasons();
      feedback('', id === null ? 'No active season (uploads unassigned).' : 'Season activated.');
    } catch (err) {
      feedback(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 24 }}>Seasons</h2>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Create New Season</h3>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>
          Creating a season sets it as active — new replay uploads will be automatically assigned to it.
        </p>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            className="input"
            placeholder="Season name (e.g. Season 1, Winter 2025)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            style={{ flex: '1 1 200px', minWidth: 160 }}
            required
          />
          <input
            type="password"
            className="input"
            placeholder="Upload key"
            value={uploadKey}
            onChange={e => setUploadKey(e.target.value)}
            style={{ width: 160 }}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating…' : 'Create Season'}
          </button>
        </form>
        {error && <div className="error-msg" style={{ marginTop: 10 }}>{error}</div>}
        {success && <div className="success-msg" style={{ marginTop: 10 }}>{success}</div>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>All Seasons</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          The active season is where new uploads go. Only one season can be active at a time.
        </p>

        {seasons.length === 0 ? (
          <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>
            No seasons yet. Create one above.
          </div>
        ) : (
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Season</th>
                <th>Created</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong></td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    {s.active
                      ? <span className="badge badge-radiant">Active</span>
                      : <span style={{ color: 'var(--muted)', fontSize: 13 }}>Inactive</span>
                    }
                  </td>
                  <td>
                    {!s.active && (
                      <button
                        className="btn btn-small"
                        disabled={loading || !uploadKey}
                        onClick={() => handleActivate(s.id)}
                        title={uploadKey ? '' : 'Enter upload key above first'}
                      >
                        Set Active
                      </button>
                    )}
                    {s.active && (
                      <button
                        className="btn btn-small btn-danger"
                        disabled={loading || !uploadKey}
                        onClick={() => handleActivate(null)}
                        title={uploadKey ? 'Remove active season (uploads will be unassigned)' : 'Enter upload key above first'}
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
