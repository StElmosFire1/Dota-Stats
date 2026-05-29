// Task #412 — Pin the Swiss pairing engine invariants so the no-repeat /
// single-bye / no-duplicate-player guarantees can't silently regress and
// corrupt a live tournament round.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  recommendedSwissRounds, pairRound1, pairNextRound,
  computeStandings, buildPlayerStatsFromMatches, computePayouts,
} = require('../src/tournaments/swissEngine');

function mkPlayers(n) {
  return Array.from({ length: n }, (_, i) => ({
    account_id: 1000 + i, seed: i + 1, display_name: `P${i + 1}`,
  }));
}

function assertNoDuplicates({ pairs, bye }, label = '') {
  const seen = new Set();
  const mark = (id) => {
    const k = String(id);
    assert.ok(!seen.has(k), `${label} duplicate player ${k}`);
    seen.add(k);
  };
  for (const [a, b] of pairs) { mark(a.account_id); mark(b.account_id); }
  if (bye) mark(bye.account_id);
}

test('recommendedSwissRounds boundary table', () => {
  assert.equal(recommendedSwissRounds(2), 1);
  assert.equal(recommendedSwissRounds(4), 2);
  assert.equal(recommendedSwissRounds(8), 3);
  assert.equal(recommendedSwissRounds(16), 4);
  assert.equal(recommendedSwissRounds(32), 5);
  assert.equal(recommendedSwissRounds(64), 6);
  assert.equal(recommendedSwissRounds(128), 7);
  assert.equal(recommendedSwissRounds(1), 0);
});

test('pairRound1 splits top/bottom halves with no duplicates (even)', () => {
  const r = pairRound1(mkPlayers(8));
  assert.equal(r.pairs.length, 4);
  assert.equal(r.bye, null);
  assertNoDuplicates(r, 'round-1 even');
});

test('pairRound1 odd field assigns lowest seed as bye', () => {
  const r = pairRound1(mkPlayers(7));
  assert.equal(r.pairs.length, 3);
  assert.ok(r.bye);
  assert.equal(r.bye.account_id, 1006); // P7, lowest seed
  assertNoDuplicates(r, 'round-1 odd');
});

test('pairNextRound: no-repeat pairing across multiple constrained rounds', () => {
  // 8 players. Simulate 3 rounds and verify nobody is paired with the same
  // opponent twice and nobody appears twice in any round.
  const players = mkPlayers(8).map(p => ({ ...p, wins: 0, losses: 0, byes: 0, opponents: [] }));
  const allOpponents = new Map(players.map(p => [String(p.account_id), new Set()]));

  // Round 1: deterministic by seed.
  const r1 = pairRound1(players);
  assertNoDuplicates(r1, 'r1');
  for (const [a, b] of r1.pairs) {
    allOpponents.get(String(a.account_id)).add(String(b.account_id));
    allOpponents.get(String(b.account_id)).add(String(a.account_id));
    // Winner = higher seed (lower index in our deterministic setup).
    const winner = a;
    const loser = b;
    const wp = players.find(p => p.account_id === winner.account_id);
    const lp = players.find(p => p.account_id === loser.account_id);
    wp.wins += 1; lp.losses += 1;
    wp.opponents.push(String(loser.account_id));
    lp.opponents.push(String(winner.account_id));
  }

  // Rounds 2 & 3.
  for (let round = 2; round <= 3; round++) {
    const r = pairNextRound(players);
    assertNoDuplicates(r, `r${round}`);
    for (const [a, b] of r.pairs) {
      const ka = String(a.account_id), kb = String(b.account_id);
      assert.ok(!allOpponents.get(ka).has(kb), `r${round} rematch ${ka} vs ${kb}`);
      allOpponents.get(ka).add(kb);
      allOpponents.get(kb).add(ka);
      // Whoever has the higher current wins is awarded the round.
      const ap = players.find(p => p.account_id === a.account_id);
      const bp = players.find(p => p.account_id === b.account_id);
      const winner = (ap.wins >= bp.wins) ? ap : bp;
      const loser  = (winner === ap) ? bp : ap;
      winner.wins += 1; loser.losses += 1;
      winner.opponents.push(String(loser.account_id));
      loser.opponents.push(String(winner.account_id));
    }
  }
});

test('pairNextRound: odd field gives bye to lowest scorer who has not had one', () => {
  // 5 players: one already had a bye, lowest scorer without a bye gets it.
  const players = [
    { account_id: 1, seed: 1, wins: 2, byes: 0, opponents: [] },
    { account_id: 2, seed: 2, wins: 1, byes: 1, opponents: [] }, // already had bye
    { account_id: 3, seed: 3, wins: 1, byes: 0, opponents: [] },
    { account_id: 4, seed: 4, wins: 0, byes: 0, opponents: [] },
    { account_id: 5, seed: 5, wins: 0, byes: 0, opponents: [] },
  ];
  const r = pairNextRound(players);
  assertNoDuplicates(r, 'odd');
  assert.ok(r.bye, 'expected a bye in odd field');
  assert.notEqual(r.bye.account_id, 2, 'player 2 already had a bye');
  // Lowest scorer w/o a bye is 4 or 5 (both wins=0). Either is acceptable.
  assert.ok([4, 5].includes(r.bye.account_id));
});

test('pairNextRound: every account appears exactly once even under heavy constraints', () => {
  // 4 players who have all already played each other once — pairing must
  // still produce 2 valid pairs (rematches allowed as last resort) with no
  // duplicate-player corruption.
  const players = [
    { account_id: 1, seed: 1, wins: 1, byes: 0, opponents: ['2', '3', '4'] },
    { account_id: 2, seed: 2, wins: 1, byes: 0, opponents: ['1', '3', '4'] },
    { account_id: 3, seed: 3, wins: 1, byes: 0, opponents: ['1', '2', '4'] },
    { account_id: 4, seed: 4, wins: 1, byes: 0, opponents: ['1', '2', '3'] },
  ];
  const r = pairNextRound(players);
  assert.equal(r.pairs.length, 2);
  assert.equal(r.bye, null);
  assertNoDuplicates(r, 'all-played');
});

test('computeStandings: Buchholz and Sonneborn–Berger ordering', () => {
  // 4 players, round-robin-ish: A beats B, A beats C, B beats D, C beats D.
  const participants = [
    { account_id: 'A', display_name: 'A', seed: 1 },
    { account_id: 'B', display_name: 'B', seed: 2 },
    { account_id: 'C', display_name: 'C', seed: 3 },
    { account_id: 'D', display_name: 'D', seed: 4 },
  ];
  const matches = [
    { round: 1, p1_id: 'A', p2_id: 'B', winner_id: 'A' },
    { round: 1, p1_id: 'C', p2_id: 'D', winner_id: 'C' },
    { round: 2, p1_id: 'A', p2_id: 'C', winner_id: 'A' },
    { round: 2, p1_id: 'B', p2_id: 'D', winner_id: 'B' },
  ];
  const buch = computeStandings(participants, matches, { tieBreak: 'buchholz' });
  assert.equal(buch[0].account_id, 'A');
  assert.equal(buch[0].wins, 2);
  assert.equal(buch[buch.length - 1].account_id, 'D');
  // Buchholz ties between B and C (both 1-1) — sort breaks consistently.
  assert.equal(buch.length, 4);
  const sb = computeStandings(participants, matches, { tieBreak: 'sonneborn_berger' });
  assert.equal(sb[0].account_id, 'A');
});

test('buildPlayerStatsFromMatches surfaces opponents + wins', () => {
  const stats = buildPlayerStatsFromMatches(
    [{ account_id: 1, seed: 1 }, { account_id: 2, seed: 2 }],
    [{ round: 1, p1_id: 1, p2_id: 2, winner_id: 1 }],
  );
  const a = stats.find(s => s.account_id === 1);
  assert.equal(a.wins, 1);
  assert.deepEqual(a.opponents, ['2']);
});

test('computePayouts: rounding remainder goes to first place', () => {
  const standings = [
    { account_id: 'A', rank: 1 }, { account_id: 'B', rank: 2 }, { account_id: 'C', rank: 3 },
  ];
  const splits = [{ place: 1, percent: 50 }, { place: 2, percent: 30 }, { place: 3, percent: 20 }];
  const r = computePayouts(splits, standings, 12345); // odd pool
  assert.equal(r.length, 3);
  const total = r.reduce((acc, x) => acc + x.cents, 0);
  assert.equal(total, 12345, 'no cents lost to rounding');
});

// Task #454 — Extra coverage layered on top of the Task #412 invariants:
// score-group integrity, a Buchholz-vs-Sonneborn–Berger case where the two
// metrics actually disagree, and explicit remainder placement in payouts.

test('pairNextRound: score-group integrity — same-score players pair together when possible', () => {
  // 6 players, fresh opponents. 4 on 1 win, 2 on 0 wins. With no rematch
  // constraints every pair must be within the same win-bucket (no floats).
  const players = [
    { account_id: 1, seed: 1, wins: 1, byes: 0, opponents: [] },
    { account_id: 2, seed: 2, wins: 1, byes: 0, opponents: [] },
    { account_id: 3, seed: 3, wins: 1, byes: 0, opponents: [] },
    { account_id: 4, seed: 4, wins: 1, byes: 0, opponents: [] },
    { account_id: 5, seed: 5, wins: 0, byes: 0, opponents: [] },
    { account_id: 6, seed: 6, wins: 0, byes: 0, opponents: [] },
  ];
  const winsOf = new Map(players.map(p => [p.account_id, p.wins]));
  const r = pairNextRound(players);
  assert.equal(r.pairs.length, 3);
  assert.equal(r.bye, null);
  assertNoDuplicates(r, 'score-group');
  for (const [a, b] of r.pairs) {
    assert.equal(
      winsOf.get(a.account_id), winsOf.get(b.account_id),
      `cross-score-group pairing ${a.account_id}(w${winsOf.get(a.account_id)}) vs ${b.account_id}(w${winsOf.get(b.account_id)})`,
    );
  }
});

test('pairNextRound: odd score group floats exactly one player down', () => {
  // 3 on 2 wins, 2 on 0 wins, fresh opponents. The 2-win bucket is odd, so
  // exactly one of its players must float down and pair with a 0-win player;
  // everyone else stays in-bucket and no player is duplicated.
  const players = [
    { account_id: 1, seed: 1, wins: 2, byes: 0, opponents: [] },
    { account_id: 2, seed: 2, wins: 2, byes: 0, opponents: [] },
    { account_id: 3, seed: 3, wins: 2, byes: 0, opponents: [] },
    { account_id: 4, seed: 4, wins: 0, byes: 0, opponents: [] },
    { account_id: 5, seed: 5, wins: 0, byes: 0, opponents: [] },
  ];
  // Even field (5 is odd → one bye). Add a 6th to keep it even so we isolate
  // the float behaviour rather than the bye behaviour.
  players.push({ account_id: 6, seed: 6, wins: 0, byes: 0, opponents: [] });
  const winsOf = new Map(players.map(p => [p.account_id, p.wins]));
  const r = pairNextRound(players);
  assert.equal(r.pairs.length, 3);
  assert.equal(r.bye, null);
  assertNoDuplicates(r, 'float-down');
  const crossGroup = r.pairs.filter(([a, b]) => winsOf.get(a.account_id) !== winsOf.get(b.account_id));
  assert.equal(crossGroup.length, 1, 'exactly one cross-group float pair expected');
});

test('computeStandings: Buchholz and Sonneborn–Berger disagree on tied players', () => {
  // X and Y are both 1-1. Constructed so:
  //   Buchholz(X)=3 > Buchholz(Y)=2  (X beat a 0-win, lost to a 3-win)
  //   SB(X)=0      < SB(Y)=1         (X's beaten opp had 0 wins, Y's had 1)
  // So the two tie-break metrics rank X and Y in opposite order.
  const participants = ['X', 'Y', 'A', 'B', 'C', 'D', 'E', 'F', 'G']
    .map((id, i) => ({ account_id: id, display_name: id, seed: i + 1 }));
  const w = (p1, p2, winner) => ({ round: 1, p1_id: p1, p2_id: p2, winner_id: winner });
  const matches = [
    w('X', 'A', 'X'), // X beats A (A: 0 wins)
    w('B', 'X', 'B'), // B beats X (B strong)
    w('B', 'E', 'B'),
    w('B', 'F', 'B'), // B: 3 wins
    w('Y', 'C', 'Y'), // Y beats C (C: 1 win)
    w('C', 'G', 'C'), // C: 1 win
    w('D', 'Y', 'D'), // D beats Y (D: 1 win)
  ];

  const byBuch = computeStandings(participants, matches, { tieBreak: 'buchholz' });
  const bySB = computeStandings(participants, matches, { tieBreak: 'sonneborn_berger' });

  const idx = (rows, id) => rows.findIndex(r => r.account_id === id);
  assert.ok(idx(byBuch, 'X') < idx(byBuch, 'Y'), 'Buchholz ranks X above Y');
  assert.ok(idx(bySB, 'Y') < idx(bySB, 'X'), 'Sonneborn–Berger ranks Y above X');

  // Sanity on the underlying metrics.
  const xRow = byBuch.find(r => r.account_id === 'X');
  const yRow = byBuch.find(r => r.account_id === 'Y');
  assert.equal(xRow.buchholz, 3);
  assert.equal(yRow.buchholz, 2);
  assert.equal(xRow.sonnebornBerger, 0);
  assert.equal(yRow.sonnebornBerger, 1);
});

test('computePayouts: first place absorbs the rounding remainder exactly', () => {
  const standings = [
    { account_id: 'A', rank: 1 }, { account_id: 'B', rank: 2 }, { account_id: 'C', rank: 3 },
  ];
  const splits = [{ place: 1, percent: 50 }, { place: 2, percent: 30 }, { place: 3, percent: 20 }];
  const r = computePayouts(splits, standings, 12345);
  const byPlace = new Map(r.map(x => [x.place, x.cents]));
  // Lower places are exact rounds of their share.
  assert.equal(byPlace.get(2), Math.round(12345 * 0.30)); // 3704
  assert.equal(byPlace.get(3), Math.round(12345 * 0.20)); // 2469
  // First place takes whatever is left so the pool reconciles to the cent.
  assert.equal(byPlace.get(1), 12345 - byPlace.get(2) - byPlace.get(3)); // 6172
  assert.notEqual(byPlace.get(1), Math.round(12345 * 0.50), 'first place differs from naive round by the remainder');
});

test('computePayouts: guards against empty splits and non-positive pools', () => {
  const standings = [{ account_id: 'A', rank: 1 }];
  assert.deepEqual(computePayouts([], standings, 1000), []);
  assert.deepEqual(computePayouts([{ place: 1, percent: 100 }], standings, 0), []);
  assert.deepEqual(computePayouts([{ place: 1, percent: 100 }], standings, -5), []);
});
