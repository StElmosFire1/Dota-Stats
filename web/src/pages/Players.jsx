import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAllPlayers, setNickname } from '../api';

const POS_SHORT = { 1: 'Pos 1', 2: 'Pos 2', 3: 'Pos 3', 4: 'Pos 4', 5: 'Pos 5' };

export default function Players() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [sortField, setSortField] = useState('games_played');
  const [sortDir, setSortDir] = useState(-1);

  const loadPlayers = () => {
    setLoading(true);
    getAllPlayers()
      .then(data => setPlayers(data.players || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadPlayers, []);

  const getPlayerKey = (p) => p.player_key || (p.account_id > 0 ? p.account_id.toString() : p.persona_name);
  const getProfileLink = (p) => {
    if (p.account_id > 0) return `/player/${p.account_id}`;
    return `/player/${encodeURIComponent(p.player_key || p.persona_name)}`;
  };

  const startEdit = (player) => {
    setEditingKey(getPlayerKey(player));
    setEditValue(player.nickname || '');
  };

  const saveNickname = async (player) => {
    if (player.account_id <= 0) {
      alert('Nickname editing requires a Steam account ID. Players with account_id=0 cannot have nicknames yet.');
      return;
    }
    const uploadKey = localStorage.getItem('uploadKey');
    if (!uploadKey) {
      alert('Set an upload key on the Upload page first');
      return;
    }
    setSaving(true);
    try {
      await setNickname(player.account_id, editValue, uploadKey);
      setEditingKey(null);
      loadPlayers();
    } catch (err) {
      alert('Failed: ' + err.message);
    }
    setSaving(false);
  };

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => -d);
    else { setSortField(field); setSortDir(-1); }
  };

  const si = (field) => sortField === field ? (sortDir > 0 ? ' \u25B2' : ' \u25BC') : '';

  const sorted = [...players].sort((a, b) => {
    let va = a[sortField], vb = b[sortField];
    if (sortField === 'win_rate') {
      va = a.games_played > 0 ? parseInt(a.wins) / parseInt(a.games_played) : 0;
      vb = b.games_played > 0 ? parseInt(b.wins) / parseInt(b.games_played) : 0;
    }
    if (sortField === 'persona_name' || sortField === 'nickname') {
      return String(va || '').localeCompare(String(vb || '')) * sortDir;
    }
    return (parseFloat(va || 0) - parseFloat(vb || 0)) * sortDir;
  });

  if (loading) return <div className="loading">Loading players...</div>;

  return (
    <div>
      <h1 className="page-title">Players</h1>
      <p style={{ color: '#888', marginBottom: '1rem' }}>{players.length} players with recorded matches</p>
      <div className="scoreboard-wrapper">
        <table className="scoreboard">
          <thead>
            <tr>
              <th className="col-player" title="Player display name" style={{ cursor: 'pointer' }} onClick={() => handleSort('persona_name')}>Player{si('persona_name')}</th>
              <th className="col-stat" title="Total games played" style={{ cursor: 'pointer' }} onClick={() => handleSort('games_played')}>Games{si('games_played')}</th>
              <th className="col-stat" title="Wins" style={{ cursor: 'pointer' }} onClick={() => handleSort('wins')}>W{si('wins')}</th>
              <th className="col-stat" title="Win percentage" style={{ cursor: 'pointer' }} onClick={() => handleSort('win_rate')}>Win%{si('win_rate')}</th>
              <th className="col-stat" title="Average kills per game" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_kills')}>K{si('avg_kills')}</th>
              <th className="col-stat" title="Average deaths per game" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_deaths')}>D{si('avg_deaths')}</th>
              <th className="col-stat" title="Average assists per game" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_assists')}>A{si('avg_assists')}</th>
              <th className="col-stat" title="Kill Involvement — percentage of team kills you participated in (kills + assists)" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_kill_involvement')}>KI%{si('avg_kill_involvement')}</th>
              <th className="col-stat" title="Most frequently played position" style={{ cursor: 'pointer' }} onClick={() => handleSort('best_position')}>Best Pos{si('best_position')}</th>
              <th className="col-stat" title="Date of most recent match">Last Played</th>
              <th className="col-stat" title="Custom nickname — click Edit to change">Nickname</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, idx) => {
              const key = getPlayerKey(p);
              const games = parseInt(p.games_played) || 0;
              const wins = parseInt(p.wins) || 0;
              const winRate = games > 0 ? ((wins / games) * 100).toFixed(0) : '0';
              const displayName = p.nickname || p.persona_name || `Player ${p.account_id}`;
              return (
                <tr key={key || idx}>
                  <td className="col-player">
                    <Link to={getProfileLink(p)} className="player-link">
                      {displayName}
                    </Link>
                  </td>
                  <td className="col-stat">{games}</td>
                  <td className="col-stat" style={{ color: '#4ade80' }}>{wins}</td>
                  <td className="col-stat" style={{ color: parseInt(winRate) >= 50 ? '#4ade80' : '#f87171' }}>{winRate}%</td>
                  <td className="col-stat">{p.avg_kills}</td>
                  <td className="col-stat">{p.avg_deaths}</td>
                  <td className="col-stat">{p.avg_assists}</td>
                  <td className="col-stat">{p.avg_kill_involvement}%</td>
                  <td className="col-stat">{p.best_position ? POS_SHORT[p.best_position] || '-' : '-'}</td>
                  <td className="col-stat">
                    {p.last_played
                      ? new Date(p.last_played).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
                      : '--'}
                  </td>
                  <td className="col-stat">
                    {editingKey === key ? (
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <input
                          type="text"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveNickname(p)}
                          placeholder="Set nickname..."
                          style={{
                            background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #555',
                            padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.85rem', width: '100px',
                          }}
                          autoFocus
                        />
                        <button
                          onClick={() => saveNickname(p)}
                          disabled={saving}
                          style={{
                            background: '#4ade80', color: '#000', border: 'none',
                            padding: '0.2rem 0.5rem', borderRadius: '3px', cursor: 'pointer', fontSize: '0.8rem',
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingKey(null)}
                          style={{
                            background: 'transparent', color: '#888', border: '1px solid #444',
                            padding: '0.2rem 0.5rem', borderRadius: '3px', cursor: 'pointer', fontSize: '0.8rem',
                          }}
                        >
                          X
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ color: p.nickname ? '#e0e0e0' : '#555' }}>
                          {p.nickname || '--'}
                        </span>
                        <button
                          onClick={() => startEdit(p)}
                          style={{
                            background: 'transparent', color: '#666', border: '1px solid #333',
                            padding: '0.1rem 0.35rem', borderRadius: '3px', cursor: 'pointer', fontSize: '0.7rem',
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
