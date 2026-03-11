import React, { useState, useEffect } from 'react';
import { getHeroStats } from '../api';
import { getHeroName } from '../heroNames';

export default function Heroes() {
  const [heroes, setHeroes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('games');
  const [sortDir, setSortDir] = useState(-1);

  useEffect(() => {
    getHeroStats()
      .then(data => setHeroes(data.heroes || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const sorted = [...heroes].sort((a, b) => {
    let va = a[sortField], vb = b[sortField];
    if (sortField === 'win_rate') {
      va = a.games > 0 ? a.wins / a.games : 0;
      vb = b.games > 0 ? b.wins / b.games : 0;
    }
    return (parseFloat(va) - parseFloat(vb)) * sortDir;
  });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => -d);
    } else {
      setSortField(field);
      setSortDir(-1);
    }
  };

  const sortIcon = (field) => {
    if (sortField !== field && field !== 'win_rate') return '';
    if (sortField === field) return sortDir > 0 ? ' \u25B2' : ' \u25BC';
    return '';
  };

  if (loading) return <div className="loading">Loading hero stats...</div>;

  return (
    <div>
      <h1 className="page-title">Hero Stats</h1>
      <p style={{ color: '#888', marginBottom: '1rem' }}>{heroes.length} heroes played across all matches</p>
      <div className="scoreboard-wrapper">
        <table className="scoreboard">
          <thead>
            <tr>
              <th className="col-player" style={{ cursor: 'pointer' }} onClick={() => handleSort('hero_id')}>
                Hero{sortIcon('hero_id')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('games')}>
                Games{sortIcon('games')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('win_rate')}>
                Win %{sortIcon('win_rate')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_kills')}>
                K{sortIcon('avg_kills')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_deaths')}>
                D{sortIcon('avg_deaths')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_assists')}>
                A{sortIcon('avg_assists')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_gpm')}>
                GPM{sortIcon('avg_gpm')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_hero_damage')}>
                HD{sortIcon('avg_hero_damage')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_tower_damage')}>
                TD{sortIcon('avg_tower_damage')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_hero_healing')}>
                HH{sortIcon('avg_hero_healing')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h, i) => {
              const winRate = h.games > 0 ? ((h.wins / h.games) * 100).toFixed(0) : '0';
              return (
                <tr key={i}>
                  <td className="col-player">{getHeroName(h.hero_id, h.hero_name)}</td>
                  <td className="col-stat">{h.games}</td>
                  <td className="col-stat" style={{ color: parseInt(winRate) >= 50 ? '#4ade80' : '#f87171' }}>
                    {winRate}%
                  </td>
                  <td className="col-stat">{h.avg_kills}</td>
                  <td className="col-stat">{h.avg_deaths}</td>
                  <td className="col-stat">{h.avg_assists}</td>
                  <td className="col-stat gpm">{parseInt(h.avg_gpm).toLocaleString()}</td>
                  <td className="col-stat">{parseInt(h.avg_hero_damage).toLocaleString()}</td>
                  <td className="col-stat">{parseInt(h.avg_tower_damage).toLocaleString()}</td>
                  <td className="col-stat">{parseInt(h.avg_hero_healing).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
