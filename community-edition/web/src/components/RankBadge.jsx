import React from 'react';

// Dota 2 rank tier decoding
// rank_tier = tier * 10 + stars  (e.g. 75 = Divine 5, 80 = Immortal)
export function decodeRankTier(rankTier) {
  if (!rankTier || rankTier === 0) return null;
  const tier  = Math.floor(rankTier / 10);
  const stars = rankTier % 10;
  const names = ['', 'Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal'];
  const name  = names[tier] || 'Unknown';
  return { tier, stars, name, rankTier };
}

const RANK_COLORS = {
  1: '#808080', // Herald — grey
  2: '#6fad40', // Guardian — green
  3: '#6fad40', // Crusader — green
  4: '#5ea3c8', // Archon — blue
  5: '#5ea3c8', // Legend — blue
  6: '#c5a028', // Ancient — gold
  7: '#c5a028', // Divine — gold
  8: '#e97d2e', // Immortal — orange
};

const RANK_EMOJIS = {
  1: '🔩',
  2: '🛡️',
  3: '⚔️',
  4: '🏹',
  5: '📜',
  6: '🏛️',
  7: '✨',
  8: '👑',
};

function StarDots({ count, color }) {
  if (!count || count <= 0) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 2, marginLeft: 3 }}>
      {Array.from({ length: Math.min(count, 5) }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 5, height: 5, borderRadius: '50%',
            background: color, display: 'inline-block',
            opacity: 0.9,
          }}
        />
      ))}
    </span>
  );
}

// ── MMR-Based Badge System (1.8 / Season 10 — `new_rank_theme` flag) ─────────
// 8-tier badge system based on inhouse TrueSkill MMR (5000 baseline at S10).
// Tier 5 (5000–5999) is the default starting band. Names are deliberate
// placeholders — colour scheme + iconography is the visual hook. Updated
// alongside the broader rank-theme refresh.
const MMR_BADGE_TIERS = [
  { tier: 1, name: 'Tier I',    floor: 0,    color: '#6b7280', emoji: '🪨' },
  { tier: 2, name: 'Tier II',   floor: 2000, color: '#84cc16', emoji: '🌱' },
  { tier: 3, name: 'Tier III',  floor: 3000, color: '#22d3ee', emoji: '💧' },
  { tier: 4, name: 'Tier IV',   floor: 4000, color: '#3b82f6', emoji: '🛡️' },
  { tier: 5, name: 'Tier V',    floor: 5000, color: '#a855f7', emoji: '⚡' },
  { tier: 6, name: 'Tier VI',   floor: 6000, color: '#f59e0b', emoji: '🔥' },
  { tier: 7, name: 'Tier VII',  floor: 7000, color: '#f97316', emoji: '☀️' },
  { tier: 8, name: 'Tier VIII', floor: 8000, color: '#ef4444', emoji: '👑' },
];

export function decodeMmrBadge(mmr) {
  if (mmr == null || isNaN(mmr)) return null;
  const m = Number(mmr);
  let match = MMR_BADGE_TIERS[0];
  for (const t of MMR_BADGE_TIERS) {
    if (m >= t.floor) match = t;
  }
  return match;
}

// Compact MMR-based badge. Render unconditionally — caller is responsible for
// gating on the `new_rank_theme` feature flag so the legacy Dota rank badge
// stays the source of truth until the rank-theme refresh ships.
export function MmrBadge({ mmr, style = {}, size = 'sm' }) {
  const decoded = decodeMmrBadge(mmr);
  if (!decoded) return null;
  const fontSize = size === 'lg' ? 13 : 11;
  const padding  = size === 'lg' ? '4px 10px' : '2px 7px';
  return (
    <span
      title={`${decoded.name} · ${Math.round(mmr)} MMR`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: `${decoded.color}1a`,
        border: `1px solid ${decoded.color}66`,
        borderRadius: 8, padding, fontSize, fontWeight: 700,
        color: decoded.color, whiteSpace: 'nowrap', cursor: 'default',
        letterSpacing: 0.3,
        ...style,
      }}
    >
      <span style={{ fontSize: size === 'lg' ? 14 : 12 }}>{decoded.emoji}</span>
      <span>{decoded.name}</span>
      <span style={{ fontSize: size === 'lg' ? 11 : 10, opacity: 0.85, fontWeight: 500 }}>
        {Math.round(mmr)}
      </span>
    </span>
  );
}

export default function RankBadge({ rankTier, leaderboardRank, source, style = {}, size = 'sm' }) {
  const decoded = decodeRankTier(rankTier);
  if (!decoded) return null;

  const color    = RANK_COLORS[decoded.tier] || '#aaa';
  const emoji    = RANK_EMOJIS[decoded.tier] || '?';
  const isImm    = decoded.tier === 8;
  const fontSize = size === 'lg' ? 13 : 11;
  const padding  = size === 'lg' ? '4px 10px' : '2px 7px';

  const label = isImm
    ? (leaderboardRank ? `Immortal #${leaderboardRank}` : 'Immortal')
    : `${decoded.name}${decoded.stars ? ` ${decoded.stars}` : ''}`;

  const sourceTitle = source === 'manual'
    ? 'Manually set'
    : source === 'gc'
    ? 'From Steam GC'
    : source === 'opendota'
    ? 'From OpenDota'
    : '';

  return (
    <span
      title={`${label}${sourceTitle ? ` (${sourceTitle})` : ''}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: `${color}18`,
        border: `1px solid ${color}55`,
        borderRadius: 8, padding, fontSize, fontWeight: 700,
        color, whiteSpace: 'nowrap', cursor: 'default',
        letterSpacing: 0.3,
        ...style,
      }}
    >
      <span style={{ fontSize: size === 'lg' ? 14 : 12 }}>{emoji}</span>
      <span>{label}</span>
      {!isImm && decoded.stars > 0 && (
        <StarDots count={decoded.stars} color={color} />
      )}
      {source === 'manual' && (
        <span style={{ fontSize: 9, opacity: 0.65, fontWeight: 400 }}>*</span>
      )}
    </span>
  );
}
