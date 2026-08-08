// Task #846 — Captain's Mode game logic. Pure functions only (no React) so
// the page component stays declarative and the math is easy to unit-test.
//
// The dataset comes from /api/captain-mode/hero-meta (OpenDota /heroStats,
// server-cached): per-hero pub win rate, pub pick rate, pro pick/ban rate,
// primary attribute, attack type and role tags. Everything below — counter
// scoring, AI drafting, strategy coherence, the match simulator — derives
// from that real dataset plus documented heuristics.

// ---------------------------------------------------------------------------
// CM draft order — the real Captain's Mode sequence (post-7.33, 24 actions:
// 14 bans + 10 picks in three phases). Team 0 (the player, Radiant) has
// first pick; team 1 is the AI captain (Dire).
//   Phase 1: 7 bans (0,1,0,1,0,1,0) then 2 picks (0,1)
//   Phase 2: 3 bans (0,1,0)          then 6 picks (1,0,1,0,1,0)
//   Phase 3: 4 bans (0,1,0,1)        then 2 picks (1,0)
export const CM_ORDER = [
  ...[0, 1, 0, 1, 0, 1, 0].map((team) => ({ team, action: 'ban', phase: 1 })),
  ...[0, 1].map((team) => ({ team, action: 'pick', phase: 1 })),
  ...[0, 1, 0].map((team) => ({ team, action: 'ban', phase: 2 })),
  ...[1, 0, 1, 0, 1, 0].map((team) => ({ team, action: 'pick', phase: 2 })),
  ...[0, 1, 0, 1].map((team) => ({ team, action: 'ban', phase: 3 })),
  ...[1, 0].map((team) => ({ team, action: 'pick', phase: 3 })),
];

export const ROLE_LABELS = ['Carry', 'Mid', 'Offlane', 'Soft Sup', 'Hard Sup'];

export const HERO_IMG = (slug) =>
  `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`;

// ---------------------------------------------------------------------------
// Derived hero descriptors

// Power curve (early/mid/late, 0-100) estimated from role tags + attack type.
// Documented heuristic: OpenDota has no per-minute winrate curve in
// /heroStats, so we approximate the classic archetypes.
export function powerCurve(hero) {
  const r = new Set(hero.roles || []);
  let early = 40;
  let mid = 55;
  let late = 45;
  if (r.has('Carry')) { early -= 20; late += 35; }
  if (r.has('Nuker')) { early += 15; mid += 15; late -= 10; }
  if (r.has('Support')) { early += 25; late -= 20; }
  if (r.has('Pusher')) { mid += 20; }
  if (r.has('Initiator')) { mid += 15; }
  if (r.has('Durable')) { mid += 10; late += 5; }
  if (r.has('Disabler')) { early += 5; mid += 5; }
  if (r.has('Escape')) { late += 10; }
  const clamp = (v) => Math.max(5, Math.min(98, Math.round(v)));
  return [clamp(early), clamp(mid), clamp(late)];
}

export function powerSpike(hero) {
  const [e, m, l] = powerCurve(hero);
  if (l >= m && l >= e) return 'Late Game';
  if (m >= e) return 'Mid Game';
  return 'Early Game';
}

export function heroIdentity(hero) {
  const r = new Set(hero.roles || []);
  if (r.has('Pusher')) return 'Siege';
  if (r.has('Carry') && r.has('Escape')) return 'Split-Push';
  if (r.has('Initiator')) return 'Teamfight';
  if (r.has('Nuker') && r.has('Disabler')) return 'Pickoff';
  if (r.has('Nuker')) return 'Burst';
  if (r.has('Support')) return 'Lane Dominator';
  if (r.has('Durable')) return 'Frontline';
  return 'Tempo Control';
}

// Which of the five in-game positions a hero most plausibly fills.
export function likelyPositions(hero) {
  const r = new Set(hero.roles || []);
  const pos = [];
  if (r.has('Carry')) pos.push('Carry');
  if (r.has('Nuker') || r.has('Escape')) pos.push('Mid');
  if (r.has('Durable') || r.has('Initiator')) pos.push('Offlane');
  if (r.has('Support')) pos.push('Soft Sup', 'Hard Sup');
  if (r.has('Disabler') && !r.has('Carry')) pos.push('Soft Sup');
  return pos.length ? Array.from(new Set(pos)) : ['Mid'];
}

// ---------------------------------------------------------------------------
// Draft scoring

// Baseline desirability: pub winrate deviation from 50% (weighted heavily —
// it is the real signal) plus a dash of pro pick/ban rate (contested = good).
export function baseScore(hero) {
  return (hero.winRate - 0.5) * 200 + hero.pbRate * 10;
}

// Counter score of `hero` against a set of enemy heroes. Heuristic matchup
// model layered on the real winrate data:
//  - Disablers counter Escape cores; Durables blunt Nukers; Nukers burst
//    squishy Supports; late-game Carries out-scale early lineups, etc.
const COUNTER_EDGES = [
  ['Disabler', 'Escape', 4],
  ['Durable', 'Nuker', 3],
  ['Nuker', 'Support', 3],
  ['Pusher', 'Jungler', 2],
  ['Initiator', 'Carry', 3],
  ['Silencer', 'Nuker', 2],
];
export function counterScore(hero, enemies) {
  let s = 0;
  const mine = new Set(hero.roles || []);
  const [, , myLate] = powerCurve(hero);
  for (const e of enemies) {
    const theirs = new Set(e.roles || []);
    for (const [a, b, w] of COUNTER_EDGES) {
      if (mine.has(a) && theirs.has(b)) s += w;
      if (theirs.has(a) && mine.has(b)) s -= w;
    }
    // Scaling edge: a hero that spikes later than the enemy average wins
    // the long game.
    const [, , theirLate] = powerCurve(e);
    s += (myLate - theirLate) / 40;
  }
  return s;
}

// Synergy with allies: reward role coverage (a team wants exactly one of
// each position), penalise duplicated cores.
export function synergyScore(hero, allies) {
  const covered = new Set();
  for (const a of allies) likelyPositions(a).forEach((p) => covered.add(p));
  const mine = likelyPositions(hero);
  let s = 0;
  let fillsNew = false;
  for (const p of mine) if (!covered.has(p)) { fillsNew = true; break; }
  s += fillsNew ? 4 : -3;
  const coreCount = allies.filter((a) => (a.roles || []).includes('Carry')).length;
  if ((hero.roles || []).includes('Carry') && coreCount >= 2) s -= 4;
  const supCount = allies.filter((a) => (a.roles || []).includes('Support')).length;
  if ((hero.roles || []).includes('Support') && supCount >= 2) s -= 3;
  return s;
}

export function pickValue(hero, allies, enemies) {
  // Counter weight deliberately modest: the side picking second always gets
  // to respond, and a heavier weight makes the responding team win the draft
  // almost every time (measured ~30 vs ~58 average draft fit in AI-vs-AI
  // playouts at weight 2). At 1.2 the same playouts land near parity.
  return baseScore(hero) + counterScore(hero, enemies) * 1.2 + synergyScore(hero, allies) * 2;
}

// A ban targets what the OTHER side would most like to pick.
export function banValue(hero, myPicks, enemyPicks) {
  return pickValue(hero, enemyPicks, myPicks);
}

// ---------------------------------------------------------------------------
// AI captain

// The AI evaluates every available hero and takes the best ban/pick with a
// little top-N randomness so repeated runs don't play out identically.
export function aiChoose(action, available, aiPicks, userPicks, rng = Math.random) {
  const scored = available
    .map((h) => ({
      h,
      v: action === 'pick'
        ? pickValue(h, aiPicks, userPicks)
        : banValue(h, aiPicks, userPicks),
    }))
    .sort((a, b) => b.v - a.v);
  const n = Math.min(4, scored.length);
  const idx = Math.floor(Math.pow(rng(), 2) * n); // biased toward the top
  return scored[idx].h;
}

// Suggestions surfaced on the player's hero grid (top picks / top bans).
export function suggestions(action, available, userPicks, aiPicks, count = 3) {
  return available
    .map((h) => ({
      h,
      v: action === 'pick'
        ? pickValue(h, userPicks, aiPicks)
        : banValue(h, userPicks, aiPicks),
    }))
    .sort((a, b) => b.v - a.v)
    .slice(0, count)
    .map((x) => x.h.id);
}

// ---------------------------------------------------------------------------
// Strategy

export const STRATEGY_SLIDERS = [
  { key: 'tempo', label: 'Tempo', left: 'Early', right: 'Late' },
  { key: 'risk', label: 'Risk', left: 'Aggressive', right: 'Passive' },
  { key: 'map', label: 'Map', left: 'Fight', right: 'Split' },
  { key: 'structure', label: 'Structure', left: 'Gank', right: 'Farm' },
  { key: 'wincon', label: 'Win Condition', left: 'Rosh', right: 'Siege' },
  { key: 'vision', label: 'Vision', left: 'Wards', right: 'Smokes' },
];

export const DEFAULT_PLAN = { tempo: 0, risk: 0, map: 0, structure: 0, wincon: 0, vision: 0 };

// Draft Fit: how strong the drafted five is against the enemy five (0-100).
export function draftFit(myPicks, enemyPicks) {
  let s = 50;
  for (const h of myPicks) {
    s += (h.winRate - 0.5) * 60;
    s += counterScore(h, enemyPicks) * 0.5;
    s += synergyScore(h, myPicks.filter((x) => x !== h)) * 0.5;
  }
  return Math.max(5, Math.min(95, Math.round(s)));
}

// Coherence: does the win plan match what the draft is built for? A team of
// late-game carries with an "end early / fight" plan scores low.
export function planCoherence(myPicks, plan) {
  if (!myPicks.length) return 50;
  let early = 0; let late = 0; let fight = 0; let split = 0;
  for (const h of myPicks) {
    const [e, , l] = powerCurve(h);
    early += e; late += l;
    const id = heroIdentity(h);
    if (id === 'Teamfight' || id === 'Pickoff' || id === 'Burst') fight += 1;
    if (id === 'Split-Push' || id === 'Siege') split += 1;
  }
  early /= myPicks.length; late /= myPicks.length;
  // Team's natural tempo, -50 (early) .. +50 (late)
  const naturalTempo = ((late - early) / 100) * 50;
  const naturalMap = ((split - fight) / myPicks.length) * 50;
  let s = 100;
  s -= Math.abs(plan.tempo - naturalTempo) * 0.55;
  s -= Math.abs(plan.map - naturalMap) * 0.35;
  // Aggressive + late-game is a mild contradiction; passive + early too.
  s -= Math.max(0, -plan.risk * (plan.tempo / 50)) * 0.3;
  return Math.max(10, Math.min(98, Math.round(s)));
}

// ---------------------------------------------------------------------------
// Simulator

// Deterministic PRNG so a given (draft, plan, seed) replays identically.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EVENT_POOL = {
  good: [
    'First blood secured {lane}',
    'Won the lane trade — enemy carry starved',
    'Pickoff on the enemy mid · tempo swing',
    'Smoke gank connects · 2 kills',
    'Roshan secured · Aegis to the carry',
    'Tier-2 tower melts under the timing push',
    'Team wipe at the {lane} fight',
    'Enemy buybacks burned · map control ours',
  ],
  bad: [
    'Caught out {lane} · enemy punish',
    'Failed smoke · walked into wards',
    'High ground siege stalled · reset',
    'Enemy snowball core hits its timing',
    'Roshan contested and lost',
    'Split-pusher takes two towers unanswered',
  ],
  neutral: [
    'Bounty runes traded 2-2',
    'Even laning phase · farm split evenly',
    'Wards traded across the river',
    'Both teams posture at the outpost',
  ],
};
const LANES = ['top', 'mid', 'bot'];

// Simulate the match. Returns win prob, result, event log, verdict, and the
// captain-rating delta.
export function simulateMatch({ myPicks, enemyPicks, plan, seed }) {
  const rng = mulberry32(seed);
  const fit = draftFit(myPicks, enemyPicks);
  const coherence = planCoherence(myPicks, plan);
  const enemyFit = draftFit(enemyPicks, myPicks);
  // Logistic on the draft edge, nudged by plan coherence.
  const edge = (fit - enemyFit) * 0.05 + (coherence - 60) * 0.02;
  const winProb = 1 / (1 + Math.exp(-edge));
  const won = rng() < winProb;

  // Discipline: how often the sim stayed "on plan" — riskier plans wobble more.
  const discipline = Math.max(35, Math.min(96, Math.round(
    72 + plan.risk * 0.15 + (coherence - 60) * 0.3 + (rng() - 0.5) * 12
  )));

  // Match length driven by the plan tempo (early plans end faster).
  const duration = Math.round(30 + plan.tempo * 0.12 + (rng() - 0.5) * 10 + (won ? -2 : 3));
  const events = [{ time: 0, text: 'Match started', type: 'neutral' }];
  const nEvents = 9;
  let goodShare = won ? 0.62 : 0.38;
  goodShare += (fit - enemyFit) * 0.003;
  let pivotal = null;
  for (let i = 1; i <= nEvents; i++) {
    const t = Math.round((duration * i) / (nEvents + 1) + (rng() - 0.5) * 3);
    const roll = rng();
    let type; let pool;
    if (roll < goodShare * 0.75) { type = rng() < 0.35 ? 'payoff' : 'on-plan'; pool = 'good'; }
    else if (roll < goodShare * 0.75 + 0.2) { type = 'neutral'; pool = 'neutral'; }
    else { type = rng() < 0.4 ? 'stress' : 'off-script'; pool = 'bad'; }
    const list = EVENT_POOL[pool];
    const text = list[Math.floor(rng() * list.length)]
      .replace('{lane}', LANES[Math.floor(rng() * LANES.length)]);
    if ((type === 'off-script' || type === 'payoff') && (pivotal === null || rng() < 0.4)) pivotal = t;
    events.push({ time: Math.max(1, t), text, type });
  }
  events.push({
    time: duration,
    text: won ? 'GG · Radiant Victory' : 'GG · Dire Victory',
    type: won ? 'payoff' : 'off-script',
  });

  // Rating delta: outcome dominates, draft + plan quality soften/boost it.
  const delta = Math.round(
    (won ? 18 : -14) +
    (fit - enemyFit) * 0.15 +
    (coherence - 60) * 0.08 +
    (discipline - 70) * 0.05
  );

  const verdict = won
    ? (fit >= enemyFit
      ? 'Draft advantage converted cleanly. The plan held together when it mattered.'
      : 'Out-drafted but out-executed — discipline carried a losing lineup over the line.')
    : (fit >= enemyFit
      ? 'Draft was ahead but execution slipped. Off-script errors were punished heavily.'
      : 'Out-drafted from the ban phase. The enemy captain read your priorities.');

  return {
    won, winProb: Math.round(winProb * 100), duration,
    fit, enemyFit, coherence, discipline,
    events, pivotal, verdict, delta,
    xp: Math.max(20, 60 + (won ? 60 : 0) + Math.round((coherence - 50) / 2)),
  };
}

// ---------------------------------------------------------------------------
// Captain rating persistence (solo-vs-AI, local to this browser).

const RATING_KEY = 'oi-captain-mode-rating';
const HISTORY_KEY = 'oi-captain-mode-history';

export function loadRating() {
  try {
    const v = Number(localStorage.getItem(RATING_KEY));
    return Number.isFinite(v) && v > 0 ? v : 1000;
  } catch { return 1000; }
}

export function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

export function recordResult(delta, won) {
  const rating = Math.max(0, loadRating() + delta);
  try {
    localStorage.setItem(RATING_KEY, String(rating));
    const hist = loadHistory();
    hist.unshift({ at: Date.now(), delta, won, rating });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, 50)));
  } catch { /* private mode — rating just doesn't persist */ }
  return rating;
}
