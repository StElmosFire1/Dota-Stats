import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getOverallStats } from '../api';

export default function OverallStats() {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('games');
  const [sortDir, setSortDir] = useState(-1);

  useEffect(() => {
    getOverallStats()
      .then(data => setStats(data.stats || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div>
      <h1 className="page-title">Overall Player Stats</h1>
      <p style={{ color: '#888', marginBottom: '1rem' }}>{stats.length} players</p>
      <div className="scoreboard-wrapper">
        <table className="scoreboard">
          <thead>
            <tr>
              <th className="col-player" style={{ cursor: 'pointer' }} onClick={() => handleSort('persona_name')} title="Player name (click to sort)">Player{si('persona_name')}</th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('games')} title="Total games played">Games{si('games')}</th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('wins')} title="Wins">W{si('wins')}</th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('losses')} title="Losses">L{si('losses')}</th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_kills')} title="Average kills per game">K{si('avg_kills')}</th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_deaths')} title="Average deaths per game">D{si('avg_deaths')}</th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_assists')} title="Average assists per game">A{si('avg_assists')}</th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('win_rate')} title="Win percentage">Win%{si('win_rate')}</th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_kill_involvement')} title="Kill Involvement — percentage of team kills you participated in (kills + assists)">KI%{si('avg_kill_involvement')}</th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('captain_win_rate')} title="Captain win rate — win percentage when this player was captain">Capt%{si('captain_win_rate')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
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
                  <td className="col-stat">{captRate === '-' ? '-' : `${captRate}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
