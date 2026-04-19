import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getLeaderboard, getMostImproved, getPlayerForm, getBestAndFairest, getPlayerRanks } from '../api';
import { useSeason } from '../context/SeasonContext';
import ImpactBadge from '../components/ImpactBadge';
import { decodeRankTier } from '../components/RankBadge';

const MMR_TIERS = [
  { name: 'Gaben',         emoji: '🎩', description: "A personal friend of the man himself.",                                       min: 4100 },
  { name: 'Prime Pick',    emoji: '🎯', description: "Everyone wants you on their team.",                                           min: 3800 },
  { name: 'Apex',          emoji: '⚡', description: "Operating at peak Dota capacity.",                                            min: 3500 },
  { name: 'Veteran',       emoji: '🎖️', description: "Seen things. Done things. Knows things.",                                    min: 3200 },
  { name: 'Solid',         emoji: '💪', description: "Reliable. People can actually count on you.",                                 min: 2900 },
  { name: 'Average',       emoji: '😐', description: "Not bad. Not good. Just... there.",                                           min: 2600 },
  { name: 'NPC',           emoji: '🤖', description: "Standing in the trees doing nothing.",                                        min: 2300 },
  { name: 'Anchor',        emoji: '⚓', description: "Dragging your team straight to the bottom.",                                  min: 2000 },
  { name: 'Neutral Creep', emoji: '🐗', description: "You exist. The jungle thanks you for feeding it.",                            min: 1700 },
  { name: 'Observer Ward', emoji: '👁️', description: "Placed. Ignored. Immediately dewarded.",                                     min: 1400 },
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
        display: 'inline-flex', alignItems: 'center',
        background: 'var(--bg-hover)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 500,
        color: 'var(--text-muted)', whiteSpace: 'nowrap', cursor: 'default',
        letterSpacing: 0.2,
      }}
    >
      {t.name}
    </span>
  );
}

function DotaRankText({ rankTier, leaderboardRank }) {
  const decoded = decodeRankTier(rankTier);
  if (!decoded) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
  const isImm = decoded.tier === 8;
  const label = isImm
    ? (leaderboardRank ? `Immortal #${leaderboardRank}` : 'Immortal')
    : decoded.stars
      ? `${decoded.name} ${decoded.stars}`
      : decoded.name;
  return (
    <span
      title={label}
      style={{
        display: 'inline-flex', alignItems: 'center',
        background: 'var(--bg-hover)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 500,
        color: 'var(--text-muted)', whiteSpace: 'nowrap', cursor: 'default',
        letterSpacing: 0.2,
      }}
    >
      {label}
    </span>
  );
}

function StreakBadge({ streak }) {
  if (!streak) return null;
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


function MostImprovedWidget({ data, loading, seasonLabel }) {
  const title = seasonLabel ? `Most Improved — ${seasonLabel}` : 'Most Improved — last 30 days';
  if (loading) return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px 20px', marginBottom: 24,
    }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading most improved…</div>
    </div>
  );

  if (!data || data.length === 0) return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px 20px', marginBottom: 24,
    }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>📈 {title}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        Not enough rating history yet — data accumulates after more matches.
      </div>
    </div>
  );

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(76,175,80,0.08) 0%, var(--bg-card) 100%)',
      border: '1px solid rgba(76,175,80,0.3)', borderRadius: 12,
      padding: '16px 20px', marginBottom: 24,
    }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>📈</span>
        <span>{title}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {data.slice(0, 5).map((p, i) => (
          <div key={p.account_id} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
            padding: '10px 14px', minWidth: 140, flex: '1 1 140px',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                background: 'var(--bg-hover)', borderRadius: 4, padding: '1px 5px',
              }}>#{i + 1}</span>
              <Link to={`/player/${p.account_id}`} style={{
                fontWeight: 600, fontSize: 13, color: 'var(--text-primary)',
                textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {p.display_name}
              </Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>MMR</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{p.current_mmr}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Gained</span>
              <span style={{
                fontWeight: 700, fontSize: 14,
                color: Number(p.mmr_delta) > 0 ? 'var(--accent-green)' : 'var(--text-muted)',
              }}>
                +{p.mmr_delta}
              </span>
            </div>
            {p.games_in_period > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {p.games_in_period} game{p.games_in_period !== 1 ? 's' : ''} this period
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BestAndFairestWidget({ data, loading, seasonLabel }) {
  const title = seasonLabel ? `Best & Fairest — ${seasonLabel}` : 'Best & Fairest — All Time';

  if (loading) return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px 20px', marginBottom: 24,
    }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading best & fairest…</div>
    </div>
  );

  if (!data || data.length === 0) return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px 20px', marginBottom: 24,
    }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>🤝 {title}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        Not enough attitude ratings yet — needs at least 3 ratings per player.
      </div>
    </div>
  );

  function attitudeColor(score) {
    const n = parseFloat(score);
    if (n >= 8) return '#4ade80';
    if (n >= 6) return '#fbbf24';
    return '#f87171';
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(96,165,250,0.08) 0%, var(--bg-card) 100%)',
      border: '1px solid rgba(96,165,250,0.3)', borderRadius: 12,
      padding: '16px 20px', marginBottom: 24,
    }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>🤝</span>
        <span>{title}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
        Average attitude rating received from teammates (min. 3 ratings)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {data.slice(0, 5).map((p, i) => (
          <div key={p.account_id} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
            padding: '10px 14px', minWidth: 140, flex: '1 1 140px',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                background: 'var(--bg-hover)', borderRadius: 4, padding: '1px 5px',
              }}>#{i + 1}</span>
              <Link to={`/player/${p.account_id}`} style={{
                fontWeight: 600, fontSize: 13, color: 'var(--text-primary)',
                textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {p.display_name || `Player ${p.account_id}`}
              </Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Attitude</span>
              <span style={{ fontWeight: 800, fontSize: 16, color: attitudeColor(p.avg_attitude) }}>
                {parseFloat(p.avg_attitude).toFixed(1)}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>/10</span>
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {p.total_ratings} rating{p.total_ratings !== '1' ? 's' : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FormDots({ results }) {
  if (!results || results.length === 0) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', justifyContent: 'center' }}>
      {results.map((r, i) => (
        <span
          key={i}
          title={r === 'W' ? 'Win' : 'Loss'}
          style={{
            width: 9, height: 9, borderRadius: '50%',
            background: r === 'W' ? 'var(--accent-green, #4caf50)' : 'var(--accent-red, #f44336)',
            display: 'inline-block', flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

export default function Leaderboard() {
  const { seasonId, seasons } = useSeason();
  const [data, setData] = useState({ leaderboard: [] });
  const [loading, setLoading] = useState(true);
  const [improved, setImproved] = useState([]);
  const [improvedLoading, setImprovedLoading] = useState(true);
  const [bestFairest, setBestFairest] = useState([]);
  const [bestFairestLoading, setBestFairestLoading] = useState(true);
  const [playerForm, setPlayerForm] = useState({});
  const [rankMap, setRankMap] = useState({});

  useEffect(() => {
    getPlayerRanks()
      .then(rows => {
        const m = {};
        rows.forEach(r => { m[r.account_id] = r; });
        setRankMap(m);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getLeaderboard(100, seasonId),
      getPlayerForm(seasonId).catch(() => ({ form: {} })),
    ])
      .then(([lb, formData]) => {
        setData(lb);
        setPlayerForm(formData.form || {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [seasonId]);

  useEffect(() => {
    setImprovedLoading(true);
    getMostImproved(30, seasonId || null)
      .then(d => setImproved(d.rows || []))
      .catch(() => setImproved([]))
      .finally(() => setImprovedLoading(false));
  }, [seasonId]);

  useEffect(() => {
    setBestFairestLoading(true);
    getBestAndFairest(seasonId || null)
      .then(d => setBestFairest(d.rows || []))
      .catch(() => setBestFairest([]))
      .finally(() => setBestFairestLoading(false));
  }, [seasonId]);

  if (loading) return <div className="loading">Loading leaderboard...</div>;

  return (
    <div>
      <h1 className="page-title">Leaderboard</h1>

      {/* Most Improved Widget */}
      {(() => {
        const season = seasons.find(s => s.id === seasonId);
        const seasonLabel = season ? (season.name || `Season ${season.id}`) : null;
        return <MostImprovedWidget data={improved} loading={improvedLoading} seasonLabel={seasonLabel} />;
      })()}

      {/* Best & Fairest Widget */}
      {(() => {
        const season = seasons.find(s => s.id === seasonId);
        const seasonLabel = season ? (season.name || `Season ${season.id}`) : null;
        return <BestAndFairestWidget data={bestFairest} loading={bestFairestLoading} seasonLabel={seasonLabel} />;
      })()}

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

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, marginTop: -8 }}>
        Ranked by TrueSkill MMR — beating stronger opponents earns more rating than raw win rate.
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        <strong style={{ color: 'var(--text-secondary)' }}>Impact Score</strong> (1–10): a community ranking based on K/D/A, win rate, and games played — hover the column header for details.
      </p>

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
                <th className="col-stat" title="Dota 2 rank medal">Dota Rank</th>
                <th className="col-stat" title="TrueSkill MMR rating">MMR</th>
                <th className="col-stat" title="Wins">W</th>
                <th className="col-stat" title="Losses">L</th>
                <th className="col-stat" title="Total games played">Games</th>
                <th className="col-stat" title="Win percentage">Win %</th>
                <th className="col-stat" title="Impact Score 1–10: ranked by K/D/A, win rate and games played">Impact</th>
                <th className="col-stat" title="Current win or loss streak">Streak</th>
                <th className="col-stat" title="Last 10 games — green=win, red=loss, left=most recent">Form</th>
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
                    <td className="col-stat">
                      <DotaRankText
                        rankTier={rankMap[p.player_id]?.dota_rank_tier}
                        leaderboardRank={rankMap[p.player_id]?.dota_leaderboard_rank}
                      />
                    </td>
                    <td className="col-stat mmr">{p.mmr}</td>
                    <td className="col-stat wins">{p.wins}</td>
                    <td className="col-stat losses">{p.losses}</td>
                    <td className="col-stat">{p.games_played}</td>
                    <td className="col-stat">{winRate}%</td>
                    <td className="col-stat"><ImpactBadge score={p.impact_score} /></td>
                    <td className="col-stat">
                      {p.streak
                        ? <StreakBadge streak={p.streak} />
                        : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                    </td>
                    <td className="col-stat">
                      <FormDots results={playerForm[p.player_id?.toString()] || []} />
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
