import React, { useState, useEffect } from 'react';
import SortableTh from '../components/SortableTh';
import { Link } from 'react-router-dom';
import { getPositionStats, getPlayerPositionProfiles } from '../api';
import { useSeason } from '../context/SeasonContext';
import PaywallBlur from '../components/PaywallBlur';

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
            className={position === p ? 'btn btn-primary' : 'btn'}
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
                <SortableTh className="col-player" title="Player name" active={sortField === 'persona_name'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('persona_name')}>Player{si('persona_name')}</SortableTh>
                <SortableTh className="col-stat" title="Games at this position" active={sortField === 'games'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('games')}>Games{si('games')}</SortableTh>
                <SortableTh className="col-stat" title="Wins" active={sortField === 'wins'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('wins')}>W{si('wins')}</SortableTh>
                <SortableTh className="col-stat" title="Losses" active={sortField === 'losses'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('losses')}>L{si('losses')}</SortableTh>
                <SortableTh className="col-stat" title="Average kills" active={sortField === 'avg_kills'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_kills')}>K{si('avg_kills')}</SortableTh>
                <SortableTh className="col-stat" title="Average deaths" active={sortField === 'avg_deaths'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_deaths')}>D{si('avg_deaths')}</SortableTh>
                <SortableTh className="col-stat" title="Average assists" active={sortField === 'avg_assists'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_assists')}>A{si('avg_assists')}</SortableTh>
                <SortableTh className="col-stat" title="Kill Involvement" active={sortField === 'avg_kill_involvement'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_kill_involvement')}>KI%{si('avg_kill_involvement')}</SortableTh>
                <SortableTh className="col-stat" title="Win percentage" active={sortField === 'win_rate'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('win_rate')}>Win%{si('win_rate')}</SortableTh>
                <SortableTh className="col-stat" title="% of lanes won (dominant or slight advantage)" active={sortField === 'lane_win_rate'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('lane_win_rate')}>Lane W%{si('lane_win_rate')}</SortableTh>
                <SortableTh className="col-stat" title="Average GPM" active={sortField === 'avg_gpm'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_gpm')}>GPM{si('avg_gpm')}</SortableTh>
                <SortableTh className="col-stat" title="Average XPM" active={sortField === 'avg_xpm'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_xpm')}>XPM{si('avg_xpm')}</SortableTh>
                <SortableTh className="col-stat" title="Average Hero Damage" active={sortField === 'avg_hero_damage'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_hero_damage')}>Dmg{si('avg_hero_damage')}</SortableTh>
                <SortableTh className="col-stat" title="Average Damage Taken" active={sortField === 'avg_damage_taken'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_damage_taken')}>Tanked{si('avg_damage_taken')}</SortableTh>
                <SortableTh className="col-stat" title="Average wards placed" active={sortField === 'avg_support_gold'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_support_gold')}>Wards{si('avg_support_gold')}</SortableTh>
                <SortableTh className="col-stat" title="Average camps stacked" active={sortField === 'avg_stacks'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_stacks')}>Stacks{si('avg_stacks')}</SortableTh>
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
        <button onClick={expandAll} className="btn btn-sm">Expand All</button>
        <button onClick={collapseAll} className="btn btn-sm">Collapse All</button>
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
                    onClick={(e) => { if (e.target.closest('a,button')) return; toggleExpanded(p.player_key); }}
                    onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); toggleExpanded(p.player_key); } }}
                    role="button"
                    tabIndex={0}
                    aria-expanded={!!isExpanded}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${p.nickname || p.persona_name} stats`}
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

export default function PositionStats({ defaultTab = 'stats' }) {
  // `defaultTab` accepts 'stats' (Position Rankings) or 'profiles' (Pro-gated Player Profiles).
  const [view, setView] = useState(defaultTab === 'players' || defaultTab === 'profiles' ? 'profiles' : 'stats');

  return (
    <div>
      <h1 className="page-title">Position Stats</h1>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setView('stats')}
          className={view === 'stats' ? 'btn btn-primary' : 'btn'}
        >
          Position Rankings
        </button>
        <button
          onClick={() => setView('profiles')}
          className={view === 'profiles' ? 'btn btn-primary' : 'btn'}
        >
          Player Profiles
        </button>
      </div>
      {view === 'stats' ? (
        <PositionStatsView />
      ) : (
        <PaywallBlur feature="player_profiles" minHeight={520}>
          <PlayerProfilesView />
        </PaywallBlur>
      )}
    </div>
  );
}
