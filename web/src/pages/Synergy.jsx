import React, { useState, useEffect } from 'react';
import { getSynergy } from '../api';

export default function Synergy() {
  const [data, setData] = useState({ teammate: [], opponent: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('teammate');
  const [sortField, setSortField] = useState('games');
  const [sortDir, setSortDir] = useState(-1);

  useEffect(() => {
    getSynergy()
      .then(d => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => -d);
    else { setSortField(field); setSortDir(-1); }
  };

  const si = (field) => sortField === field ? (sortDir > 0 ? ' \u25B2' : ' \u25BC') : '';

  if (loading) return <div className="loading">Loading synergy data...</div>;

  const items = tab === 'teammate' ? data.teammate : data.opponent;

  const sorted = [...items].sort((a, b) => {
    let va, vb;
    if (sortField === 'win_rate') {
      va = a.games > 0 ? a.wins / a.games : 0;
      vb = b.games > 0 ? b.wins / b.games : 0;
    } else if (sortField === 'win_rate_a') {
      va = a.games > 0 ? a.winsA / a.games : 0;
      vb = b.games > 0 ? b.winsA / b.games : 0;
    } else {
      va = a[sortField];
      vb = b[sortField];
    }
    if (sortField === 'playerA' || sortField === 'playerB') {
      return String(va || '').localeCompare(String(vb || '')) * sortDir;
    }
    return (parseFloat(va) - parseFloat(vb)) * sortDir;
  });

  return (
    <div>
      <h1 className="page-title">Player Synergy</h1>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          onClick={() => { setTab('teammate'); setSortField('games'); }}
          style={{
            padding: '0.5rem 1rem',
            background: tab === 'teammate' ? '#3b82f6' : '#1e293b',
            color: '#fff',
            border: tab === 'teammate' ? '1px solid #60a5fa' : '1px solid #334155',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Win % WITH Teammate
        </button>
        <button
          onClick={() => { setTab('opponent'); setSortField('games'); }}
          style={{
            padding: '0.5rem 1rem',
            background: tab === 'opponent' ? '#3b82f6' : '#1e293b',
            color: '#fff',
            border: tab === 'opponent' ? '1px solid #60a5fa' : '1px solid #334155',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Win % VS Opponent
        </button>
      </div>
      <p style={{ color: '#888', marginBottom: '1rem' }}>{items.length} pairings (min 3 games together)</p>

      <div className="scoreboard-wrapper">
        <table className="scoreboard">
          <thead>
            {tab === 'teammate' ? (
              <tr>
                <th className="col-player" style={{ cursor: 'pointer' }} onClick={() => handleSort('playerA')}>Player A{si('playerA')}</th>
                <th className="col-player" style={{ cursor: 'pointer' }} onClick={() => handleSort('playerB')}>Player B{si('playerB')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('games')}>Games{si('games')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('wins')}>Wins{si('wins')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('win_rate')}>Win%{si('win_rate')}</th>
              </tr>
            ) : (
              <tr>
                <th className="col-player" style={{ cursor: 'pointer' }} onClick={() => handleSort('playerA')}>Player A{si('playerA')}</th>
                <th className="col-player" style={{ cursor: 'pointer' }} onClick={() => handleSort('playerB')}>Player B{si('playerB')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('games')}>Games{si('games')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('win_rate_a')}>A Win%{si('win_rate_a')}</th>
                <th className="col-stat">B Win%</th>
              </tr>
            )}
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              if (tab === 'teammate') {
                const wr = row.games > 0 ? ((row.wins / row.games) * 100).toFixed(0) : '0';
                return (
                  <tr key={i}>
                    <td className="col-player">{row.playerA}</td>
                    <td className="col-player">{row.playerB}</td>
                    <td className="col-stat">{row.games}</td>
                    <td className="col-stat" style={{ color: '#4ade80' }}>{row.wins}</td>
                    <td className="col-stat" style={{ color: parseInt(wr) >= 50 ? '#4ade80' : '#f87171' }}>{wr}%</td>
                  </tr>
                );
              } else {
                const wrA = row.games > 0 ? ((row.winsA / row.games) * 100).toFixed(0) : '0';
                const wrB = row.games > 0 ? ((row.winsB / row.games) * 100).toFixed(0) : '0';
                return (
                  <tr key={i}>
                    <td className="col-player">{row.playerA}</td>
                    <td className="col-player">{row.playerB}</td>
                    <td className="col-stat">{row.games}</td>
                    <td className="col-stat" style={{ color: parseInt(wrA) >= 50 ? '#4ade80' : '#f87171' }}>{wrA}%</td>
                    <td className="col-stat" style={{ color: parseInt(wrB) >= 50 ? '#4ade80' : '#f87171' }}>{wrB}%</td>
                  </tr>
                );
              }
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
