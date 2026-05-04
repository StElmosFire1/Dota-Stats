import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getLeaderboard, getMostImproved, getPlayerForm, getBestAndFairest } from '../api';
import { useSeason } from '../context/SeasonContext';
import { useFeatureFlag } from '../context/FeatureFlagsContext';
import ProBadge from '../components/ProBadge';
import useProMembers from '../hooks/useProMembers';
import ImpactBadge from '../components/ImpactBadge';
import { decodeRankTier } from '../components/RankBadge';
import { FRAME_META } from '../profileCosmetics';

// V1 thresholds — fresh player starts at ~2600 MMR
const MMR_TIERS_V1 = [
  { name: 'Gaben',         emoji: '🎩', description: "A personal friend of the man himself.",                                       min: 4100, color: '#FFD700',   bg: 'rgba(255,215,0,0.12)',   border: 'rgba(255,215,0,0.45)'    },
  { name: 'Prime Pick',    emoji: '🎯', description: "Everyone wants you on their team.",                                           min: 3800, color: '#CE93D8',   bg: 'rgba(156,39,176,0.15)',  border: 'rgba(156,39,176,0.45)'   },
  { name: 'Apex',          emoji: '⚡', description: "Operating at peak Dota capacity.",                                            min: 3500, color: '#90CAF9',   bg: 'rgba(33,150,243,0.12)',  border: 'rgba(33,150,243,0.4)'    },
  { name: 'Veteran',       emoji: '🎖️', description: "Seen things. Done things. Knows things.",                                    min: 3200, color: '#80DEEA',   bg: 'rgba(0,188,212,0.12)',   border: 'rgba(0,188,212,0.4)'     },
  { name: 'Solid',         emoji: '💪', description: "Reliable. People can actually count on you.",                                 min: 2900, color: '#A5D6A7',   bg: 'rgba(76,175,80,0.12)',   border: 'rgba(76,175,80,0.4)'     },
  { name: 'Average',       emoji: '😐', description: "Not bad. Not good. Just... there.",                                           min: 2600, color: 'var(--text-secondary)', bg: 'var(--bg-hover)', border: 'var(--border)' },
  { name: 'NPC',           emoji: '🤖', description: "Standing in the trees doing nothing.",                                        min: 2300, color: 'var(--text-muted)',     bg: 'var(--bg-hover)', border: 'var(--border)' },
  { name: 'Anchor',        emoji: '⚓', description: "Dragging your team straight to the bottom.",                                  min: 2000, color: '#FFCC80',   bg: 'rgba(255,152,0,0.12)',   border: 'rgba(255,152,0,0.4)'     },
  { name: 'Neutral Creep', emoji: '🐗', description: "You exist. The jungle thanks you for feeding it.",                            min: 1700, color: '#FFAB91',   bg: 'rgba(255,87,34,0.12)',   border: 'rgba(255,87,34,0.35)'    },
  { name: 'Observer Ward', emoji: '👁️', description: "Placed. Ignored. Immediately dewarded.",                                     min: 1400, color: '#EF9A9A',   bg: 'rgba(244,67,54,0.10)',   border: 'rgba(244,67,54,0.35)'    },
  { name: 'Position 6',    emoji: '🗺️', description: "The position that doesn't exist — neither do your contributions.",           min: 0,    color: '#EF9A9A',   bg: 'rgba(244,67,54,0.08)',   border: 'rgba(244,67,54,0.3)'     },
];

// V3 thresholds — fresh player starts at exactly 5000 MMR (+2400 offset from V1)
const MMR_TIERS_V3 = [
  { name: 'Gaben',         emoji: '🎩', description: "A personal friend of the man himself.",                                       min: 6500, color: '#FFD700',   bg: 'rgba(255,215,0,0.12)',   border: 'rgba(255,215,0,0.45)'    },
  { name: 'Prime Pick',    emoji: '🎯', description: "Everyone wants you on their team.",                                           min: 6200, color: '#CE93D8',   bg: 'rgba(156,39,176,0.15)',  border: 'rgba(156,39,176,0.45)'   },
  { name: 'Apex',          emoji: '⚡', description: "Operating at peak Dota capacity.",                                            min: 5900, color: '#90CAF9',   bg: 'rgba(33,150,243,0.12)',  border: 'rgba(33,150,243,0.4)'    },
  { name: 'Veteran',       emoji: '🎖️', description: "Seen things. Done things. Knows things.",                                    min: 5600, color: '#80DEEA',   bg: 'rgba(0,188,212,0.12)',   border: 'rgba(0,188,212,0.4)'     },
  { name: 'Solid',         emoji: '💪', description: "Reliable. People can actually count on you.",                                 min: 5300, color: '#A5D6A7',   bg: 'rgba(76,175,80,0.12)',   border: 'rgba(76,175,80,0.4)'     },
  { name: 'Average',       emoji: '😐', description: "Not bad. Not good. Just... there.",                                           min: 5000, color: 'var(--text-secondary)', bg: 'var(--bg-hover)', border: 'var(--border)' },
  { name: 'NPC',           emoji: '🤖', description: "Standing in the trees doing nothing.",                                        min: 4700, color: 'var(--text-muted)',     bg: 'var(--bg-hover)', border: 'var(--border)' },
  { name: 'Anchor',        emoji: '⚓', description: "Dragging your team straight to the bottom.",                                  min: 4400, color: '#FFCC80',   bg: 'rgba(255,152,0,0.12)',   border: 'rgba(255,152,0,0.4)'     },
  { name: 'Neutral Creep', emoji: '🐗', description: "You exist. The jungle thanks you for feeding it.",                            min: 4100, color: '#FFAB91',   bg: 'rgba(255,87,34,0.12)',   border: 'rgba(255,87,34,0.35)'    },
  { name: 'Observer Ward', emoji: '👁️', description: "Placed. Ignored. Immediately dewarded.",                                     min: 3800, color: '#EF9A9A',   bg: 'rgba(244,67,54,0.10)',   border: 'rgba(244,67,54,0.35)'    },
  { name: 'Position 6',    emoji: '🗺️', description: "The position that doesn't exist — neither do your contributions.",           min: 0,    color: '#EF9A9A',   bg: 'rgba(244,67,54,0.08)',   border: 'rgba(244,67,54,0.3)'     },
];

// Back-compat alias — components that don't know about V3 yet default to V1
const MMR_TIERS = MMR_TIERS_V1;

function getTier(mmr, tiers = MMR_TIERS_V1) {
  for (const t of tiers) {
    if (mmr >= t.min) return t;
  }
  return tiers[tiers.length - 1];
}

export function TierBadge({ mmr, useV3 = false, dbTiers = null }) {
  const tiers = useV3 ? MMR_TIERS_V3 : MMR_TIERS_V1;
  const t = getTier(mmr, tiers);
  if (!t) return null;

  const now = Date.now();
  let sponsorName = null;
  let matchedDbTier = null;
  if (dbTiers && Array.isArray(dbTiers) && dbTiers.length > 0) {
    const sorted = [...dbTiers].filter(dt => dt.min_mmr != null).sort((a, b) => b.min_mmr - a.min_mmr);
    matchedDbTier = sorted.find(dt => mmr >= dt.min_mmr) || null;
    if (matchedDbTier?.sponsor_name) {
      const from = matchedDbTier.sponsor_active_from ? new Date(matchedDbTier.sponsor_active_from).getTime() : 0;
      const until = matchedDbTier.sponsor_active_until ? new Date(matchedDbTier.sponsor_active_until).getTime() : Infinity;
      if (now >= from && now <= until) {
        sponsorName = matchedDbTier.sponsor_name;
      }
    }
  }

  // Prefer the DB-managed tier name over the hardcoded display name when available.
  const tierDisplayName = matchedDbTier?.name || t.name;
  const label = sponsorName ? `${tierDisplayName} — powered by ${sponsorName}` : tierDisplayName;
  const tooltipText = sponsorName
    ? `${t.description} · Sponsored by ${sponsorName}`
    : t.description;

  return (
    <span
      title={tooltipText}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: 4, minWidth: 118, flexShrink: 0,
        background: t.bg, border: `1px solid ${sponsorName ? '#f59e0b' : t.border}`,
        borderRadius: 8, padding: '3px 6px', fontSize: 11, fontWeight: 600,
        color: t.color, whiteSpace: 'nowrap', cursor: 'default',
        letterSpacing: 0.2,
      }}
    >
      {sponsorName ? '🤝' : t.emoji} {label}
    </span>
  );
}

const RANK_COLORS = {
  1: '#b0b0b0', 2: '#6fad40', 3: '#6fad40', 4: '#5ea3c8',
  5: '#4fa8a8', 6: '#c5a028', 7: '#a970ff', 8: '#e97d2e',
};

function DotaRankText({ rankTier, leaderboardRank }) {
  const decoded = decodeRankTier(rankTier);
  if (!decoded) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
  const isImm = decoded.tier === 8;
  const label = isImm
    ? (leaderboardRank ? `Immortal #${leaderboardRank}` : 'Immortal')
    : decoded.stars
      ? `${decoded.name} ${decoded.stars}`
      : decoded.name;
  const color = RANK_COLORS[decoded.tier] || '#aaa';
  const iconUrl = `https://www.opendota.com/assets/images/dota2/rank_icons/rank_icon_${decoded.tier}.png`;
  const starUrl = !isImm && decoded.stars > 0
    ? `https://www.opendota.com/assets/images/dota2/rank_icons/rank_star_${decoded.stars}.png`
    : null;
  return (
    <span
      title={label}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', cursor: 'default' }}
    >
      <span style={{ position: 'relative', width: 22, height: 22, flexShrink: 0 }}>
        <img
          src={iconUrl}
          alt={decoded.name}
          style={{ width: 22, height: 22, display: 'block' }}
          onError={e => { e.target.style.display = 'none'; }}
        />
        {starUrl && (
          <img
            src={starUrl}
            alt={`${decoded.stars} stars`}
            style={{ position: 'absolute', inset: 0, width: 22, height: 22 }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        )}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, color, letterSpacing: 0.2 }}>{label}</span>
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
  const proMembers = useProMembers();
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
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                {p.display_name}
                {proMembers.has(String(p.account_id)) && <ProBadge size="sm" />}
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
  const proMembers = useProMembers();

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
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                {p.display_name || `Player ${p.account_id}`}
                {proMembers.has(String(p.account_id)) && <ProBadge size="sm" />}
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

function SeasonEndBanner({ season }) {
  if (!season || (!season.end_date && !season.match_count_limit)) return null;

  const now = new Date();
  const parts = [];

  if (season.end_date) {
    const end = new Date(season.end_date);
    const diffMs = end - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      parts.push({ icon: '📅', text: `Ends in ${diffDays} day${diffDays !== 1 ? 's' : ''}`, sub: end.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) });
    } else {
      parts.push({ icon: '📅', text: 'Season ending soon', sub: end.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) });
    }
  }

  if (season.match_count_limit) {
    const played = season.match_count ?? 0;
    const remaining = Math.max(0, season.match_count_limit - played);
    parts.push({ icon: '🎮', text: `${remaining} match${remaining !== 1 ? 'es' : ''} remaining`, sub: `${played} of ${season.match_count_limit} played` });
  }

  if (parts.length === 0) return null;

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20,
      padding: '12px 16px',
      background: 'linear-gradient(135deg, rgba(124,107,255,0.08) 0%, var(--bg-card) 100%)',
      border: '1px solid rgba(124,107,255,0.3)', borderRadius: 10,
      alignItems: 'center',
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent, #7c6bff)', textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 4 }}>
        Season closes
      </span>
      {parts.map((p, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-hover)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600,
          color: 'var(--text-primary)',
        }}>
          <span>{p.icon}</span>
          <span>{p.text}</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>({p.sub})</span>
        </span>
      ))}
    </div>
  );
}

export default function Leaderboard() {
  const { seasonId, seasons } = useSeason();
  const showSeasonPass = true;
  const proMembers = useProMembers();
  const [data, setData] = useState({ leaderboard: [], useV3: false });
  const [loading, setLoading] = useState(true);
  const [improved, setImproved] = useState([]);
  const [improvedLoading, setImprovedLoading] = useState(true);
  const [bestFairest, setBestFairest] = useState([]);
  const [bestFairestLoading, setBestFairestLoading] = useState(true);
  const [playerForm, setPlayerForm] = useState({});
  const [xpMap, setXpMap] = useState({});
  const [dbTiers, setDbTiers] = useState(null);
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
    if (!showSeasonPass) { setXpMap({}); return; }
    fetch(`/api/season-pass/leaderboard?limit=200${seasonId ? `&season=${seasonId}` : ''}`)
      .then(r => (r.ok ? r.json() : { leaderboard: [] }))
      .then(d => {
        const m = {};
        for (const row of (d.leaderboard || [])) {
          m[String(row.account_id)] = { xp: row.xp, tier_name: row.tier_name };
        }
        setXpMap(m);
      })
      .catch(() => setXpMap({}));
  }, [showSeasonPass, seasonId]);

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

  useEffect(() => {
    const url = seasonId
      ? `/api/seasons/${seasonId}/tiers`
      : '/api/seasons/active/tiers';
    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setDbTiers(d?.tiers || null))
      .catch(() => setDbTiers(null));
  }, [seasonId]);

  if (loading) return <div className="loading">Loading leaderboard...</div>;

  return (
    <div>
      <h1 className="page-title">Leaderboard</h1>

      {/* Season end conditions banner */}
      {(() => {
        const season = seasons.find(s => String(s.id) === String(seasonId));
        return season?.active ? <SeasonEndBanner season={season} /> : null;
      })()}

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
        {[...(data.useV3 ? MMR_TIERS_V3 : MMR_TIERS_V1)].reverse().map((t, i) => (
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
                <th className="col-stat" title="Dota 2 rank medal">Dota Rank</th>
                <th className="col-stat" title="Inhouse Rank">IH Rank</th>
                <th className="col-stat" title="TrueSkill MMR rating">MMR</th>
                <th className="col-stat" title="Wins">W</th>
                <th className="col-stat" title="Losses">L</th>
                <th className="col-stat" title="Total games played">Games</th>
                <th className="col-stat" title="Win percentage">Win %</th>
                <th className="col-stat" title="Impact Score 1–10: ranked by K/D/A, win rate and games played">Impact</th>
                <th className="col-stat" title="Average PERF — position-aware Positive Impact Score (1.0–10.0) across all rated games. 5.0 = average, 9.0+ = top 1%.">Avg PERF</th>
                <th className="col-stat" title="Current win or loss streak">Streak</th>
                <th className="col-stat" title="Last 10 games — green=win, red=loss, left=most recent">Form</th>
                {showSeasonPass && (
                  <th className="col-stat" title="Season Pass XP — earn from wins, MVPs and hot streaks">XP</th>
                )}
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
                      {(() => {
                        const frameMeta = p.profile_frame ? FRAME_META[p.profile_frame] : null;
                        const frameStyle = frameMeta?.style || {};
                        return (
                          <Link
                            to={`/player/${p.player_id}`}
                            className="player-link"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              borderRadius: frameMeta ? 6 : 0,
                              padding: frameMeta ? '1px 6px 1px 4px' : 0,
                              ...frameStyle,
                            }}
                          >
                            {p.nickname || p.display_name || p.player_id}
                            {proMembers.has(String(p.player_id)) && <ProBadge size="sm" />}
                          </Link>
                        );
                      })()}
                    </td>
                    <td className="col-stat">
                      <DotaRankText
                        rankTier={p.dota_rank_tier}
                        leaderboardRank={p.dota_leaderboard_rank}
                      />
                    </td>
                    <td className="col-stat"><TierBadge mmr={p.mmr} useV3={data.useV3} dbTiers={dbTiers} /></td>
                    <td className="col-stat mmr">{p.mmr}</td>
                    <td className="col-stat wins">{p.wins}</td>
                    <td className="col-stat losses">{p.losses}</td>
                    <td className="col-stat">{p.games_played}</td>
                    <td className="col-stat">{winRate}%</td>
                    <td className="col-stat"><ImpactBadge score={p.impact_score} /></td>
                    <td className="col-stat" title={p.avg_perf != null ? `Avg PERF ${Number(p.avg_perf).toFixed(1)}/10 across ${p.perf_games || 0} rated games` : 'No PERF data yet'}>
                      {p.avg_perf != null ? (
                        <span style={{
                          fontWeight: 700,
                          color: Number(p.avg_perf) >= 9.0 ? '#fbbf24'
                               : Number(p.avg_perf) >= 8.0 ? '#4ade80'
                               : Number(p.avg_perf) >= 5.0 ? 'var(--text-secondary)'
                               : '#f87171',
                        }}>{Number(p.avg_perf).toFixed(1)}</span>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td className="col-stat">
                      {p.streak
                        ? <StreakBadge streak={p.streak} />
                        : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                    </td>
                    <td className="col-stat">
                      <FormDots results={playerForm[p.player_id?.toString()] || []} />
                    </td>
                    {showSeasonPass && (
                      <td className="col-stat" title={xpMap[String(p.player_id)]?.tier_name || ''}>
                        {xpMap[String(p.player_id)]?.xp != null
                          ? xpMap[String(p.player_id)].xp.toLocaleString()
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                    )}
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
