// Task #743 — Shared plain-English summary for community-challenge scoring.
// Single source of truth for the metric labels and the human-readable rule
// sentence used by the admin builder (AdminPanel), the Home tile
// (CommunityChallengeTile) and the leaderboard page (ChallengeDetail).

export const CHALLENGE_METRICS = [
  { value: 'kills',        label: 'Total kills' },
  { value: 'wins',         label: 'Wins' },
  { value: 'matches',      label: 'Matches played' },
  { value: 'perf',         label: 'PERF rating' },
  { value: 'kda',          label: 'KDA' },
  { value: 'assists',      label: 'Assists' },
  { value: 'deaths',       label: 'Deaths' },
  { value: 'gpm',          label: 'Gold per minute (GPM)' },
  { value: 'xpm',          label: 'XP per minute (XPM)' },
  { value: 'last_hits',    label: 'Last hits' },
  { value: 'hero_damage',  label: 'Hero damage' },
  { value: 'tower_damage', label: 'Tower damage' },
  { value: 'hero_healing', label: 'Hero healing' },
];

// Normalise a stored scoring DSL ({ metric, agg, filter: { team, position, won } })
// into the flat control shape the summary builders read.
export function challengeDslToControls(scoring) {
  const s = scoring || {};
  const rawPos = s.filter?.position;
  const positions = Array.isArray(rawPos) ? rawPos : (rawPos != null ? [rawPos] : []);
  return {
    metric: s.metric || 'kills',
    agg: s.agg || 'sum',
    filterTeam: s.filter?.team || '',
    filterPositions: positions.map(Number).filter(Number.isFinite),
    filterWon: !!s.filter?.won,
  };
}

function metricLabel(metric) {
  return (CHALLENGE_METRICS.find(m => m.value === metric)?.label || metric || '').toLowerCase();
}

// Full sentence, e.g. "Ranks players by their best single-match perf rating,
// in positions 4, 5, counting only wins."
export function challengeSummaryFromControls({ metric, agg, filterTeam, filterPositions, filterWon }) {
  const mLabel = metricLabel(metric);
  let phrase;
  if (agg === 'sum') phrase = `the sum of their ${mLabel} across all matches`;
  else if (agg === 'max') phrase = `their best single-match ${mLabel}`;
  else if (agg === 'count') phrase = 'the number of matches they played';
  else phrase = `their ${mLabel}`;
  const parts = [];
  if (filterTeam) parts.push(`playing as ${filterTeam}`);
  if (filterPositions && filterPositions.length > 0) {
    const sorted = [...filterPositions].sort((a, b) => a - b);
    parts.push(`in position${sorted.length > 1 ? 's' : ''} ${sorted.join(', ')}`);
  }
  if (filterWon) parts.push('counting only wins');
  let sentence = `Ranks players by ${phrase}`;
  if (parts.length) sentence += `, ${parts.join(', ')}`;
  return sentence + '.';
}

// Short phrase for compact surfaces (Home tile), e.g. "best single-match perf
// rating · pos 4, 5 · wins only".
export function challengeSummaryShortFromControls({ metric, agg, filterTeam, filterPositions, filterWon }) {
  const mLabel = metricLabel(metric);
  let base;
  if (agg === 'sum') base = `total ${mLabel}`;
  else if (agg === 'max') base = `best single-match ${mLabel}`;
  else if (agg === 'count') base = 'matches played';
  else base = mLabel;
  const tags = [];
  if (filterTeam) tags.push(filterTeam);
  if (filterPositions && filterPositions.length > 0) {
    const sorted = [...filterPositions].sort((a, b) => a - b);
    tags.push(`pos ${sorted.join(', ')}`);
  }
  if (filterWon) tags.push('wins only');
  return tags.length ? `${base} · ${tags.join(' · ')}` : base;
}

// Convenience wrappers that take the raw stored scoring DSL directly.
export function challengeSummary(scoring) {
  if (!scoring || typeof scoring !== 'object') return '';
  return challengeSummaryFromControls(challengeDslToControls(scoring));
}

export function challengeSummaryShort(scoring) {
  if (!scoring || typeof scoring !== 'object') return '';
  return challengeSummaryShortFromControls(challengeDslToControls(scoring));
}
