import React, { useState, useEffect } from 'react';
import SortableTh from '../components/SortableTh';
import { Link } from 'react-router-dom';
import { getOverallStats } from '../api';
import { useSeason } from '../context/SeasonContext';

const POS_SHORT = { 1: 'Pos 1', 2: 'Pos 2', 3: 'Pos 3', 4: 'Pos 4', 5: 'Pos 5' };

export default function OverallStats() {
  const { seasonId } = useSeason();
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('games');
  const [sortDir, setSortDir] = useState(-1);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    getOverallStats(seasonId)
      .then(data => setStats(data.stats || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [seasonId]);

  const sorted = [...stats].sort((a, b) => {
    let va = a[sortField], vb = b[sortField];
    if (sortField === 'win_rate') {
      va = a.games > 0 ? a.wins / a.games : 0;
      vb = b.games > 0 ? b.wins / b.games : 0;
    }
    if (sortField === 'captain_win_rate') {
      va = a.captain_games > 0 ? a.captain_wins / a.captain_games : -1;
      vb = b.captain_games > 0 ? b.captain_wins / b.captain_games : -1;
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

  if (loading) return <div className="loading">Loading stats...</div>;

  const filtered = search.trim()
    ? sorted.filter(r => {
        const q = search.trim().toLowerCase();
        return (r.nickname || '').toLowerCase().includes(q) || (r.persona_name || '').toLowerCase().includes(q);
      })
    : sorted;

  return (
    <div>
      <h1 className="page-title">Overall Player Stats</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
        <p style={{ color: '#888', margin: 0 }}>{stats.length} players</p>
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, width: 200 }}
        />
      </div>
      <div className="scoreboard-wrapper">
        <table className="scoreboard">
          <thead>
            <tr>
              <SortableTh className="col-player" title="Player name (click to sort)" active={sortField === 'persona_name'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('persona_name')}>Player{si('persona_name')}</SortableTh>
              <SortableTh className="col-stat" title="Total games played" active={sortField === 'games'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('games')}>Games{si('games')}</SortableTh>
              <SortableTh className="col-stat" title="Wins" active={sortField === 'wins'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('wins')}>W{si('wins')}</SortableTh>
              <SortableTh className="col-stat" title="Losses" active={sortField === 'losses'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('losses')}>L{si('losses')}</SortableTh>
              <SortableTh className="col-stat" title="Average kills per game" active={sortField === 'avg_kills'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_kills')}>K{si('avg_kills')}</SortableTh>
              <SortableTh className="col-stat" title="Average deaths per game" active={sortField === 'avg_deaths'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_deaths')}>D{si('avg_deaths')}</SortableTh>
              <SortableTh className="col-stat" title="Average assists per game" active={sortField === 'avg_assists'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_assists')}>A{si('avg_assists')}</SortableTh>
              <SortableTh className="col-stat" title="Win percentage" active={sortField === 'win_rate'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('win_rate')}>Win%{si('win_rate')}</SortableTh>
              <SortableTh className="col-stat" title="Kill Involvement — percentage of team kills you participated in (kills + assists)" active={sortField === 'avg_kill_involvement'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_kill_involvement')}>KI%{si('avg_kill_involvement')}</SortableTh>
              <SortableTh className="col-stat" title="Captain win rate — win percentage when this player was captain" active={sortField === 'captain_win_rate'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('captain_win_rate')}>Capt%{si('captain_win_rate')}</SortableTh>
              <th className="col-stat" title="Best position by composite score: win rate + KDA + kill involvement">Best Pos</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const winRate = row.games > 0 ? ((row.wins / row.games) * 100).toFixed(0) : '0';
              const captRate = row.captain_games > 0 ? ((row.captain_wins / row.captain_games) * 100).toFixed(0) : '-';
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
                  <td className="col-stat" style={{ color: parseInt(winRate) >= 50 ? '#4ade80' : '#f87171' }}>{winRate}%</td>
                  <td className="col-stat">{row.avg_kill_involvement}%</td>
                  <td
                    className="col-stat"
                    title={row.captain_games > 0 ? `${row.captain_wins}W / ${row.captain_games - row.captain_wins}L as captain` : 'No captain games'}
                  >
                    {captRate === '-' ? '-' : `${captRate}% (${row.captain_games}g)`}
                  </td>
                  <td className="col-stat">
                    {row.best_position ? (
                      <>
                        {POS_SHORT[row.best_position]}
                        {row.best_position_score != null && (
                          <span style={{ color: '#4ade80', fontSize: '0.8em', marginLeft: 4 }}>({row.best_position_score})</span>
                        )}
                      </>
                    ) : '—'}
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
