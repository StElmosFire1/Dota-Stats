import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPositionStats, getPlayerPositionProfiles } from '../api';
import { useSeason } from '../context/SeasonContext';

const POSITION_NAMES = {
  1: 'Safe Lane (Pos 1)',
  2: 'Mid Lane (Pos 2)',
  3: 'Off Lane (Pos 3)',
  4: 'Soft Support (Pos 4)',
  5: 'Hard Support (Pos 5)',
};

function formatNum(v) {
  const n = parseInt(v);
  if (isNaN(n)) return '-';
  if (n === 0) return '0';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return n.toLocaleString();
}

function PositionStatsView() {
  const { seasonId } = useSeason();
  const [position, setPosition] = useState(1);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('win_rate');
  const [sortDir, setSortDir] = useState(-1);
  const [minGames, setMinGames] = useState(1);

  useEffect(() => {
    setLoading(true);
    getPositionStats(position, minGames, seasonId)
      .then(data => setStats(data.stats || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [position, minGames, seasonId]);

  const sorted = [...stats].sort((a, b) => {
    let va = a[sortField], vb = b[sortField];
    if (sortField === 'win_rate') {
      va = a.games > 0 ? a.wins / a.games : 0;
      vb = b.games > 0 ? b.wins / b.games : 0;
    }
    if (sortField === 'lane_win_rate') {
      va = a.lane_games > 0 ? a.lane_wins / a.lane_games : 0;
      vb = b.lane_games > 0 ? b.lane_wins / b.lane_games : 0;
    }
    if (sortField === 'player_key' || sortField === 'persona_name') {
      return String(va || '').localeCompare(String(vb || '')) * sortDir;
    }
    return (parseFloat(va) - parseFloat(vb)) * sortDir;
  });

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => -d);
    else { setSortField(field); setSortDir(-1); }
  };

  const si = (field) => sortField === field ? (sortDir > 0 ? ' \u25B2' : ' \u25BC') : '';

  const playerLink = (row) => {
    const id = row.account_id > 0 ? row.account_id : encodeURIComponent(row.player_key);
    return `/player/${id}`;
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5].map(p => (
          <button
            key={p}
            onClick={() => setPosition(p)}
            style={{
              padding: '0.5rem 1rem',
              background: position === p ? '#3b82f6' : '#1e293b',
              color: '#fff',
              border: position === p ? '1px solid #60a5fa' : '1px solid #334155',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Pos {p}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <p style={{ color: '#888', margin: 0 }}>{POSITION_NAMES[position]} - {stats.length} players</p>
        <label style={{ color: '#888', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          Min games:
          <select
            value={minGames}
            onChange={e => setMinGames(parseInt(e.target.value))}
            style={{
              background: '#1e293b', color: '#e0e0e0', border: '1px solid #334155',
              borderRadius: '4px', padding: '0.2rem 0.4rem', fontSize: '0.85rem',
            }}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
          </select>
        </label>
      </div>
      {loading ? <div className="loading">Loading...</div> : (
        <div className="scoreboard-wrapper">
          <table className="scoreboard">
            <thead>
              <tr>
                <th className="col-player" style={{ cursor: 'pointer' }} onClick={() => handleSort('persona_name')} title="Player name">Player{si('persona_name')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('games')} title="Games at this position">Games{si('games')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('wins')} title="Wins">W{si('wins')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('losses')} title="Losses">L{si('losses')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_kills')} title="Average kills">K{si('avg_kills')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_deaths')} title="Average deaths">D{si('avg_deaths')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_assists')} title="Average assists">A{si('avg_assists')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_kill_involvement')} title="Kill Involvement">KI%{si('avg_kill_involvement')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('win_rate')} title="Win percentage">Win%{si('win_rate')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('lane_win_rate')} title="% of lanes won (dominant or slight advantage)">Lane W%{si('lane_win_rate')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_gpm')} title="Average GPM">GPM{si('avg_gpm')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_xpm')} title="Average XPM">XPM{si('avg_xpm')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_hero_damage')} title="Average Hero Damage">Dmg{si('avg_hero_damage')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_damage_taken')} title="Average Damage Taken">Tanked{si('avg_damage_taken')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_support_gold')} title="Average wards placed">Wards{si('avg_support_gold')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_stacks')} title="Average camps stacked">Stacks{si('avg_stacks')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const winRate = row.games > 0 ? ((row.wins / row.games) * 100).toFixed(0) : '0';
                const laneWinRate = row.lane_games > 0 ? ((row.lane_wins / row.lane_games) * 100).toFixed(0) : null;
                const displayName = row.nickname || row.persona_name;
                return (
                  <tr key={i}>
                    <td className="col-player">
                      <Link to={playerLink(row)} style={{ color: '#60a5fa', textDecoration: 'none' }}>{displayName}</Link>
                    </td>
                    <td className="col-stat">{row.games}</td>
                    <td className="col-stat" style={{ color: '#4ade80' }}>{row.wins}</td>
                    <td className="col-stat" style={{ color: '#f87171' }}>{row.losses}</td>
                    <td className="col-stat">{row.avg_kills}</td>
                    <td className="col-stat">{row.avg_deaths}</td>
                    <td className="col-stat">{row.avg_assists}</td>
                    <td className="col-stat">{row.avg_kill_involvement}%</td>
                    <td className="col-stat" style={{ color: parseInt(winRate) >= 50 ? '#4ade80' : '#f87171' }}>{winRate}%</td>
                    <td className="col-stat" style={{ color: laneWinRate == null ? '#666' : parseInt(laneWinRate) >= 50 ? '#4ade80' : '#f87171' }}>
                      {laneWinRate != null ? `${laneWinRate}%` : '—'}
                    </td>
                    <td className="col-stat gpm">{formatNum(row.avg_gpm)}</td>
                    <td className="col-stat">{formatNum(row.avg_xpm)}</td>
                    <td className="col-stat">{formatNum(row.avg_hero_damage)}</td>
                    <td className="col-stat">{formatNum(row.avg_damage_taken)}</td>
                    <td className="col-stat">{formatNum(row.avg_support_gold)}</td>
                    <td className="col-stat">{row.avg_stacks}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PlayerProfilesView() {
  const { seasonId } = useSeason();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    setLoading(true);
    getPlayerPositionProfiles(seasonId)
      .then(data => setPlayers(data.players || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [seasonId]);

  const toggleExpanded = (key) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    const allKeys = {};
    players.forEach(p => { allKeys[p.player_key] = true; });
    setExpanded(allKeys);
  };

  const collapseAll = () => setExpanded({});

  const playerLink = (p) => {
    if (p.account_id > 0) return `/player/${p.account_id}`;
    return `/player/${encodeURIComponent(p.player_key)}`;
  };

  if (loading) return <div className="loading">Loading player profiles...</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={expandAll} className="view-toggle-btn" style={{ background: '#1e293b', color: '#e0e0e0', border: '1px solid #334155', borderRadius: '6px', padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem' }}>
          Expand All
        </button>
        <button onClick={collapseAll} className="view-toggle-btn" style={{ background: '#1e293b', color: '#e0e0e0', border: '1px solid #334155', borderRadius: '6px', padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem' }}>
          Collapse All
        </button>
      </div>
      <p style={{ color: '#888', marginBottom: '1rem' }}>{players.length} players — click a player to see their position breakdown</p>
      <div className="scoreboard-wrapper">
        <table className="scoreboard">
          <thead>
            <tr>
              <th className="col-player">Player</th>
              <th className="col-stat">Position</th>
              <th className="col-stat">Avg K / D / A</th>
              <th className="col-stat">Games</th>
              <th className="col-stat">Win %</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const displayName = p.nickname || p.persona_name;
              const totalWinPct = p.total_games > 0 ? Math.round((p.total_wins / p.total_games) * 100) : 0;
              const isExpanded = expanded[p.player_key];
              return (
                <React.Fragment key={p.player_key}>
                  <tr
                    onClick={() => toggleExpanded(p.player_key)}
                    style={{ cursor: 'pointer', background: isExpanded ? 'rgba(59,130,246,0.1)' : 'transparent' }}
                    className="player-profile-header"
                  >
                    <td className="col-player" style={{ fontWeight: 'bold' }}>
                      <Link to={playerLink(p)} style={{ color: '#60a5fa', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
                        {displayName}
                      </Link>
                    </td>
                    <td className="col-stat" style={{ color: '#888' }}></td>
                    <td className="col-stat" style={{ fontWeight: 'bold' }}>
                      {p.avg_kills} / {p.avg_deaths} / {p.avg_assists}
                    </td>
                    <td className="col-stat" style={{ fontWeight: 'bold' }}>
                      Total Games: {p.total_games}
                    </td>
                    <td className="col-stat" style={{ fontWeight: 'bold', color: totalWinPct >= 50 ? '#4ade80' : '#f87171' }}>
                      Win %: {totalWinPct}%
                    </td>
                  </tr>
                  {isExpanded && p.positions.length > 0 && (
                    <>
                      <tr style={{ background: 'rgba(30,41,59,0.5)' }}>
                        <td className="col-player" style={{ color: '#888', paddingLeft: '2rem', fontSize: '0.8rem' }}></td>
                        <td className="col-stat" style={{ color: '#888', fontSize: '0.8rem' }}>Position</td>
                        <td className="col-stat" style={{ color: '#888', fontSize: '0.8rem' }}>Avg K / D / A</td>
                        <td className="col-stat" style={{ color: '#888', fontSize: '0.8rem' }}>Games</td>
                        <td className="col-stat" style={{ color: '#888', fontSize: '0.8rem' }}>Win %</td>
                      </tr>
                      {p.positions.map((pos) => {
                        const posWinPct = pos.games > 0 ? Math.round((pos.wins / pos.games) * 100) : 0;
                        return (
                          <tr key={pos.position} style={{ background: 'rgba(30,41,59,0.3)' }}>
                            <td className="col-player" style={{ paddingLeft: '2rem' }}></td>
                            <td className="col-stat">{pos.position}</td>
                            <td className="col-stat">
                              {pos.avg_kills} / {pos.avg_deaths} / {pos.avg_assists}
                            </td>
                            <td className="col-stat">{pos.games}</td>
                            <td className="col-stat" style={{ color: posWinPct >= 50 ? '#4ade80' : '#f87171' }}>
                              {posWinPct}%
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                  {isExpanded && p.positions.length === 0 && (
                    <tr style={{ background: 'rgba(30,41,59,0.3)' }}>
                      <td colSpan={5} style={{ color: '#666', paddingLeft: '2rem', fontStyle: 'italic' }}>No position data available</td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PositionStats() {
  const [view, setView] = useState('stats');

  return (
    <div>
      <h1 className="page-title">Position Stats</h1>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setView('stats')}
          style={{
            padding: '0.5rem 1rem',
            background: view === 'stats' ? '#3b82f6' : '#1e293b',
            color: '#fff',
            border: view === 'stats' ? '1px solid #60a5fa' : '1px solid #334155',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          Position Rankings
        </button>
        <button
          onClick={() => setView('profiles')}
          style={{
            padding: '0.5rem 1rem',
            background: view === 'profiles' ? '#3b82f6' : '#1e293b',
            color: '#fff',
            border: view === 'profiles' ? '1px solid #60a5fa' : '1px solid #334155',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          Player Profiles
        </button>
      </div>
      {view === 'stats' ? <PositionStatsView /> : <PlayerProfilesView />}
    </div>
  );
}
