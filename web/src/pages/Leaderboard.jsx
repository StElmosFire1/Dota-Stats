import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getLeaderboard } from '../api';

function StreakBadge({ streak }) {
  if (!streak || Math.abs(streak) < 2) return null;
  const isWin = streak > 0;
  return (
    <span
      title={`${Math.abs(streak)}-game ${isWin ? 'win' : 'loss'} streak`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2,
        background: isWin ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)',
        border: `1px solid ${isWin ? 'rgba(76,175,80,0.4)' : 'rgba(244,67,54,0.4)'}`,
        color: isWin ? 'var(--accent-green)' : 'var(--accent-red)',
        borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700,
        marginLeft: 6, verticalAlign: 'middle',
      }}
    >
      {isWin ? '🔥' : '💀'}{Math.abs(streak)}
    </span>
  );
}

export default function Leaderboard() {
  const [data, setData] = useState({ leaderboard: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLeaderboard(100)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading leaderboard...</div>;

  return (
    <div>
      <h1 className="page-title">Leaderboard</h1>
      {data.leaderboard.length === 0 ? (
        <div className="empty-state">
          <p>No ratings yet. Play some matches to populate the leaderboard!</p>
        </div>
      ) : (
        <div className="scoreboard-wrapper">
          <table className="scoreboard leaderboard-table">
            <thead>
              <tr>
                <th className="col-rank" title="Rank">#</th>
                <th className="col-player" title="Player name">Player</th>
                <th className="col-stat" title="TrueSkill MMR rating">MMR</th>
                <th className="col-stat" title="Wins">W</th>
                <th className="col-stat" title="Losses">L</th>
                <th className="col-stat" title="Total games played">Games</th>
                <th className="col-stat" title="Win percentage">Win %</th>
                <th className="col-stat" title="Current win or loss streak">Streak</th>
              </tr>
            </thead>
            <tbody>
              {data.leaderboard.map((p, i) => {
                const winRate = p.games_played > 0
                  ? ((p.wins / p.games_played) * 100).toFixed(1)
                  : '0.0';
                return (
                  <tr key={p.player_id} className={i < 3 ? `rank-${i + 1}` : ''}>
                    <td className="col-rank">{i + 1}</td>
                    <td className="col-player">
                      <Link to={`/player/${p.player_id}`} className="player-link">
                        {p.nickname || p.display_name || p.player_id}
                      </Link>
                    </td>
                    <td className="col-stat mmr">{p.mmr}</td>
                    <td className="col-stat wins">{p.wins}</td>
                    <td className="col-stat losses">{p.losses}</td>
                    <td className="col-stat">{p.games_played}</td>
                    <td className="col-stat">{winRate}%</td>
                    <td className="col-stat">
                      {p.streak && Math.abs(p.streak) >= 2
                        ? <StreakBadge streak={p.streak} />
                        : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                    </td>
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
