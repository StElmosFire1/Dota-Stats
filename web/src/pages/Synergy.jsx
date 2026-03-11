import React, { useState, useEffect, useRef } from 'react';
import { getSynergyHeatmap } from '../api';

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

export default function Synergy() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    getSynergyHeatmap()
      .then(d => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleMouseEnter = (e, cellData) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      ...cellData,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  if (loading) return <div className="loading">Loading synergy data...</div>;
  if (!data || !data.players || data.players.length === 0) {
    return (
      <div>
        <h1 className="page-title">Player Synergy</h1>
        <p style={{ color: '#888' }}>Not enough match data yet. Play more games together!</p>
      </div>
    );
  }

  const { players, matrix } = data;

  return (
    <div>
      <h1 className="page-title">Player Synergy</h1>
      <p className="page-subtitle">
        Teammate win rate heatmap. Each cell shows the win % when those two players are on the same team.
        Minimum 2 games together to appear. Hover for details.
      </p>

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
                      style={{
                        backgroundColor: getWinRateColor(wr),
                        color: getTextColor(wr),
                      }}
                      onMouseEnter={(e) => handleMouseEnter(e, {
                        playerA: rowPlayer.name,
                        playerB: colPlayer.name,
                        wins: cell.wins,
                        games: cell.games,
                        winRate: wr,
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
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <strong>{tooltip.playerA}</strong> + <strong>{tooltip.playerB}</strong>
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
    </div>
  );
}
