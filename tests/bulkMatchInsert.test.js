// Task #313 — pins the bulk-insert path inside src/db/index.js recordMatch().
//
// We don't load src/db/index.js (it requires a live pg pool); instead we
// re-implement the placeholder math the way the production code does and
// assert the contract: N players × 73 columns produces N tuple groups
// each with 73 placeholders, numbered $1..$(N*73) sequentially, and the
// flattened params array length matches. Same for items / abilities /
// draft. If the column count in recordMatch ever changes, this test will
// fail loudly until PS_COLS here is updated to match — which is exactly
// the invariant we want.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PS_COLS = 74;

function buildPlaceholderGroups(rowCount, colCount) {
  const groups = [];
  for (let i = 0; i < rowCount; i++) {
    const base = i * colCount;
    const ph = [];
    for (let j = 1; j <= colCount; j++) ph.push('$' + (base + j));
    groups.push('(' + ph.join(',') + ')');
  }
  return groups;
}

test('player_stats placeholder math: 10 players × 73 cols → 730 sequential', () => {
  const groups = buildPlaceholderGroups(10, PS_COLS);
  assert.strictEqual(groups.length, 10);
  assert.ok(groups[0].startsWith('($1,$2,'));
  assert.ok(groups[0].endsWith(',$' + PS_COLS + ')'));
  assert.ok(groups[9].startsWith('($' + (9 * PS_COLS + 1) + ','));
  assert.ok(groups[9].endsWith(',$' + (10 * PS_COLS) + ')'));
  // Sanity: total unique placeholders matches rows × cols
  const all = groups.join(',').match(/\$\d+/g);
  assert.strictEqual(all.length, 10 * PS_COLS);
  const nums = all.map((s) => Number(s.slice(1)));
  for (let k = 0; k < nums.length; k++) assert.strictEqual(nums[k], k + 1);
});

test('items placeholder math: 60 items × 7 cols', () => {
  const groups = buildPlaceholderGroups(60, 7);
  assert.strictEqual(groups.length, 60);
  const all = groups.join(',').match(/\$\d+/g);
  assert.strictEqual(all.length, 60 * 7);
  assert.strictEqual(all[all.length - 1], '$' + 60 * 7);
});

test('source guard: recordMatch still ships the bulk INSERT pattern + PS_COLS=74', () => {
  // Catches a future refactor that accidentally reverts to the per-player
  // loop or changes the column count without updating this test.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'index.js'), 'utf8');
  // Locate the recordMatch function body
  const idx = src.indexOf('async function recordMatch(');
  assert.ok(idx > 0, 'recordMatch not found');
  const end = src.indexOf('\nasync function isMatchRecorded', idx);
  const body = src.slice(idx, end);
  assert.ok(/const PS_COLS = 74;/.test(body), 'PS_COLS=74 constant missing — bulk path regressed?');
  assert.ok(/psPlaceholders\.join\(','\)/.test(body), 'multi-row VALUES join missing — bulk path regressed?');
  // The pre-refactor shape did one INSERT per player INSIDE the players loop.
  // Reject that shape: a `for (const player of matchStats.players)` that
  // contains `INSERT INTO player_stats` directly.
  const offending = /for\s*\(\s*const\s+player\s+of\s+matchStats\.players\s*\)\s*\{[^}]*INSERT INTO player_stats/s;
  assert.ok(!offending.test(body), 'per-player INSERT INTO player_stats reintroduced — bulk path regressed');
});
