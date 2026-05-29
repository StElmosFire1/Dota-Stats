// Swiss-format pairing engine.
//
// Pure functions — no DB access. Input/output shapes are documented inline so
// the DB layer in src/db/index.js can call them with a snapshot of state and
// persist the result.
//
// Players are objects with at minimum:
//   { account_id: BigInt|string|number, seed: number|null }
// Stats accumulated over previous rounds (for round >= 2):
//   { wins, losses, opponents: [account_id, ...], byes }
//
// Tie-break methods (single, deterministic):
//   - 'buchholz'         — sum of opponents' wins (default)
//   - 'sonneborn_berger' — sum of beaten-opponents' wins + 0.5×draws (no draws here, simplifies to beaten-opps wins)

'use strict';

function _toKey(id) { return String(id); }

function _shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor((rng ? rng() : Math.random()) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Recommended round count: ceil(log2(n)) is the minimum to determine a single
// winner; we cap at 7 to avoid runaway events. Caller can override via the
// `swiss_rounds` tournament column.
function recommendedSwissRounds(n) {
  if (n < 2) return 0;
  return Math.min(7, Math.max(1, Math.ceil(Math.log2(n))));
}

// --- Round 1 pairings ----------------------------------------------------
//
// Seed-bucket pairings: split the field into top half / bottom half and
// pair top[i] vs bottom[i] (classic accelerated swiss-style seeding). Random
// within seed ties when seed is null.
function pairRound1(players, { rng = null } = {}) {
  const seeded = players.slice();
  // Stable sort by seed asc (null seeds shuffled to the back).
  const withSeed = seeded.filter(p => Number.isFinite(p.seed));
  const noSeed = seeded.filter(p => !Number.isFinite(p.seed));
  withSeed.sort((a, b) => a.seed - b.seed);
  _shuffleInPlace(noSeed, rng);
  const ordered = [...withSeed, ...noSeed];

  // Bye: if odd, the lowest-seeded player gets the bye.
  let bye = null;
  if (ordered.length % 2 === 1) bye = ordered.pop();

  const half = ordered.length / 2;
  const top = ordered.slice(0, half);
  const bottom = ordered.slice(half);
  // Light within-bucket randomisation so identical seeds aren't always the
  // same pairing across re-runs of round 1 generation in admin previews.
  const pairs = top.map((t, i) => [t, bottom[i]]);
  return { pairs, bye };
}

// --- Subsequent round pairings ------------------------------------------
//
// Group by current score (wins). Inside each group, greedily pair such that
// no two players who have already met are paired. Falls back to cross-group
// "float" pairing when an unmatched player remains. Bye assignment: lowest
// scorer who has not yet had a bye gets the bye.
function pairNextRound(players, { rng = null } = {}) {
  const remaining = players.slice();
  _shuffleInPlace(remaining, rng); // randomise within score for fairness

  // Bye first (odd field): lowest score, no prior bye, tiebreak by seed desc.
  let bye = null;
  if (remaining.length % 2 === 1) {
    const candidates = remaining
      .map((p, idx) => ({ p, idx }))
      .filter(({ p }) => (p.byes || 0) === 0)
      .sort((a, b) => {
        const wA = a.p.wins || 0, wB = b.p.wins || 0;
        if (wA !== wB) return wA - wB;
        return (b.p.seed || 0) - (a.p.seed || 0);
      });
    const pick = candidates[0] || { idx: remaining.length - 1 };
    bye = remaining.splice(pick.idx, 1)[0];
  }

  // Group by current wins (desc).
  const groups = new Map();
  for (const p of remaining) {
    const w = p.wins || 0;
    if (!groups.has(w)) groups.set(w, []);
    groups.get(w).push(p);
  }
  const sortedScores = [...groups.keys()].sort((a, b) => b - a);

  const pairs = [];
  // Carry unpaired players forward across score groups instead of stashing
  // a single `floater` variable. The previous one-floater approach had a
  // pathological end-of-loop branch that could place the same player into
  // two pairs in the same round; collecting unpaired players in an array
  // and resolving them in a single final pass makes that impossible.
  const unpaired = [];
  for (const score of sortedScores) {
    const pool = [...unpaired, ...groups.get(score)];
    unpaired.length = 0;
    const used = new Set();
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;
      const a = pool[i];
      const aOpps = new Set((a.opponents || []).map(_toKey));
      let partnerIdx = -1;
      for (let j = i + 1; j < pool.length; j++) {
        if (used.has(j)) continue;
        if (aOpps.has(_toKey(pool[j].account_id))) continue;
        partnerIdx = j;
        break;
      }
      if (partnerIdx !== -1) {
        pairs.push([a, pool[partnerIdx]]);
        used.add(i); used.add(partnerIdx);
      } else {
        unpaired.push(a);
        used.add(i);
      }
    }
  }
  // Final pass: pair leftover unpaired players, allowing rematches as a last
  // resort. Every iteration consumes exactly two from `unpaired`, so no
  // player can ever land in more than one pair.
  while (unpaired.length >= 2) {
    const a = unpaired.shift();
    const aOpps = new Set((a.opponents || []).map(_toKey));
    let partnerIdx = unpaired.findIndex(p => !aOpps.has(_toKey(p.account_id)));
    if (partnerIdx === -1) partnerIdx = 0; // controlled rematch fallback
    const b = unpaired.splice(partnerIdx, 1)[0];
    pairs.push([a, b]);
  }
  // Parity safety net: with an even field the bye is null and `unpaired`
  // must end empty (sum of odd-sized groups has the same parity as N). If
  // we somehow land here with one straggler, promote them to a bye rather
  // than leaving the round malformed.
  if (unpaired.length === 1 && !bye) {
    bye = unpaired.shift();
  }
  return { pairs, bye };
}

// --- Standings ----------------------------------------------------------
//
// Inputs:
//   participants: [{account_id, display_name?, seed?}]
//   matches: [{round, p1_id, p2_id, winner_id}] (resolved + unresolved)
// Returns sorted standings array:
//   [{account_id, display_name, wins, losses, byes, opponents: [...], buchholz, sonnebornBerger, rank}]
function computeStandings(participants, matches, { tieBreak = 'buchholz' } = {}) {
  const stats = new Map();
  for (const p of participants) {
    stats.set(_toKey(p.account_id), {
      account_id: p.account_id,
      display_name: p.display_name || String(p.account_id),
      seed: p.seed || null,
      wins: 0, losses: 0, byes: 0,
      opponents: [],
      beaten: [],
    });
  }
  for (const m of matches) {
    const a = m.p1_id ? stats.get(_toKey(m.p1_id)) : null;
    const b = m.p2_id ? stats.get(_toKey(m.p2_id)) : null;
    if (a && !b) {
      // p1 has a bye (auto-win).
      a.wins += 1; a.byes += 1;
      continue;
    }
    if (!a || !b) continue;
    a.opponents.push(_toKey(b.account_id));
    b.opponents.push(_toKey(a.account_id));
    if (!m.winner_id) continue;
    const winKey = _toKey(m.winner_id);
    if (winKey === _toKey(a.account_id)) {
      a.wins += 1; b.losses += 1; a.beaten.push(_toKey(b.account_id));
    } else if (winKey === _toKey(b.account_id)) {
      b.wins += 1; a.losses += 1; b.beaten.push(_toKey(a.account_id));
    }
  }
  const winsOf = (key) => stats.get(key)?.wins || 0;
  const rows = [...stats.values()].map(s => ({
    ...s,
    buchholz: s.opponents.reduce((acc, k) => acc + winsOf(k), 0),
    sonnebornBerger: s.beaten.reduce((acc, k) => acc + winsOf(k), 0),
  }));
  const tbKey = tieBreak === 'sonneborn_berger' ? 'sonnebornBerger' : 'buchholz';
  rows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b[tbKey] !== a[tbKey]) return b[tbKey] - a[tbKey];
    // Secondary fallback: other tiebreak metric.
    const altKey = tbKey === 'buchholz' ? 'sonnebornBerger' : 'buchholz';
    if (b[altKey] !== a[altKey]) return b[altKey] - a[altKey];
    return (a.seed || 9999) - (b.seed || 9999);
  });
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

// Snapshot a participant's stats from match history — used to build the input
// to pairNextRound from the DB layer.
function buildPlayerStatsFromMatches(participants, matches) {
  return computeStandings(participants, matches).map(s => ({
    account_id: s.account_id,
    seed: s.seed,
    wins: s.wins, losses: s.losses, byes: s.byes,
    opponents: s.opponents,
  }));
}

// Compute payouts in cents from a per-place split.
//   splits: [{ place: 1, percent: 50 }, ...]  (percents sum to 100)
//   standings: ordered standings from computeStandings
//   poolCents: integer cents
// Returns: [{ account_id, place, percent, cents }, ...]
function computePayouts(splits, standings, poolCents) {
  if (!Array.isArray(splits) || splits.length === 0) return [];
  if (!Number.isFinite(poolCents) || poolCents <= 0) return [];
  const ordered = splits.slice().sort((a, b) => a.place - b.place);
  // Resolve splits to actual winners first, preserving place order.
  const resolved = [];
  for (const s of ordered) {
    const winner = standings.find(r => r.rank === s.place);
    if (!winner) continue;
    resolved.push({ s, winner });
  }
  if (resolved.length === 0) return [];
  // Every place except first gets the naive rounded share; first place absorbs
  // the rounding remainder so the pool always reconciles to the cent and the
  // leftover lands on the top finisher rather than the lowest paid place.
  let assignedToRest = 0;
  for (let i = 1; i < resolved.length; i++) {
    resolved[i].cents = Math.round(poolCents * (resolved[i].s.percent / 100));
    assignedToRest += resolved[i].cents;
  }
  resolved[0].cents = Math.max(0, poolCents - assignedToRest);
  return resolved.map(({ s, winner, cents }) => ({
    account_id: winner.account_id, place: s.place, percent: s.percent, cents,
  }));
}

module.exports = {
  recommendedSwissRounds,
  pairRound1,
  pairNextRound,
  computeStandings,
  buildPlayerStatsFromMatches,
  computePayouts,
};
