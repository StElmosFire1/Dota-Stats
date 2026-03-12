import React, { useState, useEffect, useRef } from 'react';
import { getSynergyHeatmap, getEnemySynergyHeatmap } from '../api';
import { useSeason } from '../context/SeasonContext';

function getWinRateColor(winRate) {
  if (winRate == null) return 'transparent';
  if (winRate >= 75) return '#1a7a1a';
  if (winRate >= 60) return '#4caf50';
  if (winRate >= 55) return '#8bc34a';
  if (winRate >= 50) return '#cddc39';
  if (winRate >= 45) return '#ffeb3b';
  if (winRate >= 40) return '#ff9800';
  if (winRate >= 25) return '#f44336';
  return '#b71c1c';
}

function getTextColor(winRate) {
  if (winRate == null) return '#666';
  if (winRate >= 60 || winRate < 30) return '#fff';
  return '#000';
}

function Heatmap({ data, mode, tooltip, setTooltip }) {
  const tooltipRef = useRef(null);

  const handleMouseEnter = (e, cellData) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ ...cellData, x: rect.left + rect.width / 2, y: rect.top - 8 });
  };

  const handleMouseLeave = () => setTooltip(null);

  if (!data || !data.players || data.players.length === 0) {
    return <p style={{ color: '#888' }}>Not enough match data yet. Play more games together!</p>;
  }

  const { players, matrix } = data;

  return (
    <>
      <div className="heatmap-container">
        <table className="heatmap-table">
          <thead>
            <tr>
              <th className="heatmap-corner"></th>
              {players.map((p, i) => (
                <th key={i} className="heatmap-col-header">
                  <div className="heatmap-col-label">{p.name}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((rowPlayer, ri) => (
              <tr key={ri}>
                <td className="heatmap-row-header">{rowPlayer.name}</td>
                {players.map((colPlayer, ci) => {
                  if (ri === ci) {
                    return <td key={ci} className="heatmap-cell diagonal"></td>;
                  }
                  const cell = matrix[rowPlayer.key]?.[colPlayer.key];
                  if (!cell) {
                    return <td key={ci} className="heatmap-cell empty"></td>;
                  }
                  const wr = Math.round((cell.wins / cell.games) * 100);
                  return (
                    <td
                      key={ci}
                      className="heatmap-cell"
                      style={{ backgroundColor: getWinRateColor(wr), color: getTextColor(wr) }}
                      onMouseEnter={(e) => handleMouseEnter(e, {
                        playerA: rowPlayer.name,
                        playerB: colPlayer.name,
                        wins: cell.wins,
                        games: cell.games,
                        winRate: wr,
                        mode,
                      })}
                      onMouseLeave={handleMouseLeave}
                    >
                      {wr}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tooltip && (
        <div
          ref={tooltipRef}
          className="synergy-floating-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <strong>{tooltip.playerA}</strong> {tooltip.mode === 'enemies' ? 'vs' : '+'} <strong>{tooltip.playerB}</strong>
          <br />
          {tooltip.wins}W / {tooltip.games}G — {tooltip.winRate}% win rate
        </div>
      )}

      <div className="heatmap-legend">
        <span className="legend-label">Low</span>
        <div className="legend-bar">
          <div style={{ background: '#b71c1c' }}></div>
          <div style={{ background: '#f44336' }}></div>
          <div style={{ background: '#ff9800' }}></div>
          <div style={{ background: '#ffeb3b' }}></div>
          <div style={{ background: '#cddc39' }}></div>
          <div style={{ background: '#8bc34a' }}></div>
          <div style={{ background: '#4caf50' }}></div>
          <div style={{ background: '#1a7a1a' }}></div>
        </div>
        <span className="legend-label">High</span>
      </div>
    </>
  );
}

export default function Synergy() {
  const { seasonId } = useSeason();
  const [mode, setMode] = useState('teammates');
  const [teammateData, setTeammateData] = useState(null);
  const [enemyData, setEnemyData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    setLoading(true);
    setTeammateData(null);
    setEnemyData(null);
    Promise.all([
      getSynergyHeatmap(seasonId),
      getEnemySynergyHeatmap(seasonId),
    ])
      .then(([tm, en]) => {
        setTeammateData(tm);
        setEnemyData(en);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [seasonId]);

  if (loading) return <div className="loading">Loading synergy data...</div>;

  const tabStyle = (active) => ({
    padding: '0.4rem 1.2rem',
    borderRadius: '4px',
    border: active ? '1px solid #3b82f6' : '1px solid #444',
    background: active ? '#1e3a5f' : 'transparent',
    color: active ? '#93c5fd' : '#888',
    cursor: 'pointer',
    fontSize: '0.9rem',
  });

  const subtitle = mode === 'teammates'
    ? 'Teammate win rate heatmap. Each cell shows the win % when those two players are on the same team. Minimum 2 games together to appear. Hover for details.'
    : 'Enemy win rate heatmap. Each cell shows the win % of the row player when facing the column player as an opponent. Minimum 2 games facing each other to appear. Hover for details.';

  return (
    <div>
      <h1 className="page-title">Player Synergy</h1>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button style={tabStyle(mode === 'teammates')} onClick={() => setMode('teammates')}>
          Teammates
        </button>
        <button style={tabStyle(mode === 'enemies')} onClick={() => setMode('enemies')}>
          Enemies
        </button>
      </div>

      <p className="page-subtitle">{subtitle}</p>

      <Heatmap
        data={mode === 'teammates' ? teammateData : enemyData}
        mode={mode}
        tooltip={tooltip}
        setTooltip={setTooltip}
      />
    </div>
  );
}
