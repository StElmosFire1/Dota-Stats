import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getLeaderboard, getMostImproved, getPlayerForm, getBestAndFairest } from '../api';
import { useSeason } from '../context/SeasonContext';
import { useFeatureFlag } from '../context/FeatureFlagsContext';
import ProBadge from '../components/ProBadge';
import VerifiedBadge from '../components/VerifiedBadge';
import useProMembers from '../hooks/useProMembers';
import ImpactBadge from '../components/ImpactBadge';
import { decodeRankTier } from '../components/RankBadge';
import { FRAME_META } from '../profileCosmetics';
import SponsorshipBanner from '../components/SponsorshipBanner';
import FounderRing from '../components/founderRings/FounderRing';
import '../styles/pressbox-leaderboard.css';

// EXAMPLE rank-emblem preview (T001): a fixed, deterministic rotation of the
// 8 ANIMATED FounderRing variants mapped to the top leaderboard ranks. This is
// an explicit visual preview of the cosmetic-emblem system until cosmetics go
// fully live — it is NOT gated on real ownership. Ranks beyond this set keep
// the plain numbered `.pb-rank-disc`.
const PREVIEW_RANK_EMBLEMS = {
  1: 'phoenix',
  2: 'eclipse',
  3: 'storm',
  4: 'astrolabe',
  5: 'forge',
  6: 'starmap',
  7: 'twin',
  8: 'beveled',
};

// Medieval tier ladder — top 8 are the heraldic ranks (with /badges/tier-N-name.png art),
// bottom 3 are the meme fallback tiers retained for sub-Apprentice MMR.
// v5.82 — King is reserved (`leaderOnly: true`) for the #1 leaderboard player.
// MMR-only callers cannot land on King; they max out at Warlord. The badge
// table still includes King so leader-aware callers can resolve it by name.
// v5.83 — V1 ladder removed (full edition uses V3 only). The single
// `MMR_TIERS` export below is the canonical ladder for every display.
// Fresh players start at exactly 5000 MMR. King is reserved for the #1
// leaderboard player. Other tiers are spread wide so the active player
// base doesn't pile into the top band.
export const MMR_TIERS = [
  { name: 'King',          tierNum: 8, badge: '/badges/tier-8-king.png',       emoji: '👑', description: "Ruler of the realm. Reserved for the #1 player on the leaderboard.",              min: Infinity, leaderOnly: true, color: '#f5d97a',   bg: 'rgba(245,158,11,0.14)',  border: 'rgba(245,158,11,0.55)'    },
  { name: 'Warlord',       tierNum: 7, badge: '/badges/tier-7-warlord.png',    emoji: '🪓', description: "Battle-hardened commander. Banners follow you.",                                  min: 7000, color: '#e0b56b',   bg: 'rgba(197,169,117,0.14)', border: 'rgba(197,169,117,0.55)'   },
  { name: 'Paladin',       tierNum: 6, badge: '/badges/tier-6-paladin.png',    emoji: '✨', description: "Righteous champion. The light is on your side.",                                  min: 6500, color: '#d4b878',   bg: 'rgba(197,169,117,0.12)', border: 'rgba(197,169,117,0.45)'   },
  { name: 'Templar',       tierNum: 5, badge: '/badges/tier-5-templar.png',    emoji: '⚔️', description: "Sworn to the order. Disciplined and feared.",                                    min: 6200, color: '#c9c9d9',   bg: 'rgba(197,169,117,0.10)', border: 'rgba(197,169,117,0.4)'    },
  { name: 'Knight',        tierNum: 4, badge: '/badges/tier-4-knight.png',     emoji: '🛡️', description: "Chivalrous and dependable. The kingdom counts on you.",                          min: 5900, color: '#b8b8c8',   bg: 'rgba(184,184,200,0.10)', border: 'rgba(184,184,200,0.4)'    },
  { name: 'Footman',       tierNum: 3, badge: '/badges/tier-3-footman.png',    emoji: '🗡️', description: "Honest soldier. Holds the line, takes the field.",                               min: 5600, color: 'var(--text-secondary)', bg: 'var(--bg-hover)', border: 'var(--border)' },
  { name: 'Squire',        tierNum: 2, badge: '/badges/tier-2-squire.png',     emoji: '🐎', description: "In training. One day you may be knighted.",                                       min: 5300, color: 'var(--text-muted)',     bg: 'var(--bg-hover)', border: 'var(--border)' },
  { name: 'Apprentice',    tierNum: 1, badge: '/badges/tier-1-apprentice.png', emoji: '📜', description: "Just beginning the climb. Read the scrolls, hold the line.",                     min: 5000, color: '#c5a975',   bg: 'rgba(197,169,117,0.10)', border: 'rgba(197,169,117,0.4)'    },
  { name: 'Outlaw',        badge: '/badges/tier-sub-1-outlaw.png',   emoji: '🏴', description: "Branded and exiled — feared by the kingdom. One step from being knighted… or hanged.", min: 4500, color: '#EF9A9A',   bg: 'rgba(244,67,54,0.10)',   border: 'rgba(244,67,54,0.35)'    },
  { name: 'Vagabond',      badge: '/badges/tier-sub-2-vagabond.png', emoji: '🥾', description: "Wandering the realm with staff and bindle. No banner yet, but the road teaches you.",  min: 4000, color: '#FFAB91',   bg: 'rgba(255,87,34,0.10)',   border: 'rgba(255,87,34,0.35)'    },
  { name: 'Peasant',       badge: '/badges/tier-sub-3-peasant.png',  emoji: '🌾', description: "Tilling the fields. Pick up a sword — every Knight begins here.",                       min: 0,    color: '#EF9A9A',   bg: 'rgba(244,67,54,0.08)',   border: 'rgba(244,67,54,0.3)'     },
];

export function getTier(mmr, { isLeader = false } = {}) {
  if (isLeader) {
    const king = MMR_TIERS.find(t => t.leaderOnly);
    if (king) return king;
  }
  for (const t of MMR_TIERS) {
    if (t.leaderOnly) continue;
    if (mmr >= t.min) return t;
  }
  return MMR_TIERS[MMR_TIERS.length - 1];
}

export function TierBadge({ mmr, dbTiers = null, isLeader = false }) {
  const t = getTier(mmr, { isLeader });
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
        gap: 6, minWidth: 118, flexShrink: 0,
        background: t.bg, border: `1px solid ${sponsorName ? '#f59e0b' : t.border}`,
        borderRadius: 8, padding: '3px 6px 3px 4px', fontSize: 11, fontWeight: 600,
        color: t.color, whiteSpace: 'nowrap', cursor: 'default',
        letterSpacing: 0.2,
      }}
    >
      {sponsorName ? (
        <span style={{ fontSize: 13, lineHeight: 1 }}>🤝</span>
      ) : t.badge ? (
        <img
          src={t.badge}
          alt=""
          aria-hidden="true"
          loading="lazy"
          style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' }}
          onError={(e) => {
            // Fall back to the emoji glyph if the badge PNG fails to load.
            const span = document.createElement('span');
            span.style.cssText = 'font-size:13px;line-height:1';
            span.textContent = t.emoji || '🛡️';
            e.target.replaceWith(span);
          }}
        />
      ) : (
        <span style={{ fontSize: 13, lineHeight: 1 }}>{t.emoji}</span>
      )}
      <span>{label}</span>
    </span>
  );
}

// Small heraldic tier emblem (image only) for the Global Standings player cell —
// mirrors the mockup's TierEmblem rendered beside the player name. Falls back to
// the tier emoji glyph if the badge art fails to load.
function TierEmblemImg({ mmr, isLeader = false }) {
  const t = getTier(mmr, { isLeader });
  if (!t) return null;
  return t.badge ? (
    <img
      src={t.badge}
      alt=""
      aria-hidden="true"
      title={t.name}
      loading="lazy"
      style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' }}
      onError={(e) => {
        const span = document.createElement('span');
        span.style.cssText = 'font-size:15px;line-height:1';
        span.textContent = t.emoji || '🛡️';
        e.target.replaceWith(span);
      }}
    />
  ) : (
    <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>{t.emoji}</span>
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
      {isWin ? '🔥' : '💀'}<span className="pb-num">{Math.abs(streak)}</span>
    </span>
  );
}


// Small inline icons (no icon library in the live app — see plan rule #5).
function IconTrendingUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}
function IconAward() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}

// Circular avatar disc mirroring the mockup's gradient spotlight portrait.
function SpotlightAvatar({ name }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      aria-hidden="true"
      style={{
        width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
        border: '1px solid var(--pb-line)',
        background: 'linear-gradient(135deg, var(--pb-elevated), var(--pb-surface-2))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 700,
        color: 'var(--pb-brass-bright)',
      }}
    >
      {initial}
    </div>
  );
}

function MostImprovedWidget({ data, loading, seasonLabel }) {
  const eyebrow = 'Most Improved';
  const subLabel = seasonLabel || 'Last 30 days';
  const proMembers = useProMembers();
  if (loading) return (
    <div className="pb-card pb-spotlight">
      <div className="pb-spotlight-head">
        <div className="pb-eyebrow">{eyebrow}</div>
        <span className="pb-spotlight-icon"><IconTrendingUp /></span>
      </div>
      <div style={{ color: 'var(--pb-faint)', fontSize: 13 }}>Loading most improved…</div>
    </div>
  );

  if (!data || data.length === 0) return (
    <div className="pb-card pb-spotlight">
      <div className="pb-spotlight-head">
        <div className="pb-eyebrow">{eyebrow}</div>
        <span className="pb-spotlight-icon"><IconTrendingUp /></span>
      </div>
      <div style={{ color: 'var(--pb-faint)', fontSize: 13 }}>
        Not enough rating history yet — data accumulates after more matches.
      </div>
    </div>
  );

  const ranked = data.slice(0, 5);
  const [top, ...rest] = ranked;

  return (
    <div className="pb-card pb-spotlight">
      <div className="pb-spotlight-head">
        <div className="pb-eyebrow">{eyebrow}</div>
        <span className="pb-spotlight-icon"><IconTrendingUp /></span>
      </div>

      <div className="pb-spotlight-feature">
        <SpotlightAvatar name={top.display_name} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <Link to={`/player/${top.account_id}`} className="pb-spotlight-name">
            {top.display_name}
            {proMembers.has(String(top.account_id)) && <ProBadge size="sm" variant={proMembers.isFounder?.(top.account_id) ? 'founder' : 'pro'} />}
          </Link>
          <div className="pb-spotlight-statline">
            <span className="pb-spotlight-stat pb-num" style={{ color: Number(top.mmr_delta) > 0 ? 'var(--pb-radiant)' : 'var(--pb-faint)' }}>
              {Number(top.mmr_delta) > 0 ? '+' : ''}{top.mmr_delta} MMR
            </span>
            <span className="pb-spotlight-sub">
              — {subLabel}{top.current_mmr != null ? ` · now ${top.current_mmr}` : ''}
            </span>
          </div>
        </div>
      </div>

      {rest.length > 0 && (
        <div className="pb-spotlight-rest">
          {rest.map((p, i) => (
            <div key={p.account_id} className="pb-spotlight-row">
              <span className="pb-spotlight-rank">{i + 2}</span>
              <div className="pb-spotlight-rowmain">
                <Link to={`/player/${p.account_id}`} className="pb-spotlight-rowname" style={{ flex: '0 0 auto' }}>
                  {p.display_name}
                  {proMembers.has(String(p.account_id)) && <ProBadge size="sm" variant={proMembers.isFounder?.(p.account_id) ? 'founder' : 'pro'} />}
                </Link>
                {(p.current_mmr != null || p.games_in_period > 0) && (
                  <span className="pb-spotlight-rowsub">
                    {p.current_mmr != null ? `now ${p.current_mmr}` : ''}
                    {p.current_mmr != null && p.games_in_period > 0 ? ' · ' : ''}
                    {p.games_in_period > 0 ? `${p.games_in_period} game${p.games_in_period !== 1 ? 's' : ''} this period` : ''}
                  </span>
                )}
              </div>
              <span className="pb-spotlight-rowval pb-num" style={{ color: Number(p.mmr_delta) > 0 ? 'var(--pb-radiant)' : 'var(--pb-faint)' }}>
                {Number(p.mmr_delta) > 0 ? '+' : ''}{p.mmr_delta}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BestAndFairestWidget({ data, loading, seasonLabel }) {
  const eyebrow = 'Best & Fairest';
  const subLabel = seasonLabel || 'All Time';
  const proMembers = useProMembers();

  function attitudeColor(score) {
    const n = parseFloat(score);
    if (n >= 8) return '#4ade80';
    if (n >= 6) return '#fbbf24';
    return '#f87171';
  }

  if (loading) return (
    <div className="pb-card pb-spotlight">
      <div className="pb-spotlight-head">
        <div className="pb-eyebrow">{eyebrow}</div>
        <span className="pb-spotlight-icon"><IconAward /></span>
      </div>
      <div style={{ color: 'var(--pb-faint)', fontSize: 13 }}>Loading best & fairest…</div>
    </div>
  );

  if (!data || data.length === 0) return (
    <div className="pb-card pb-spotlight">
      <div className="pb-spotlight-head">
        <div className="pb-eyebrow">{eyebrow}</div>
        <span className="pb-spotlight-icon"><IconAward /></span>
      </div>
      <div style={{ color: 'var(--pb-faint)', fontSize: 13 }}>
        Not enough attitude ratings yet — needs at least 3 ratings per player.
      </div>
    </div>
  );

  const ranked = data.slice(0, 5);
  const [top, ...rest] = ranked;

  return (
    <div className="pb-card pb-spotlight">
      <div className="pb-spotlight-head">
        <div className="pb-eyebrow">{eyebrow}</div>
        <span className="pb-spotlight-icon"><IconAward /></span>
      </div>

      <div className="pb-spotlight-feature">
        <SpotlightAvatar name={top.display_name || `Player ${top.account_id}`} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <Link to={`/player/${top.account_id}`} className="pb-spotlight-name">
            {top.display_name || `Player ${top.account_id}`}
            {proMembers.has(String(top.account_id)) && <ProBadge size="sm" variant={proMembers.isFounder?.(top.account_id) ? 'founder' : 'pro'} />}
          </Link>
          <div className="pb-spotlight-statline">
            <span className="pb-spotlight-stat pb-num" style={{ color: attitudeColor(top.avg_attitude) }}>
              {parseFloat(top.avg_attitude).toFixed(1)}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--pb-faint)', fontFamily: 'var(--font)' }}>/10</span>
            </span>
            <span className="pb-spotlight-sub">
              — {top.total_ratings} rating{top.total_ratings !== '1' ? 's' : ''} · {subLabel}
            </span>
          </div>
        </div>
      </div>

      {rest.length > 0 && (
        <div className="pb-spotlight-rest">
          {rest.map((p, i) => (
            <div key={p.account_id} className="pb-spotlight-row">
              <span className="pb-spotlight-rank">{i + 2}</span>
              <div className="pb-spotlight-rowmain">
                <Link to={`/player/${p.account_id}`} className="pb-spotlight-rowname" style={{ flex: '0 0 auto' }}>
                  {p.display_name || `Player ${p.account_id}`}
                  {proMembers.has(String(p.account_id)) && <ProBadge size="sm" variant={proMembers.isFounder?.(p.account_id) ? 'founder' : 'pro'} />}
                </Link>
                <span className="pb-spotlight-rowsub">
                  {p.total_ratings} rating{p.total_ratings !== '1' ? 's' : ''}
                </span>
              </div>
              <span className="pb-spotlight-rowval pb-num" style={{ color: attitudeColor(p.avg_attitude) }}>
                {parseFloat(p.avg_attitude).toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      )}
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
  const showSeasonPass = false;
  const proMembers = useProMembers();
  const [data, setData] = useState({ leaderboard: [] });
  const [loading, setLoading] = useState(true);
  const [improved, setImproved] = useState([]);
  const [improvedLoading, setImprovedLoading] = useState(true);
  const [bestFairest, setBestFairest] = useState([]);
  const [bestFairestLoading, setBestFairestLoading] = useState(true);
  const [playerForm, setPlayerForm] = useState({});
  const [xpMap, setXpMap] = useState({});
  const [dbTiers, setDbTiers] = useState(null);
  const [query, setQuery] = useState('');
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

  const currentSeason = seasons.find(s => String(s.id) === String(seasonId)) || null;
  const seasonLabel = currentSeason ? (currentSeason.name || `Season ${currentSeason.id}`) : 'All Seasons';
  const endsInText = (() => {
    if (!currentSeason?.active || !currentSeason?.end_date) return null;
    const diffMs = new Date(currentSeason.end_date) - new Date();
    if (diffMs <= 0) return 'Ending soon';
    const days = Math.floor(diffMs / 86400000);
    const hours = Math.floor((diffMs % 86400000) / 3600000);
    return `${days}d : ${String(hours).padStart(2, '0')}h`;
  })();

  return (
    <div className="pb-leaderboard">
      <header className="pb-lb-header">
        <div>
          <div className="pb-eyebrow pb-lb-eyebrow" style={{ marginBottom: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
              <path d="m13 19 6-6" /><path d="m16 16 4 4" /><path d="m19 21 2-2" />
              <path d="M14.5 6.5 18 3h3v3l-3.5 3.5" />
              <path d="m5 14 6 6" /><path d="m8 16-4 4" /><path d="m5 19-2-2" />
            </svg>
            Competitive Ladder
          </div>
          <h1 className="pb-page-title" style={{ fontSize: '2.6rem', margin: 0 }}>Seasonal Rankings</h1>
        </div>

        <div className="pb-lb-header-meta">
          {endsInText && (
            <div className="pb-lb-meta-block">
              <span className="pb-lb-meta-eyebrow">Ends In</span>
              <span className="pb-lb-meta-value pb-num">{endsInText}</span>
            </div>
          )}
          {endsInText && <span className="pb-lb-meta-divider" aria-hidden="true" />}
          <div className="pb-lb-meta-block">
            <span className="pb-lb-meta-eyebrow">Season</span>
            <span className="pb-lb-season-chip">{seasonLabel}</span>
          </div>
        </div>
      </header>

      <SponsorshipBanner slug="leaderboard_top" style={{ margin: '12px 0' }} />

      {/* Season end conditions banner */}
      {currentSeason?.active ? <SeasonEndBanner season={currentSeason} /> : null}

      {/* Spotlights — Most Improved + Best & Fairest as paired Press Box cards */}
      <div className="pb-spotlights">
        <MostImprovedWidget data={improved} loading={improvedLoading} seasonLabel={seasonLabel} />
        <BestAndFairestWidget data={bestFairest} loading={bestFairestLoading} seasonLabel={seasonLabel} />
      </div>

      {/* Tier legend — worst to best left to right */}
      <div className="pb-card" style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20,
        padding: '12px 16px',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 11, color: 'var(--pb-faint)', marginRight: 4, whiteSpace: 'nowrap' }}>worst →</span>
        {[...MMR_TIERS].reverse().map((t) => (
          <span
            key={t.name}
            title={t.description}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'var(--bg-hover)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '3px 9px 3px 5px', fontSize: 11, fontWeight: 600,
              color: 'var(--text-secondary)', cursor: 'default', whiteSpace: 'nowrap',
            }}
          >
            {t.badge ? (
              <img
                src={t.badge}
                alt=""
                aria-hidden="true"
                loading="lazy"
                style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' }}
                onError={(e) => {
                  const span = document.createElement('span');
                  span.style.cssText = 'font-size:13px;line-height:1';
                  span.textContent = t.emoji || '🛡️';
                  e.target.replaceWith(span);
                }}
              />
            ) : (
              <span style={{ fontSize: 13, lineHeight: 1 }}>{t.emoji}</span>
            )}
            {t.name}
          </span>
        ))}
        <span style={{ fontSize: 11, color: 'var(--pb-faint)', marginLeft: 4, whiteSpace: 'nowrap' }}>→ best</span>
      </div>

      <p style={{ fontSize: 12, color: 'var(--pb-faint)', marginBottom: 4, marginTop: -8 }}>
        Ranked by TrueSkill MMR — beating stronger opponents earns more rating than raw win rate.
      </p>
      <p style={{ fontSize: 12, color: 'var(--pb-faint)', marginBottom: 16 }}>
        <strong style={{ color: 'var(--pb-muted)' }}>Impact Score</strong> (1–10): a community ranking based on K/D/A, win rate, and games played — hover the column header for details.
      </p>

      {data.leaderboard.length === 0 ? (
        <div className="empty-state">
          <p>No ratings yet. Play some matches to populate the leaderboard!</p>
        </div>
      ) : (
        <div className="pb-card" style={{ overflow: 'hidden' }}>
          <div className="pb-lb-table-head">
            <h2 className="pb-section-title" style={{ margin: 0 }}>Global Standings</h2>
            <div className="pb-lb-search">
              <svg className="pb-lb-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search player…"
                aria-label="Search players by name"
                className="pb-lb-search-input"
              />
            </div>
          </div>
          <div className="scoreboard-wrapper">
          <table className="scoreboard leaderboard-table">
            <thead>
              <tr>
                <th className="col-rank" title="Rank">#</th>
                <th className="col-player" title="Player name">Player</th>
                <th className="col-stat" title="Dota 2 rank medal">Dota Rank</th>
                <th className="col-stat" title="Inhouse Rank">IH Rank</th>
                <th className="col-stat" title="TrueSkill MMR rating">MMR</th>
                <th className="col-stat col-wl-hide" title="Wins">W</th>
                <th className="col-stat col-wl-hide" title="Losses">L</th>
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
              {(() => {
                const q = query.trim().toLowerCase();
                const ranked = data.leaderboard
                  .map((p, i) => ({ p, rank: i + 1 }))
                  .filter(({ p }) => !q || String(p.nickname || p.display_name || p.player_id || '').toLowerCase().includes(q));
                if (ranked.length === 0) {
                  return (
                    <tr>
                      <td colSpan={showSeasonPass ? 14 : 13} style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--pb-faint)' }}>
                        No players match “{query}”.
                      </td>
                    </tr>
                  );
                }
                return ranked.map(({ p, rank }) => {
                const winRate = p.games_played > 0
                  ? ((p.wins / p.games_played) * 100).toFixed(1)
                  : '0.0';
                return (
                  <tr key={p.player_id} className={rank <= 3 ? `rank-${rank}` : ''}>
                    <td className="col-rank">
                      {PREVIEW_RANK_EMBLEMS[rank] ? (
                        <span className="pb-rank-emblem">
                          {/* The FounderRing is purely decorative; the rank
                              number is exposed to assistive tech via the
                              visually-hidden label so there's no a11y loss. */}
                          <span className="pb-sr-only">Rank {rank}</span>
                          <span className="pb-rank-emblem-art" aria-hidden="true">
                            <FounderRing
                              sku={PREVIEW_RANK_EMBLEMS[rank]}
                              size={50}
                              disc="monogram"
                              monogramText={String(rank)}
                            />
                          </span>
                        </span>
                      ) : (
                        <span className="pb-rank-disc">{rank}</span>
                      )}
                    </td>
                    <td className="col-player">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        {/* Equipped cosmetic ring (from the shop) — shown on
                            the leaderboard, not just the profile page. */}
                        {p.founder_ring ? (
                          <span title="Equipped ring" style={{ display: 'inline-flex', flexShrink: 0 }}>
                            <FounderRing sku={p.founder_ring} size={30} disc="emblem" />
                          </span>
                        ) : null}
                        <TierEmblemImg mmr={p.mmr} isLeader={rank === 1} />
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
                              {proMembers.has(String(p.player_id)) && <ProBadge size="sm" variant={proMembers.isFounder?.(p.player_id) ? 'founder' : 'pro'} />}
                              {/* Round-8: propagate verified-badge to public
                                  surfaces. Inline lazy-mount — VerifiedBadge
                                  returns null when the player has none, so
                                  this is a no-op for unverified players. */}
                              <VerifiedBadge accountId={p.player_id} size={12} />
                            </Link>
                          );
                        })()}
                      </span>
                    </td>
                    <td className="col-stat">
                      <DotaRankText
                        rankTier={p.dota_rank_tier}
                        leaderboardRank={p.dota_leaderboard_rank}
                      />
                    </td>
                    <td className="col-stat"><TierBadge mmr={p.mmr} dbTiers={dbTiers} isLeader={rank === 1} /></td>
                    <td className="col-stat mmr pb-num">{p.mmr}</td>
                    <td className="col-stat col-wl-hide wins pb-num">{p.wins}</td>
                    <td className="col-stat col-wl-hide losses pb-num">{p.losses}</td>
                    <td className="col-stat pb-num">{p.games_played}</td>
                    <td className="col-stat pb-num">{winRate}%</td>
                    <td className="col-stat"><ImpactBadge score={p.impact_score} /></td>
                    <td className="col-stat" title={p.avg_perf != null ? `Avg PERF ${Number(p.avg_perf).toFixed(1)}/10 across ${p.perf_games || 0} rated games` : 'No PERF data yet'}>
                      {p.avg_perf != null ? (
                        <span className="pb-num" style={{
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
                });
              })()}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
