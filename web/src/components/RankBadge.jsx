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

// ── Heraldic MMR Badge System (v5.82) ────────────────────────────────────────
// Heraldic names matching the leaderboard ladder (King → Peasant). King is
// reserved for the #1 leaderboard player only — every other MMR maxes out at
// Warlord regardless of how high. Thresholds are spread to span the full
// realistic inhouse MMR range (start ~5000, ceiling ~8000+) so the ladder
// actually distributes players instead of dumping everyone into the top tier.
const MMR_BADGE_TIERS = [
  { tier: 9, name: 'King',       floor: 999999, color: '#f5d97a', emoji: '👑', leaderOnly: true },
  { tier: 8, name: 'Warlord',    floor: 7000, color: '#e0b56b', emoji: '🪓' },
  { tier: 7, name: 'Paladin',    floor: 6500, color: '#d4b878', emoji: '✨' },
  { tier: 6, name: 'Templar',    floor: 6200, color: '#c9c9d9', emoji: '⚔️' },
  { tier: 5, name: 'Knight',     floor: 5900, color: '#b8b8c8', emoji: '🛡️' },
  { tier: 4, name: 'Footman',    floor: 5600, color: '#9aa0b0', emoji: '🗡️' },
  { tier: 3, name: 'Squire',     floor: 5300, color: '#8a8a9a', emoji: '🐎' },
  { tier: 2, name: 'Apprentice', floor: 5000, color: '#c5a975', emoji: '📜' },
  { tier: 1, name: 'Outlaw',     floor: 4500, color: '#EF9A9A', emoji: '🏴' },
  { tier: 0, name: 'Vagabond',   floor: 4000, color: '#FFAB91', emoji: '🥾' },
  { tier: -1, name: 'Peasant',   floor: 0,    color: '#EF9A9A', emoji: '🌾' },
];

export function decodeMmrBadge(mmr, { isLeader = false } = {}) {
  if (mmr == null || isNaN(mmr)) return null;
  const m = Number(mmr);
  if (isLeader) {
    return MMR_BADGE_TIERS.find(t => t.name === 'King') || null;
  }
  // Skip leader-only tiers when the player isn't the #1.
  for (const t of MMR_BADGE_TIERS) {
    if (t.leaderOnly) continue;
    if (m >= t.floor) return t;
  }
  return MMR_BADGE_TIERS[MMR_BADGE_TIERS.length - 1];
}

// Compact MMR-based badge. Render unconditionally — caller is responsible for
// gating on the `new_rank_theme` feature flag so the legacy Dota rank badge
// stays the source of truth until the rank-theme refresh ships.
//
// `isLeader` (v5.82) — when true, the badge promotes to "King" regardless of
// raw MMR. Caller is responsible for determining leaderboard position.
export function MmrBadge({ mmr, isLeader = false, style = {}, size = 'sm' }) {
  const decoded = decodeMmrBadge(mmr, { isLeader });
  if (!decoded) return null;
  const fontSize = size === 'lg' ? 13 : 11;
  const padding  = size === 'lg' ? '4px 10px' : '2px 7px';
  const titleSuffix = isLeader ? ' — Server #1' : '';
  return (
    <span
      title={`${decoded.name} · ${Math.round(mmr)} MMR${titleSuffix}`}
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
