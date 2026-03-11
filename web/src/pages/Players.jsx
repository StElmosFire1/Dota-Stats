import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAllPlayers, setNickname } from '../api';

export default function Players() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const loadPlayers = () => {
    setLoading(true);
    getAllPlayers()
      .then(data => setPlayers(data.players || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadPlayers, []);

  const startEdit = (player) => {
    setEditingId(player.account_id);
    setEditValue(player.nickname || '');
  };

  const saveNickname = async (accountId) => {
    const uploadKey = localStorage.getItem('uploadKey');
    if (!uploadKey) {
      alert('Set an upload key on the Upload page first');
      return;
    }
    setSaving(true);
    try {
      await setNickname(accountId, editValue, uploadKey);
      setEditingId(null);
      loadPlayers();
    } catch (err) {
      alert('Failed: ' + err.message);
    }
    setSaving(false);
  };

  if (loading) return <div className="loading">Loading players...</div>;

  return (
    <div>
      <h1 className="page-title">Players</h1>
      <p style={{ color: '#888', marginBottom: '1rem' }}>{players.length} players with recorded matches</p>
      <div className="scoreboard-wrapper">
        <table className="scoreboard">
          <thead>
            <tr>
              <th className="col-player">Steam Name</th>
              <th className="col-player">Nickname</th>
              <th className="col-stat">Games</th>
              <th className="col-stat">Last Played</th>
              <th className="col-stat">Actions</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.account_id}>
                <td className="col-player">
                  <Link to={`/player/${p.account_id}`} className="player-link">
                    {p.persona_name || `Player ${p.account_id}`}
                  </Link>
                </td>
                <td className="col-player">
                  {editingId === p.account_id ? (
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <input
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveNickname(p.account_id)}
                        placeholder="Set nickname..."
                        style={{
                          background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #555',
                          padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.85rem', width: '120px',
                        }}
                        autoFocus
                      />
                      <button
                        onClick={() => saveNickname(p.account_id)}
                        disabled={saving}
                        style={{
                          background: '#4ade80', color: '#000', border: 'none',
                          padding: '0.2rem 0.5rem', borderRadius: '3px', cursor: 'pointer', fontSize: '0.8rem',
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        style={{
                          background: 'transparent', color: '#888', border: '1px solid #444',
                          padding: '0.2rem 0.5rem', borderRadius: '3px', cursor: 'pointer', fontSize: '0.8rem',
                        }}
                      >
                        X
                      </button>
                    </div>
                  ) : (
                    <span style={{ color: p.nickname ? '#e0e0e0' : '#555' }}>
                      {p.nickname || '--'}
                    </span>
                  )}
                </td>
                <td className="col-stat">{p.games_played}</td>
                <td className="col-stat">
                  {p.last_played
                    ? new Date(p.last_played).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
                    : '--'}
                </td>
                <td className="col-stat">
                  {editingId !== p.account_id && (
                    <button
                      onClick={() => startEdit(p)}
                      style={{
                        background: 'transparent', color: '#888', border: '1px solid #444',
                        padding: '0.15rem 0.5rem', borderRadius: '3px', cursor: 'pointer', fontSize: '0.8rem',
                      }}
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
