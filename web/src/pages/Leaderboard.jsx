import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getLeaderboard } from '../api';

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
                <th className="col-rank">#</th>
                <th className="col-player">Player</th>
                <th className="col-stat">MMR</th>
                <th className="col-stat">W</th>
                <th className="col-stat">L</th>
                <th className="col-stat">Games</th>
                <th className="col-stat">Win %</th>
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
