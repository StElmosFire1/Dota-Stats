import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getHeadToHead, getAllPlayers } from '../api';
import { getHeroName, getHeroImageUrl } from '../heroNames';
import { useSeason } from '../context/SeasonContext';

function formatDuration(s) {
  if (!s) return '--';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function HeadToHead() {
  const { seasonId } = useSeason();
  const [players, setPlayers] = useState([]);
  const [playerA, setPlayerA] = useState('');
  const [playerB, setPlayerB] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getAllPlayers(null).then(r => setPlayers(r.players || [])).catch(() => {});
  }, []);

  const search = useCallback(async () => {
    if (!playerA || !playerB || playerA === playerB) return;
    setLoading(true);
    setError(null);
    try {
      const d = await getHeadToHead(playerA, playerB, seasonId);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [playerA, playerB, seasonId]);

  const nameFor = (id) => {
    const p = players.find(x => x.account_id?.toString() === id?.toString());
    return p?.player_key || id;
  };

  const aName = nameFor(playerA);
  const bName = nameFor(playerB);

  return (
    <div>
      <h1 className="page-title">Head to Head</h1>
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Player A</label>
          <select
            value={playerA}
            onChange={e => setPlayerA(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }}
          >
            <option value="">Select player…</option>
            {players.map(p => (
              <option key={p.account_id} value={p.account_id}>{p.player_key}</option>
            ))}
          </select>
        </div>
        <div className="stat-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '2rem', color: 'var(--text-muted)' }}>vs</span>
        </div>
        <div className="stat-card">
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Player B</label>
          <select
            value={playerB}
            onChange={e => setPlayerB(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }}
          >
            <option value="">Select player…</option>
            {players.map(p => (
              <option key={p.account_id} value={p.account_id}>{p.player_key}</option>
            ))}
          </select>
        </div>
      </div>
      <button className="btn btn-primary" onClick={search} disabled={!playerA || !playerB || playerA === playerB || loading}>
        {loading ? 'Loading…' : 'Compare'}
      </button>

      {error && <div className="error-state" style={{ marginTop: '1rem' }}>{error}</div>}

      {data && (
        <div style={{ marginTop: '2rem' }}>
          {data.total === 0 ? (
            <div className="empty-state"><p>No matches found where {aName} and {bName} faced each other.</p></div>
          ) : (
            <>
              <div className="stats-grid" style={{ gridTemplateColumns: '1fr auto 1fr', marginBottom: '2rem' }}>
                <div className="stat-card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 8 }}>{aName}</div>
                  <div style={{ fontSize: 56, fontWeight: 700, color: data.a_wins > data.b_wins ? 'var(--accent-green)' : data.a_wins < data.b_wins ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                    {data.a_wins}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>wins</div>
                </div>
                <div className="stat-card" style={{ textAlign: 'center', padding: '1rem 1.5rem' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Total</div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{data.total}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>matches</div>
                </div>
                <div className="stat-card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 8 }}>{bName}</div>
                  <div style={{ fontSize: 56, fontWeight: 700, color: data.b_wins > data.a_wins ? 'var(--accent-green)' : data.b_wins < data.a_wins ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                    {data.b_wins}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>wins</div>
                </div>
              </div>

              <div className="scoreboard-wrapper">
                <table className="scoreboard">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>{aName} Hero</th>
                      <th>{aName} KDA</th>
                      <th>{aName} GPM</th>
                      <th>Result</th>
                      <th>{bName} GPM</th>
                      <th>{bName} KDA</th>
                      <th>{bName} Hero</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.matches.map(m => {
                      const aWon = (m.a_team === 'radiant' && m.radiant_win) || (m.a_team === 'dire' && !m.radiant_win);
                      const aKda = m.a_deaths > 0 ? ((m.a_kills + m.a_assists) / m.a_deaths).toFixed(2) : (m.a_kills + m.a_assists) + '.00';
                      const bKda = m.b_deaths > 0 ? ((m.b_kills + m.b_assists) / m.b_deaths).toFixed(2) : (m.b_kills + m.b_assists) + '.00';
                      const aImg = getHeroImageUrl(m.a_hero_id, m.a_hero);
                      const bImg = getHeroImageUrl(m.b_hero_id, m.b_hero);
                      return (
                        <tr key={m.match_id}>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.date ? new Date(m.date).toLocaleDateString() : '—'}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {aImg && <img src={aImg} alt="" style={{ width: 24, height: 24, borderRadius: 4 }} />}
                              <span style={{ fontSize: 12 }}>{getHeroName(m.a_hero_id) || m.a_hero || '—'}</span>
                            </div>
                          </td>
                          <td style={{ fontSize: 13 }}>{m.a_kills}/{m.a_deaths}/{m.a_assists} ({aKda})</td>
                          <td style={{ fontSize: 13 }}>{m.a_gpm ? Math.round(m.a_gpm) : '—'}</td>
                          <td>
                            <span style={{ fontWeight: 600, color: aWon ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                              {aWon ? `${aName} ✓` : `${bName} ✓`}
                            </span>
                          </td>
                          <td style={{ fontSize: 13 }}>{m.b_gpm ? Math.round(m.b_gpm) : '—'}</td>
                          <td style={{ fontSize: 13 }}>{m.b_kills}/{m.b_deaths}/{m.b_assists} ({bKda})</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {bImg && <img src={bImg} alt="" style={{ width: 24, height: 24, borderRadius: 4 }} />}
                              <span style={{ fontSize: 12 }}>{getHeroName(m.b_hero_id) || m.b_hero || '—'}</span>
                            </div>
                          </td>
                          <td style={{ fontSize: 12 }}>{formatDuration(m.duration)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
