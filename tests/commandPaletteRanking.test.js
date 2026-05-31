'use strict';

// Task #619 — guard the command-palette result ordering (Task #586 / #588).
//
// The palette ranks results by relevance (exact > prefix > word-start prefix >
// substring > fuzzy subsequence) and caps each group. That logic lives in the
// pure helpers in web/src/components/commandPaletteRanking.js. This suite locks
// in the scoring tiers, the fuzzy/typo tolerance (and that true non-matches are
// dropped), and the per-group cap, so a future refactor can't silently reorder
// or break search.
//
// The helper module is an ES module (web/ is "type": "module") so we load it
// with a dynamic import() from this CommonJS test rather than adding a
// transpile step.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE_URL = pathToFileURL(
  path.join(__dirname, '..', 'web', 'src', 'components', 'commandPaletteRanking.js'),
).href;

let helpers;
async function load() {
  if (!helpers) helpers = await import(MODULE_URL);
  return helpers;
}

// Score tiers as documented in the module. Kept here so the tests assert the
// actual contract, not just relative ordering.
const TIER = {
  exact: 1000,
  prefix: 800,
  wordStart: 600,
  // substring is 400 - offset
  fuzzy: 100,
};

// ---------------------------------------------------------------------------
// scoreText — the core relevance tiers.
// ---------------------------------------------------------------------------

test('scoreText: exact match scores the top tier', async () => {
  const { scoreText } = await load();
  assert.equal(scoreText('Invoker', 'invoker'), TIER.exact);
});

test('scoreText: prefix match scores below exact but above the rest', async () => {
  const { scoreText } = await load();
  assert.equal(scoreText('Invoker', 'inv'), TIER.prefix);
  assert.ok(scoreText('Invoker', 'inv') < scoreText('Invoker', 'invoker'));
});

test('scoreText: word-start prefix beats a mid-string substring', async () => {
  const { scoreText } = await load();
  // "of" starts the second word of "Queen of Pain" → word-start tier.
  const wordStart = scoreText('Queen of Pain', 'pain');
  assert.equal(wordStart, TIER.wordStart);
  // A purely mid-word substring lands in the substring tier (< word-start).
  const midString = scoreText('Spectre', 'ect');
  assert.ok(midString < wordStart);
  assert.ok(midString >= 1 && midString < TIER.wordStart);
});

test('scoreText: exact name beats a partial (prefix) match', async () => {
  const { scoreText } = await load();
  assert.ok(scoreText('Lina', 'lina') > scoreText('Lina', 'lin'));
});

test('scoreText: earlier substring wins ties (closer to the start ranks higher)', async () => {
  const { scoreText } = await load();
  // Same query, mid-word, at different offsets. Neither is a word-start match.
  const early = scoreText('xabxx', 'ab'); // offset 1
  const late = scoreText('xxxab', 'ab');  // offset 3
  assert.ok(early > late, `expected earlier offset to score higher (${early} > ${late})`);
  assert.equal(early - late, 2); // offsets differ by 2 → scores differ by 2
});

test('scoreText: fuzzy subsequence is the lowest positive tier', async () => {
  const { scoreText } = await load();
  // "invk" is not a substring of "Invoker" but is a subsequence (i-n-v...k).
  assert.equal(scoreText('Invoker', 'invk'), TIER.fuzzy);
});

test('scoreText: a true non-match scores -Infinity', async () => {
  const { scoreText } = await load();
  assert.equal(scoreText('Axe', 'zzz'), -Infinity);
  assert.equal(scoreText('', 'anything'), -Infinity);
});

test('scoreText: the full tier ordering holds for one base string', async () => {
  const { scoreText } = await load();
  const exact = scoreText('Invoker', 'invoker');
  const prefix = scoreText('Invoker', 'invo');
  const wordStart = scoreText('Shadow Fiend', 'fiend');
  const substring = scoreText('Spectre', 'ect');
  const fuzzy = scoreText('Invoker', 'invk');
  const miss = scoreText('Invoker', 'zzzzz');
  assert.ok(exact > prefix);
  assert.ok(prefix > wordStart);
  assert.ok(wordStart > substring);
  assert.ok(substring > fuzzy);
  assert.ok(fuzzy > miss);
});

// ---------------------------------------------------------------------------
// scoreItem — best score across the primary label plus alias fields.
// ---------------------------------------------------------------------------

test('scoreItem: returns the best score across primary + extra fields', async () => {
  const { scoreItem, scoreText } = await load();
  // Primary only fuzzy-matches; the alias is an exact match → exact wins.
  const score = scoreItem('storm', 'Some Player', 'Storm');
  assert.equal(score, scoreText('Storm', 'storm'));
  assert.equal(score, TIER.exact);
});

test('scoreItem: ignores null/undefined extras', async () => {
  const { scoreItem, scoreText } = await load();
  const score = scoreItem('lina', 'Lina', null, undefined);
  assert.equal(score, scoreText('Lina', 'lina'));
});

test('scoreItem: a query matching neither label nor alias is -Infinity', async () => {
  const { scoreItem } = await load();
  assert.equal(scoreItem('zzz', 'Lina', 'Slayer'), -Infinity);
});

// ---------------------------------------------------------------------------
// isSubsequence — the fuzzy/typo primitive.
// ---------------------------------------------------------------------------

test('isSubsequence: small typos / omitted letters still match', async () => {
  const { isSubsequence } = await load();
  assert.equal(isSubsequence('invk', 'invoker'), true);
  assert.equal(isSubsequence('pa', 'phantom assassin'), true);
  assert.equal(isSubsequence('', 'anything'), true);
});

test('isSubsequence: out-of-order or absent letters do not match', async () => {
  const { isSubsequence } = await load();
  assert.equal(isSubsequence('kinv', 'invoker'), false); // wrong order
  assert.equal(isSubsequence('xyz', 'invoker'), false);  // absent letters
});

// ---------------------------------------------------------------------------
// highlightRanges / highlightSegments — which chars of a label are emphasised.
// ---------------------------------------------------------------------------

test('highlightRanges: prefix match highlights the leading chars', async () => {
  const { highlightRanges } = await load();
  assert.deepEqual(highlightRanges('Invoker', 'inv'), [[0, 3]]);
});

test('highlightRanges: exact match highlights the whole string', async () => {
  const { highlightRanges } = await load();
  assert.deepEqual(highlightRanges('Lina', 'lina'), [[0, 4]]);
});

test('highlightRanges: word-start prefix highlights the matched word', async () => {
  const { highlightRanges } = await load();
  // "fiend" starts the second word of "Shadow Fiend" → offset 7.
  assert.deepEqual(highlightRanges('Shadow Fiend', 'fiend'), [[7, 12]]);
});

test('highlightRanges: substring highlights the first occurrence', async () => {
  const { highlightRanges } = await load();
  // "ect" first appears at index 2 of "Spectre" (S-p-e-c-t-r-e).
  assert.deepEqual(highlightRanges('Spectre', 'ect'), [[2, 5]]);
});

test('highlightRanges: fuzzy match highlights the individual matched chars', async () => {
  const { highlightRanges } = await load();
  // "invk" → i,n,v (0,1,2) then k (4) in "Invoker".
  assert.deepEqual(highlightRanges('Invoker', 'invk'), [[0, 1], [1, 2], [2, 3], [4, 5]]);
});

test('highlightRanges: a true non-match (or empty query) highlights nothing', async () => {
  const { highlightRanges } = await load();
  assert.deepEqual(highlightRanges('Axe', 'zzz'), []);
  assert.deepEqual(highlightRanges('Axe', ''), []);
  assert.deepEqual(highlightRanges(null, 'a'), []);
});

test('highlightSegments: splits a prefix match, preserving original casing', async () => {
  const { highlightSegments } = await load();
  assert.deepEqual(highlightSegments('Invoker', 'inv'), [
    { text: 'Inv', match: true },
    { text: 'oker', match: false },
  ]);
});

test('highlightSegments: merges contiguous fuzzy ranges into one segment', async () => {
  const { highlightSegments } = await load();
  // i,n,v are contiguous (0-3) and merge; k (5) is its own segment.
  assert.deepEqual(highlightSegments('Invoker', 'invk'), [
    { text: 'Inv', match: true },
    { text: 'o', match: false },
    { text: 'k', match: true },
    { text: 'er', match: false },
  ]);
});

test('highlightSegments: no match returns the whole label as one unmatched segment', async () => {
  const { highlightSegments } = await load();
  // Models the alias-only case: the query matched an alias, not this label.
  assert.deepEqual(highlightSegments('Some Player', 'storm'), [
    { text: 'Some Player', match: false },
  ]);
});

// ---------------------------------------------------------------------------
// rankAndCap — ordering, drop-misses, and the per-group cap.
// ---------------------------------------------------------------------------

function scoredHeroList(scoreText, q) {
  const heroes = [
    'Invoker', 'Invalid Name', 'Pudge', 'Anti-Mage', 'Axe', 'Lina',
  ];
  return heroes.map(name => ({ item: name, score: scoreText(name, q) }));
}

test('rankAndCap: orders by descending score, stable within a tier', async () => {
  const { rankAndCap } = await load();
  const scored = [
    { item: 'a', score: 100 },
    { item: 'b', score: 800 },
    { item: 'c', score: 400 },
    { item: 'd', score: 800 }, // tie with b → keep original (b before d)
  ];
  assert.deepEqual(rankAndCap(scored), ['b', 'd', 'c', 'a']);
});

test('rankAndCap: dropMisses removes -Infinity (non-matching) items', async () => {
  const { rankAndCap, scoreText } = await load();
  // "inv" matches Invoker (prefix) and Invalid Name (word-start); the rest miss.
  const out = rankAndCap(scoredHeroList(scoreText, 'inv'), { dropMisses: true });
  assert.deepEqual(out, ['Invoker', 'Invalid Name']);
});

test('rankAndCap: fuzzy typo surfaces a hero, true non-matches are dropped', async () => {
  const { rankAndCap, scoreText } = await load();
  const out = rankAndCap(scoredHeroList(scoreText, 'invk'), { dropMisses: true });
  // "invk" fuzzily matches Invoker; nothing else in the list does.
  assert.deepEqual(out, ['Invoker']);
});

test('rankAndCap: without dropMisses, misses are kept (server groups) and reordered', async () => {
  const { rankAndCap } = await load();
  const scored = [
    { item: 'miss', score: -Infinity },
    { item: 'hit', score: 800 },
  ];
  // Server groups keep every row the server returned; only the order changes.
  assert.deepEqual(rankAndCap(scored), ['hit', 'miss']);
});

test('rankAndCap: each group respects the default cap', async () => {
  const { rankAndCap, GROUP_CAP } = await load();
  const scored = Array.from({ length: GROUP_CAP + 5 }, (_, i) => ({
    item: `item-${i}`,
    score: 1000 - i,
  }));
  const out = rankAndCap(scored);
  assert.equal(out.length, GROUP_CAP);
  // Highest-scoring items survive the cap, in order.
  assert.deepEqual(out, scored.slice(0, GROUP_CAP).map(e => e.item));
});

test('rankAndCap: an explicit cap overrides the default', async () => {
  const { rankAndCap } = await load();
  const scored = Array.from({ length: 10 }, (_, i) => ({ item: i, score: 100 - i }));
  assert.equal(rankAndCap(scored, { cap: 3 }).length, 3);
});

test('GROUP_CAP is the documented default of 6', async () => {
  const { GROUP_CAP } = await load();
  assert.equal(GROUP_CAP, 6);
});
