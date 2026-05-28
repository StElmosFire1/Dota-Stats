// Task #441 — Weekly Rivals auto-pairing.
//
// Pure pairing engine — no DB, no IO. Given a list of eligible players
// (each with { accountId, mmr, heroes: Set<number>, radiantGames, direGames })
// produce a list of [a, b] pairs such that:
//
//   * |mmr(a) - mmr(b)| <= MMR_WINDOW (default 150)
//   * neither account is in the exemption set
//   * each player appears in at most one pair
//
// Tie-breaking: among candidates within the MMR window, prefer the one
// with the highest blended score:
//   score = HERO_OVERLAP_WEIGHT * heroOverlapJaccard(a, b)
//         + SIDE_BALANCE_WEIGHT * sideBalanceComplement(a, b)
//         - MMR_PENALTY * |mmr(a) - mmr(b)| / MMR_WINDOW
//
// Greedy: sort players by MMR, then for each unpaired player walk
// outwards in MMR order, score each unpaired window-eligible candidate,
// and pick the best. Greedy is optimal-enough for a weekly social
// pairing and avoids the O(n^3) cost of true min-weight matching on a
// list that will sit comfortably in the low hundreds for years.

const MMR_WINDOW = 150;
const HERO_OVERLAP_WEIGHT = 1.0;
const SIDE_BALANCE_WEIGHT = 0.5;
const MMR_PENALTY = 0.25;

function heroOverlapJaccard(a, b) {
  const A = a.heroes instanceof Set ? a.heroes : new Set(a.heroes || []);
  const B = b.heroes instanceof Set ? b.heroes : new Set(b.heroes || []);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const h of A) if (B.has(h)) inter++;
  const union = A.size + B.size - inter;
  return union > 0 ? inter / union : 0;
}

// 1.0 when both players have a perfectly even radiant/dire split over
// the lookback window, 0 when both played a single side exclusively.
// Treats "no games" as neutral (0.5).
function sideBalanceComplement(a, b) {
  const ratio = (p) => {
    const r = p.radiantGames || 0;
    const d = p.direGames || 0;
    if (r + d === 0) return 0.5;
    return r / (r + d);
  };
  const ra = ratio(a);
  const rb = ratio(b);
  // distance from 0.5 (where 0.5 = perfectly balanced).
  const da = Math.abs(ra - 0.5);
  const db = Math.abs(rb - 0.5);
  // average imbalance, inverted.
  return 1 - ((da + db) / 1.0); // da,db ∈ [0, 0.5]; avg ∈ [0, 0.5]
}

function pairScore(a, b, mmrWindow) {
  const mmrDiff = Math.abs((a.mmr || 0) - (b.mmr || 0));
  return (
    HERO_OVERLAP_WEIGHT * heroOverlapJaccard(a, b)
    + SIDE_BALANCE_WEIGHT * sideBalanceComplement(a, b)
    - MMR_PENALTY * (mmrDiff / mmrWindow)
  );
}

function pairPlayers(players, { exempt = new Set(), mmrWindow = MMR_WINDOW } = {}) {
  const exemptSet = exempt instanceof Set ? exempt : new Set(Array.from(exempt).map(String));
  const eligible = (players || [])
    .filter(p => p && p.accountId && !exemptSet.has(String(p.accountId)))
    .map(p => ({
      accountId: String(p.accountId),
      mmr: Number(p.mmr) || 0,
      heroes: p.heroes instanceof Set ? p.heroes : new Set(p.heroes || []),
      radiantGames: Number(p.radiantGames) || 0,
      direGames: Number(p.direGames) || 0,
    }))
    .sort((x, y) => x.mmr - y.mmr);

  const pairs = [];
  const used = new Set();
  const unpaired = [];

  for (const a of eligible) {
    if (used.has(a.accountId)) continue;

    // candidate window: every other unused player within MMR_WINDOW.
    let best = null;
    let bestScore = -Infinity;
    for (const b of eligible) {
      if (b.accountId === a.accountId) continue;
      if (used.has(b.accountId)) continue;
      if (Math.abs(a.mmr - b.mmr) > mmrWindow) continue;
      const s = pairScore(a, b, mmrWindow);
      if (s > bestScore) {
        bestScore = s;
        best = b;
      }
    }
    if (best) {
      // Canonicalise so (a, b) ordering is stable across runs: lower
      // accountId first. The DB unique key is on (week_start, account_id_a)
      // and we also write the mirror row, but canonical ordering keeps
      // the inspector + recap maths consistent.
      const [low, high] = BigInt(a.accountId) < BigInt(best.accountId)
        ? [a, best] : [best, a];
      pairs.push({
        a: low.accountId,
        b: high.accountId,
        mmrA: low.mmr,
        mmrB: high.mmr,
        score: bestScore,
      });
      used.add(a.accountId);
      used.add(best.accountId);
    } else {
      unpaired.push(a.accountId);
    }
  }

  return { pairs, unpaired };
}

// Monday (local) for the given timezone — defaults to Australia/Sydney to
// match the rest of the cron stack (weekly recap, Pro winback, etc).
// DST-correct: we use Intl.DateTimeFormat to read the wall-clock year /
// month / day / weekday in the target timezone, then arithmetic on those
// integers — so the Monday 00:05 cron always lands on the LOCAL Monday
// regardless of AEDT (UTC+11) vs AEST (UTC+10).
function currentWeekStart(now = new Date(), timezone = 'Australia/Sydney') {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map(p => [p.type, p.value]),
  );
  // 'en-CA' gives weekday like "Mon", "Tue", … and YYYY-MM-DD month/day.
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[parts.weekday] ?? 0;
  const daysSinceMonday = (dow + 6) % 7;
  // Build a Date pinned to the local date at noon UTC (noon avoids any
  // edge-of-day TZ shenanigans), then walk back to Monday.
  const localDate = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday);
  return localDate.toISOString().slice(0, 10);
}

module.exports = {
  pairPlayers,
  pairScore,
  heroOverlapJaccard,
  sideBalanceComplement,
  currentWeekStart,
  MMR_WINDOW,
};
