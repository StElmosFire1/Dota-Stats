import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getPlayerComparison, getHeadToHead, getAllPlayers } from '../api';
import { getHeroName, getHeroImageUrl } from '../heroNames';
import { useSeason } from '../context/SeasonContext';

function formatDuration(s) {
  if (!s) return '--';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function StatBar({ label, a, b, higherBetter = true, format = v => v?.toFixed(1) }) {
  const aV = parseFloat(a) || 0;
  const bV = parseFloat(b) || 0;
  const aWins = higherBetter ? aV > bV : aV < bV;
  const bWins = higherBetter ? bV > aV : bV < aV;
  const maxVal = Math.max(aV, bV, 0.001);
  const pctDiff = maxVal > 0 ? Math.round(Math.abs(aV - bV) / maxVal * 100) : 0;
  const aFrac = aV / maxVal;
  const bFrac = bV / maxVal;
  const green = '#4ade80';
  const red = '#f87171';
  const neutral = '#334155';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 110px 1fr',
      alignItems: 'center',
      padding: '9px 0',
      borderBottom: '1px solid #1e293b',
      gap: 0,
    }}>
      <div style={{ textAlign: 'right', paddingRight: 10 }}>
        <div style={{
          fontSize: 15, fontWeight: aWins ? 700 : 400,
          color: aWins ? green : aV === bV ? 'var(--text-muted)' : 'var(--text-primary)',
          marginBottom: 4,
        }}>
          {format(aV)}
          {aWins && pctDiff > 0 && (
            <span style={{ fontSize: 10, color: green, marginLeft: 4, fontWeight: 400 }}>↑{pctDiff}%</span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{
            height: 8, borderRadius: 4,
            width: `${Math.round(aFrac * 100)}%`,
            maxWidth: '100%',
            background: aWins ? green : bWins ? neutral : '#4a5568',
            transition: 'width 0.4s ease',
            minWidth: aV > 0 ? 4 : 0,
          }} />
        </div>
      </div>

      <div style={{
        textAlign: 'center', fontSize: 11,
        color: 'var(--text-muted)', lineHeight: 1.3,
        padding: '0 4px',
      }}>
        {label}
      </div>

      <div style={{ paddingLeft: 10 }}>
        <div style={{
          fontSize: 15, fontWeight: bWins ? 700 : 400,
          color: bWins ? '#b967ff' : aV === bV ? 'var(--text-muted)' : 'var(--text-primary)',
          marginBottom: 4,
        }}>
          {format(bV)}
          {bWins && pctDiff > 0 && (
            <span style={{ fontSize: 10, color: '#b967ff', marginLeft: 4, fontWeight: 400 }}>↑{pctDiff}%</span>
          )}
        </div>
        <div style={{
          height: 8, borderRadius: 4,
          width: `${Math.round(bFrac * 100)}%`,
          maxWidth: '100%',
          background: bWins ? '#b967ff' : aWins ? neutral : '#4a5568',
          transition: 'width 0.4s ease',
          minWidth: bV > 0 ? 4 : 0,
        }} />
      </div>
    </div>
  );
}

function PlayerSelectors({ players, playerA, setPlayerA, playerB, setPlayerB, onSearch, loading, buttonLabel }) {
  const selStyle = {
    width: '100%', background: 'var(--bg-input)',
    color: 'var(--text-primary)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '8px 10px', fontSize: 14,
  };
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, marginBottom: 14 }}>
        <div className="stat-card">
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Player A</label>
          <select value={playerA} onChange={e => setPlayerA(e.target.value)} style={selStyle}>
            <option value="">Select player…</option>
            {players.map(p => (
              <option key={p.account_id} value={p.account_id}>{p.nickname || p.persona_name || p.player_key}</option>
            ))}
          </select>
        </div>
        <div className="stat-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.75rem 1.25rem' }}>
          <span style={{ fontSize: '1.8rem', color: 'var(--text-muted)' }}>vs</span>
        </div>
        <div className="stat-card">
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Player B</label>
          <select value={playerB} onChange={e => setPlayerB(e.target.value)} style={selStyle}>
            <option value="">Select player…</option>
            {players.map(p => (
              <option key={p.account_id} value={p.account_id}>{p.nickname || p.persona_name || p.player_key}</option>
            ))}
          </select>
        </div>
      </div>
      <button
        className="btn btn-primary"
        onClick={onSearch}
        disabled={!playerA || !playerB || playerA === playerB || loading}
      >
        {loading ? 'Loading…' : buttonLabel}
      </button>
    </div>
  );
}

function CompareTab({ players, seasonId }) {
  const [playerA, setPlayerA] = useState('');
  const [playerB, setPlayerB] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const search = useCallback(async () => {
    if (!playerA || !playerB || playerA === playerB) return;
    setLoading(true);
    setError(null);
    try {
      const d = await getPlayerComparison(playerA, playerB, seasonId);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [playerA, playerB, seasonId]);

  return (
    <div>
      <PlayerSelectors
        players={players}
        playerA={playerA} setPlayerA={setPlayerA}
        playerB={playerB} setPlayerB={setPlayerB}
        onSearch={search} loading={loading} buttonLabel="Compare Stats"
      />
      {error && <div className="error-state" style={{ marginTop: '1rem' }}>{error}</div>}

      {data && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 110px 1fr',
            gap: 0, marginBottom: 8, padding: '0 0 8px 0',
            borderBottom: '2px solid var(--border)',
          }}>
            <div style={{ textAlign: 'right', paddingRight: 10, fontWeight: 700, fontSize: 17, color: '#4ade80' }}>
              {data.a.display_name}
            </div>
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}></div>
            <div style={{ paddingLeft: 10, fontWeight: 700, fontSize: 17, color: '#b967ff' }}>
              {data.b.display_name}
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            Bar length = relative to the higher of the two values. Green ↑ = winner, with % advantage shown.
          </p>
          <div className="stat-card" style={{ padding: '0.5rem 1rem' }}>
            <StatBar label="MMR" a={data.a.mmr} b={data.b.mmr} format={v => Math.round(v)} />
            <StatBar label="Games" a={data.a.games} b={data.b.games} format={v => Math.round(v)} />
            <StatBar label="Win Rate" a={data.a.games > 0 ? data.a.wins / data.a.games * 100 : 0} b={data.b.games > 0 ? data.b.wins / data.b.games * 100 : 0} format={v => v.toFixed(1) + '%'} />
            <StatBar label="Avg Kills" a={data.a.avg_kills} b={data.b.avg_kills} />
            <StatBar label="Avg Deaths" a={data.a.avg_deaths} b={data.b.avg_deaths} higherBetter={false} />
            <StatBar label="Avg Assists" a={data.a.avg_assists} b={data.b.avg_assists} />
            <StatBar label="KDA" a={data.a.avg_deaths > 0 ? (data.a.avg_kills + data.a.avg_assists) / data.a.avg_deaths : data.a.avg_kills + data.a.avg_assists} b={data.b.avg_deaths > 0 ? (data.b.avg_kills + data.b.avg_assists) / data.b.avg_deaths : data.b.avg_kills + data.b.avg_assists} format={v => v.toFixed(2)} />
            <StatBar label="Avg GPM" a={data.a.avg_gpm} b={data.b.avg_gpm} format={v => Math.round(v)} />
            <StatBar label="Avg XPM" a={data.a.avg_xpm} b={data.b.avg_xpm} format={v => Math.round(v)} />
            <StatBar label="Avg Hero Dmg" a={data.a.avg_hero_damage} b={data.b.avg_hero_damage} format={v => Math.round(v).toLocaleString()} />
            <StatBar label="Avg Dmg Taken" a={data.a.avg_damage_taken} b={data.b.avg_damage_taken} higherBetter={false} format={v => Math.round(v).toLocaleString()} />
            <StatBar label="Avg Camps Stacked" a={data.a.avg_camps_stacked} b={data.b.avg_camps_stacked} />
            <StatBar label="Hero Pool" a={data.a.unique_heroes} b={data.b.unique_heroes} format={v => Math.round(v)} />
          </div>
        </div>
      )}
    </div>
  );
}

function HeadToHeadTab({ players, seasonId }) {
  const [playerA, setPlayerA] = useState('');
  const [playerB, setPlayerB] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const nameFor = (id) => {
    const p = players.find(x => x.account_id?.toString() === id?.toString());
    return p?.nickname || p?.persona_name || p?.player_key || id;
  };

  const aName = nameFor(playerA);
  const bName = nameFor(playerB);

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

  return (
    <div>
      <PlayerSelectors
        players={players}
        playerA={playerA} setPlayerA={setPlayerA}
        playerB={playerB} setPlayerB={setPlayerB}
        onSearch={search} loading={loading} buttonLabel="Find Matches"
      />
      {error && <div className="error-state" style={{ marginTop: '1rem' }}>{error}</div>}

      {data && (
        <div style={{ marginTop: '1.5rem' }}>
          {data.total === 0 ? (
            <div className="empty-state"><p>No matches found where {aName} and {bName} faced each other.</p></div>
          ) : (
            <>
              <div className="stats-grid" style={{ gridTemplateColumns: '1fr auto 1fr', marginBottom: '1.5rem' }}>
                <div className="stat-card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 8 }}>{aName}</div>
                  <div style={{
                    fontSize: 56, fontWeight: 700,
                    color: data.a_wins > data.b_wins ? '#4ade80' : data.a_wins < data.b_wins ? '#f87171' : 'var(--text-primary)',
                  }}>{data.a_wins}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>wins</div>
                </div>
                <div className="stat-card" style={{ textAlign: 'center', padding: '1rem 1.5rem' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Total</div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{data.total}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>matches</div>
                </div>
                <div className="stat-card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 8 }}>{bName}</div>
                  <div style={{
                    fontSize: 56, fontWeight: 700,
                    color: data.b_wins > data.a_wins ? '#4ade80' : data.b_wins < data.a_wins ? '#f87171' : 'var(--text-primary)',
                  }}>{data.b_wins}</div>
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
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {m.date ? new Date(m.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' }) : '—'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {aImg && <img src={aImg} alt="" style={{ width: 24, height: 24, borderRadius: 4 }} />}
                              <span style={{ fontSize: 12 }}>{getHeroName(m.a_hero_id) || m.a_hero || '—'}</span>
                            </div>
                          </td>
                          <td style={{ fontSize: 13 }}>{m.a_kills}/{m.a_deaths}/{m.a_assists} ({aKda})</td>
                          <td style={{ fontSize: 13 }}>{m.a_gpm ? Math.round(m.a_gpm) : '—'}</td>
                          <td>
                            <span style={{ fontWeight: 600, color: aWon ? '#4ade80' : '#f87171' }}>
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

export default function PlayerTools() {
  const location = useLocation();
  const { seasonId } = useSeason();
  const [players, setPlayers] = useState([]);
  const initialTab = location.pathname === '/head-to-head' ? 'h2h' : 'compare';
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    getAllPlayers(null).then(r => setPlayers(r.players || [])).catch(() => {});
  }, []);

  const TABS = [
    { key: 'h2h', label: '⚔️ Head to Head', desc: 'Match history when these two players faced each other' },
    { key: 'compare', label: '📊 Compare Stats', desc: 'Side-by-side stat comparison across the selected season' },
  ];

  return (
    <div>
      <h1 className="page-title">Player Tools</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '9px 20px', cursor: 'pointer', fontSize: 14,
              fontWeight: activeTab === t.key ? 700 : 400,
              background: 'none', border: 'none',
              borderBottom: activeTab === t.key ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: activeTab === t.key ? 'var(--accent-blue)' : 'var(--text-muted)',
              borderRadius: 0, marginBottom: -1, transition: 'color 0.2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
        {TABS.find(t => t.key === activeTab)?.desc}
      </p>

      {activeTab === 'h2h'
        ? <HeadToHeadTab players={players} seasonId={seasonId} />
        : <CompareTab players={players} seasonId={seasonId} />
      }
    </div>
  );
}
