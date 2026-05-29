// Task #450 — Inhouse coin betting (full markets).
//
// Pure, DB-free engine config for the generic markets system. Each market
// "type" is an adapter that knows:
//   - title         : human label for the market
//   - lockTrigger   : when the market stops accepting bets
//                     ('lobby_launch' | 'match_start' | 'first_blood')
//   - buildOutcomes : (ctx) => [{ key, label, sortOrder }]  (static or
//                     player-derived). Returns null/[] if the market can't
//                     be built for this match (e.g. no players captured).
//   - settle        : (ctx) => winning outcome key | null. null means VOID
//                     (refund everyone) — used when the data needed to grade
//                     the market is missing.
//
// Keeping this module free of any DB/IO import means the payout maths and the
// settlement rules can be unit-tested in isolation, and the DB layer
// (src/db/index.js) just calls into it.
//
// Lock triggers vs reality: the live Game Coordinator feed doesn't surface
// first-blood, so — exactly like the Task #449 prediction window — markets
// open on `matchIdCaptured` (post-draft) and lock on `matchStarted`
// (lobby launch / match start). The Winner market's first-blood lock is
// driven by the OpenDota first-blood poll that already runs for predictions.

// ---------------------------------------------------------------------------
// Economy constants. All values are in coins (v6.79 in-app currency — never
// real money). Tuned so betting is an engagement loop, not a coin faucet:
// stakes are bounded per-market and per-match, and a daily net-loss circuit
// breaker stops a tilting player from haemorrhaging their balance.
// ---------------------------------------------------------------------------
const BET_MIN_STAKE = 10;
const BET_MAX_STAKE_PER_MARKET = 500;   // cap on a single bet
const BET_MAX_STAKE_PER_MATCH = 1000;   // sum of a user's stakes across one match
const BET_DAILY_LOSS_CAP = 2000;        // once net coin loss from settled bets in a
                                        // day reaches this, new bets are blocked

// Duration buckets (minutes). Boundaries are inclusive-low / exclusive-high.
const DURATION_BUCKETS = [
  { key: 'd_lt25',   label: 'Under 25 min', minSec: 0,        maxSec: 25 * 60 },
  { key: 'd_25_35',  label: '25–35 min',    minSec: 25 * 60,  maxSec: 35 * 60 },
  { key: 'd_35_45',  label: '35–45 min',    minSec: 35 * 60,  maxSec: 45 * 60 },
  { key: 'd_45plus', label: '45 min+',      minSec: 45 * 60,  maxSec: Infinity },
];

// Total-kills buckets (combined kills, both teams).
const KILLS_BUCKETS = [
  { key: 'k_lt30',   label: 'Under 30',  min: 0,  max: 30 },
  { key: 'k_30_45',  label: '30–44',     min: 30, max: 45 },
  { key: 'k_45_60',  label: '45–59',     min: 45, max: 60 },
  { key: 'k_60plus', label: '60+',       min: 60, max: Infinity },
];

function bucketFor(value, buckets, minField, maxField) {
  for (const b of buckets) {
    const lo = b[minField];
    const hi = b[maxField];
    if (value >= lo && value < hi) return b.key;
  }
  return null;
}

// Normalise whatever first_blood_chain.fbTeam looks like into 'radiant'/'dire'.
function normaliseTeam(v) {
  if (v === 'radiant' || v === 'dire') return v;
  if (v === 0 || v === '0') return 'radiant';
  if (v === 1 || v === '1') return 'dire';
  return null;
}

// ---------------------------------------------------------------------------
// Settlement context shape (built by the DB layer, consumed by settle()):
//   {
//     radiantWin   : boolean | null,
//     durationSec  : number | null,
//     firstBloodTeam: 'radiant' | 'dire' | null,
//     totalKills   : number | null,
//     mvpAccountId : number | null,     // highest-perf player
//     players      : [{ accountId, name, team }]   // the 10 drafted players
//   }
// ---------------------------------------------------------------------------

const MARKET_TYPES = {
  winner: {
    title: 'Match Winner',
    lockTrigger: 'first_blood',
    buildOutcomes: () => ([
      { key: 'radiant', label: 'Radiant', sortOrder: 0 },
      { key: 'dire',    label: 'Dire',    sortOrder: 1 },
    ]),
    settle: (ctx) => {
      if (typeof ctx.radiantWin !== 'boolean') return null;
      return ctx.radiantWin ? 'radiant' : 'dire';
    },
  },

  first_blood: {
    title: 'First Blood',
    lockTrigger: 'lobby_launch',
    buildOutcomes: () => ([
      { key: 'radiant', label: 'Radiant', sortOrder: 0 },
      { key: 'dire',    label: 'Dire',    sortOrder: 1 },
    ]),
    settle: (ctx) => normaliseTeam(ctx.firstBloodTeam),
  },

  mvp: {
    title: 'Match MVP',
    lockTrigger: 'lobby_launch',
    buildOutcomes: (ctx) => {
      const players = (ctx && ctx.players) || [];
      if (players.length < 2) return [];
      return players
        .filter(p => p && Number(p.accountId) > 0)
        .map((p, i) => ({
          key: String(p.accountId),
          label: p.name || `Player ${p.accountId}`,
          sortOrder: i,
        }));
    },
    settle: (ctx) => {
      if (!ctx.mvpAccountId) return null;
      return String(ctx.mvpAccountId);
    },
  },

  duration: {
    title: 'Match Duration',
    lockTrigger: 'match_start',
    buildOutcomes: () => DURATION_BUCKETS.map((b, i) => ({
      key: b.key, label: b.label, sortOrder: i,
    })),
    settle: (ctx) => {
      if (!Number.isFinite(ctx.durationSec) || ctx.durationSec <= 0) return null;
      return bucketFor(ctx.durationSec, DURATION_BUCKETS, 'minSec', 'maxSec');
    },
  },

  total_kills: {
    title: 'Total Kills',
    lockTrigger: 'match_start',
    buildOutcomes: () => KILLS_BUCKETS.map((b, i) => ({
      key: b.key, label: b.label, sortOrder: i,
    })),
    settle: (ctx) => {
      if (!Number.isFinite(ctx.totalKills) || ctx.totalKills < 0) return null;
      return bucketFor(ctx.totalKills, KILLS_BUCKETS, 'min', 'max');
    },
  },
};

// Standard markets opened automatically when a lobby locks.
const DEFAULT_MARKET_TYPES = ['winner', 'first_blood', 'mvp', 'duration', 'total_kills'];

// Which lock_trigger fires on which lifecycle event. matchStarted covers both
// 'lobby_launch' and 'match_start' (we can't observe them separately); the
// first-blood OpenDota poll covers 'first_blood'.
const TRIGGERS_ON_MATCH_START = ['lobby_launch', 'match_start'];
const TRIGGERS_ON_FIRST_BLOOD = ['first_blood'];

// ---------------------------------------------------------------------------
// Pari-mutuel payout. Given the per-outcome staked pools and the winning
// outcome key, returns a map of outcomeKey -> total payout for that outcome's
// pool. Winners split the ENTIRE pool (their own stakes + the losing pools)
// pro-rata to their stake. Edge cases:
//   - No bets on the winning outcome  -> refund everyone (return stakes 1:1).
//   - Only the winning outcome had bets -> everyone gets their stake back.
// This is play money, so we never let the house silently swallow coins when
// there's nobody to pay: a no-winner market refunds rather than burns.
//
// `pools` : { [outcomeKey]: totalStakeInt }
// returns : { winnerPoolFactor, refundAll }  — the DB layer applies these
//           per-bet so rounding remainders stay in the house consistently.
// ---------------------------------------------------------------------------
function computePayoutPlan(pools, winningKey) {
  const totalPool = Object.values(pools).reduce((s, v) => s + (Number(v) || 0), 0);
  const winningPool = Number(pools[winningKey]) || 0;
  if (totalPool <= 0) return { refundAll: true, winnerPoolFactor: 0, totalPool: 0, winningPool: 0 };
  if (winningPool <= 0) {
    // Nobody backed the winning outcome — refund all stakes.
    return { refundAll: true, winnerPoolFactor: 1, totalPool, winningPool: 0 };
  }
  // Each winning coin returns (totalPool / winningPool) coins.
  return {
    refundAll: false,
    winnerPoolFactor: totalPool / winningPool,
    totalPool,
    winningPool,
  };
}

// Per-bet payout given the plan. Floors to an int (no fractional coins);
// rounding remainder stays in the house.
function payoutForBet(plan, stake, isWinner) {
  if (plan.refundAll) return Math.floor(stake); // stake returned
  if (!isWinner) return 0;
  return Math.floor(stake * plan.winnerPoolFactor);
}

module.exports = {
  BET_MIN_STAKE,
  BET_MAX_STAKE_PER_MARKET,
  BET_MAX_STAKE_PER_MATCH,
  BET_DAILY_LOSS_CAP,
  DURATION_BUCKETS,
  KILLS_BUCKETS,
  MARKET_TYPES,
  DEFAULT_MARKET_TYPES,
  TRIGGERS_ON_MATCH_START,
  TRIGGERS_ON_FIRST_BLOOD,
  bucketFor,
  normaliseTeam,
  computePayoutPlan,
  payoutForBet,
};
