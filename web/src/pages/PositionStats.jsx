import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPositionStats } from '../api';

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

export default function PositionStats() {
  const [position, setPosition] = useState(1);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('win_rate');
  const [sortDir, setSortDir] = useState(-1);

  useEffect(() => {
    setLoading(true);
    getPositionStats(position)
      .then(data => setStats(data.stats || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [position]);

  const sorted = [...stats].sort((a, b) => {
    let va = a[sortField], vb = b[sortField];
    if (sortField === 'win_rate') {
      va = a.games > 0 ? a.wins / a.games : 0;
      vb = b.games > 0 ? b.wins / b.games : 0;
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
      <h1 className="page-title">Position Stats</h1>
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
      <p style={{ color: '#888', marginBottom: '1rem' }}>{POSITION_NAMES[position]} - {stats.length} players (min 3 games)</p>
      {loading ? <div className="loading">Loading...</div> : (
        <div className="scoreboard-wrapper">
          <table className="scoreboard">
            <thead>
              <tr>
                <th className="col-player" style={{ cursor: 'pointer' }} onClick={() => handleSort('persona_name')} title="Player name (click to sort)">Player{si('persona_name')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('games')} title="Total games played at this position">Games{si('games')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('wins')} title="Wins">W{si('wins')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('losses')} title="Losses">L{si('losses')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_kills')} title="Average kills per game">K{si('avg_kills')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_deaths')} title="Average deaths per game">D{si('avg_deaths')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_assists')} title="Average assists per game">A{si('avg_assists')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_kill_involvement')} title="Kill Involvement — percentage of team kills you participated in (kills + assists)">KI%{si('avg_kill_involvement')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('win_rate')} title="Win percentage">Win%{si('win_rate')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_gpm')} title="Average Gold Per Minute">GPM{si('avg_gpm')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_xpm')} title="Average Experience Per Minute">XPM{si('avg_xpm')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_hero_damage')} title="Average Hero Damage dealt per game">Dmg{si('avg_hero_damage')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_damage_taken')} title="Average Damage Taken per game">Tanked{si('avg_damage_taken')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_support_gold')} title="Average wards placed per game (Observer + Sentry)">Wards{si('avg_support_gold')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_stacks')} title="Average camps stacked per game">Stacks{si('avg_stacks')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const winRate = row.games > 0 ? ((row.wins / row.games) * 100).toFixed(0) : '0';
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
