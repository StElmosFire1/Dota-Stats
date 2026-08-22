// Community-edition inhouse ranks use the same 5000-centred MMR scale as the
// rating engine. Gaben is positional: only the #1 leaderboard row receives it.
export const MMR_TIERS = [
  { name: 'Gaben',         emoji: '🎩', description: 'A personal friend of the man himself. Reserved for the #1 player.', min: Infinity, leaderOnly: true, color: '#FFD700', bg: 'rgba(255,215,0,0.12)', border: 'rgba(255,215,0,0.45)' },
  { name: 'Prime Pick',    emoji: '🎯', description: 'Everyone wants you on their team.',                                  min: 7000, color: '#CE93D8', bg: 'rgba(156,39,176,0.15)', border: 'rgba(156,39,176,0.45)' },
  { name: 'Apex',          emoji: '⚡', description: 'Operating at peak Dota capacity.',                                   min: 6500, color: '#90CAF9', bg: 'rgba(33,150,243,0.12)', border: 'rgba(33,150,243,0.4)' },
  { name: 'Veteran',       emoji: '🎖️', description: 'Seen things. Done things. Knows things.',                           min: 6200, color: '#80DEEA', bg: 'rgba(0,188,212,0.12)', border: 'rgba(0,188,212,0.4)' },
  { name: 'Solid',         emoji: '💪', description: 'Reliable. People can actually count on you.',                       min: 5600, color: '#A5D6A7', bg: 'rgba(76,175,80,0.12)', border: 'rgba(76,175,80,0.4)' },
  { name: 'Average',       emoji: '😐', description: 'Not bad. Not good. Just... there.',                                  min: 5000, color: 'var(--text-secondary)', bg: 'var(--bg-hover)', border: 'var(--border)' },
  { name: 'NPC',           emoji: '🤖', description: 'Standing in the trees doing nothing.',                              min: 4700, color: 'var(--text-muted)', bg: 'var(--bg-hover)', border: 'var(--border)' },
  { name: 'Anchor',        emoji: '⚓', description: 'Dragging your team straight to the bottom.',                         min: 4400, color: '#FFCC80', bg: 'rgba(255,152,0,0.12)', border: 'rgba(255,152,0,0.4)' },
  { name: 'Neutral Creep', emoji: '🐗', description: 'You exist. The jungle thanks you for feeding it.',                   min: 4100, color: '#FFAB91', bg: 'rgba(255,87,34,0.12)', border: 'rgba(255,87,34,0.35)' },
  { name: 'Observer Ward', emoji: '👁️', description: 'Placed. Ignored. Immediately dewarded.',                            min: 3800, color: '#EF9A9A', bg: 'rgba(244,67,54,0.10)', border: 'rgba(244,67,54,0.35)' },
  { name: 'Position 6',    emoji: '🗺️', description: "The position that doesn't exist — neither do your contributions.", min: 0, color: '#EF9A9A', bg: 'rgba(244,67,54,0.08)', border: 'rgba(244,67,54,0.3)' },
];

export function getTier(mmr, { isLeader = false } = {}) {
  if (isLeader) return MMR_TIERS.find(t => t.leaderOnly) || MMR_TIERS[0];
  const value = Number(mmr);
  if (!Number.isFinite(value)) return MMR_TIERS[MMR_TIERS.length - 1];
  for (const tier of MMR_TIERS) {
    if (!tier.leaderOnly && value >= tier.min) return tier;
  }
  return MMR_TIERS[MMR_TIERS.length - 1];
}