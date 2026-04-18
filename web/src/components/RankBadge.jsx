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
