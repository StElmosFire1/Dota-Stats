// Task #314 — translate a stored PERF `perf_breakdown` JSON into a plain-English
// "why did you score this" view. Used by the post-match `Why you scored X`
// panel for the logged-in player.
//
// Input shape (from src/perf/perfService.js):
//   breakdown = {
//     position,                 // 1..5
//     raw,                      // weighted sum (0 = all-avg, 1 = all-elite)
//     scores: { kp, surv, gpm, xpm, lh, hd, td, vis, deward, stun, heal, win },
//     contributions: {...},     // score * weight per component
//     weights: {...},
//     source,                   // 'timeline_v1' or 'endgame_v1'
//     cap_applied,              // null or a PI cap
//   }
//
// Each component is reported with:
//   key, label (plain English), score (the normalised z-score: 0=avg, 1=elite,
//   negative=below avg), weight, contribution (weight*score), polarity
//   ('positive'|'neutral'|'negative'), and a short blurb. Callers pick the
//   top 3 positive and top 3 negative by absolute contribution.

const POSITION_NAMES = {
  1: 'Safelane Carry',
  2: 'Mid',
  3: 'Offlane',
  4: 'Soft Support',
  5: 'Hard Support',
};

const COMPONENT_LABELS = {
  kp:     'Kill participation',
  surv:   'Survival',
  gpm:    'Gold per minute',
  xpm:    'XP per minute',
  lh:     'Last hits',
  hd:     'Hero damage',
  td:     'Tower damage',
  vis:    'Vision (wards placed)',
  deward: 'Dewarding',
  stun:   'Stun duration',
  heal:   'Healing',
  win:    'Win bonus',
};

function _phrase(key, score) {
  // score: 0 ≈ average, 1 ≈ elite, can be slightly negative or above 1.
  const label = COMPONENT_LABELS[key] || key;
  if (key === 'win') {
    return score > 0 ? 'Bonus for winning the match' : 'No win bonus (your team lost)';
  }
  if (key === 'surv') {
    if (score >= 0.8) return 'Stayed alive — very few deaths';
    if (score >= 0.4) return 'Survived well — low death count';
    if (score >= 0.0) return 'Acceptable death count for your role';
    if (score >= -0.3) return 'Died a bit too often — feeding cost you here';
    return 'Heavy feeding hurt your score badly';
  }
  if (score >= 1.0)  return `Elite ${label.toLowerCase()} for your position`;
  if (score >= 0.5)  return `Strong ${label.toLowerCase()} for your position`;
  if (score >= 0.15) return `Above-average ${label.toLowerCase()} for your position`;
  if (score >= -0.15) return `Average ${label.toLowerCase()} for your position`;
  if (score >= -0.5) return `Below-average ${label.toLowerCase()} for your position`;
  return `Poor ${label.toLowerCase()} for your position`;
}

function _polarity(contribution) {
  if (contribution >= 0.015) return 'positive';
  if (contribution <= -0.015) return 'negative';
  return 'neutral';
}

// Build the structured explainer payload. Returns null when breakdown is
// missing or malformed.
function explainPerfBreakdown(breakdown) {
  if (!breakdown || typeof breakdown !== 'object') return null;
  const scores = breakdown.scores || {};
  const weights = breakdown.weights || {};
  const contributions = breakdown.contributions || {};
  const items = [];
  for (const key of Object.keys(COMPONENT_LABELS)) {
    if (!(key in scores)) continue;
    const score = Number(scores[key]) || 0;
    const weight = Number(weights[key]) || 0;
    // Prefer stored contribution; fall back to score*weight.
    const contribution = key in contributions
      ? Number(contributions[key]) || 0
      : score * weight;
    items.push({
      key,
      label: COMPONENT_LABELS[key],
      score,
      weight,
      contribution,
      polarity: _polarity(contribution),
      blurb: _phrase(key, score),
    });
  }

  // Top contributors are the largest positive contributions; biggest hurts
  // are the most-negative contributions. We pick up to 3 of each, skipping
  // components that contributed approximately zero (e.g. unused weights).
  const sortedDesc = [...items].sort((a, b) => b.contribution - a.contribution);
  const sortedAsc  = [...items].sort((a, b) => a.contribution - b.contribution);
  const helped = sortedDesc.filter(i => i.contribution > 0.005).slice(0, 3);
  const hurt   = sortedAsc.filter(i => i.contribution < -0.005).slice(0, 3);

  return {
    position: breakdown.position || null,
    positionName: POSITION_NAMES[breakdown.position] || null,
    raw: Number(breakdown.raw) || 0,
    source: breakdown.source || null,
    capApplied: breakdown.cap_applied || null,
    helped,
    hurt,
    components: items,
  };
}

module.exports = { explainPerfBreakdown, COMPONENT_LABELS, POSITION_NAMES };
