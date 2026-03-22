import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getLeaderboard } from '../api';
import { useSeason } from '../context/SeasonContext';

const MMR_TIERS = [
  { name: 'Gaben',         emoji: '🎩', description: "A personal friend of the man himself.",                                       min: 2750 },
  { name: 'Prime Pick',    emoji: '🎯', description: "Everyone wants you on their team.",                                           min: 2600 },
  { name: 'Apex',          emoji: '⚡', description: "Operating at peak Dota capacity.",                                            min: 2490 },
  { name: 'Veteran',       emoji: '🎖️', description: "Seen things. Done things. Knows things.",                                    min: 2400 },
  { name: 'Solid',         emoji: '💪', description: "Reliable. People can actually count on you.",                                 min: 2325 },
  { name: 'Average',       emoji: '😐', description: "Not bad. Not good. Just... there.",                                           min: 2255 },
  { name: 'NPC',           emoji: '🤖', description: "Standing in the trees doing nothing.",                                        min: 2190 },
  { name: 'Anchor',        emoji: '⚓', description: "Dragging your team straight to the bottom.",                                  min: 2130 },
  { name: 'Neutral Creep', emoji: '🐗', description: "You exist. The jungle thanks you for feeding it.",                            min: 2075 },
  { name: 'Observer Ward', emoji: '👁️', description: "Placed. Ignored. Immediately dewarded.",                                     min: 2025 },
  { name: 'Position 6',    emoji: '🗺️', description: "The position that doesn't exist — neither do your contributions.",           min: 0    },
];

function getTier(mmr) {
  for (const t of MMR_TIERS) {
    if (mmr >= t.min) return t;
  }
  return MMR_TIERS[MMR_TIERS.length - 1];
}

function TierBadge({ mmr }) {
  const t = getTier(mmr);
  if (!t) return null;
  return (
    <span
      title={t.description}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: 'var(--bg-hover)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 600,
        color: 'var(--text-secondary)', whiteSpace: 'nowrap', cursor: 'default',
      }}
    >
      {t.emoji} {t.name}
    </span>
  );
}

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
        marginLeft: 4, verticalAlign: 'middle',
      }}
    >
      {isWin ? '🔥' : '💀'}{Math.abs(streak)}
    </span>
  );
}

export default function Leaderboard() {
  const { seasonId } = useSeason();
  const [data, setData] = useState({ leaderboard: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getLeaderboard(100, seasonId)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [seasonId]);

  if (loading) return <div className="loading">Loading leaderboard...</div>;

  return (
    <div>
      <h1 className="page-title">Leaderboard</h1>

      {/* Tier legend — worst to best left to right */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20,
        padding: '12px 16px', background: 'var(--bg-card)',
        border: '1px solid var(--border)', borderRadius: 10,
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4, whiteSpace: 'nowrap' }}>worst →</span>
        {[...MMR_TIERS].reverse().map((t, i) => (
          <span
            key={t.name}
            title={t.description}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'var(--bg-hover)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '3px 9px', fontSize: 11, fontWeight: 600,
              color: 'var(--text-secondary)', cursor: 'default', whiteSpace: 'nowrap',
            }}
          >
            {t.emoji} {t.name}
          </span>
        ))}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4, whiteSpace: 'nowrap' }}>→ best</span>
      </div>

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
                <th className="col-stat" title="Tier">Tier</th>
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
                    <td className="col-stat"><TierBadge mmr={p.mmr} /></td>
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
