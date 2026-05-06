// v6.03 — pure-function tests for the captain-mode vote helpers.
// We import the helpers directly off src/db/index.js (they don't touch
// the pool) so this runs without a live Postgres.

const db = require('../src/db');

function expectEq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`);
    process.exitCode = 1;
  } else {
    console.log(`ok   ${label}`);
  }
}

// --- tally ---
expectEq(
  db.tallyCaptainModeVotes({}),
  { highest_rank: 0, random: 0, auto_balance: 0, volunteer: 0 },
  'tally: empty'
);
expectEq(
  db.tallyCaptainModeVotes({ a: 'random', b: 'random', c: 'highest_rank', d: 'bogus' }),
  { highest_rank: 1, random: 2, auto_balance: 0, volunteer: 0 },
  'tally: ignores unknown modes'
);

// --- member-set filter (leaver vote dropped) ---
const lobby = new Set(['1', '2', '3']);
expectEq(
  db.tallyCaptainModeVotes({ 1: 'random', 2: 'random', 99: 'volunteer' }, lobby),
  { highest_rank: 0, random: 2, auto_balance: 0, volunteer: 0 },
  'tally: leaver dropped by member-set'
);

// --- resolveWinningCaptainMode ---
expectEq(db.resolveWinningCaptainMode({}), 'highest_rank', 'resolve: zero votes → highest_rank');
expectEq(
  db.resolveWinningCaptainMode({ a: 'random', b: 'random', c: 'highest_rank' }),
  'random',
  'resolve: clear winner (random 2 vs highest_rank 1)'
);
// Tie cases — task spec: ANY tie → highest_rank
expectEq(
  db.resolveWinningCaptainMode({ a: 'random', b: 'highest_rank' }),
  'highest_rank',
  'resolve: tie including highest_rank → highest_rank'
);
expectEq(
  db.resolveWinningCaptainMode({ a: 'random', b: 'volunteer' }),
  'highest_rank',
  'resolve: tie WITHOUT highest_rank still → highest_rank'
);
expectEq(
  db.resolveWinningCaptainMode({ a: 'auto_balance', b: 'volunteer', c: 'random' }),
  'highest_rank',
  'resolve: 3-way tie among non-highest_rank modes → highest_rank'
);
// Member-set filter changes the winner
expectEq(
  db.resolveWinningCaptainMode(
    { 1: 'random', 2: 'random', 99: 'volunteer', 98: 'volunteer', 97: 'volunteer' },
    lobby
  ),
  'random',
  'resolve: leavers stripped → random wins (volunteer leavers ignored)'
);

if (process.exitCode) {
  console.error('\nCaptain-mode vote tests FAILED');
  process.exit(process.exitCode);
} else {
  console.log('\nAll captain-mode vote tests passed.');
}
