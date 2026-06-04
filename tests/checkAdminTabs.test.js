'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  extractTabMetaIds,
  extractRenderGuards,
  validate,
} = require('../scripts/check-admin-tabs');

// -----------------------------------------------------------------------------
// extractTabMetaIds — top-level keys of the TAB_META object literal
// -----------------------------------------------------------------------------
test('extractTabMetaIds: collects every top-level TAB_META key', () => {
  const src = [
    'const TAB_META = {',
    "  overview:    { icon: '📊', label: 'Overview' },",
    "  matches:     { icon: '🎮', label: 'Matches' },",
    "  seasons:     { icon: '🏆', label: 'Seasons' },",
    '};',
  ].join('\n');
  assert.deepStrictEqual(extractTabMetaIds(src), [
    'overview',
    'matches',
    'seasons',
  ]);
});

test('extractTabMetaIds: returns [] when TAB_META is absent', () => {
  assert.deepStrictEqual(extractTabMetaIds('const FOO = {};'), []);
});

// -----------------------------------------------------------------------------
// extractRenderGuards — counts activeTab === 'x' occurrences per id
// -----------------------------------------------------------------------------
test('extractRenderGuards: counts one guard per tab', () => {
  const src = [
    "{activeTab === 'overview' && (<>x</>)}",
    "{activeTab === 'matches' && (<>y</>)}",
  ].join('\n');
  const counts = extractRenderGuards(src);
  assert.strictEqual(counts.get('overview'), 1);
  assert.strictEqual(counts.get('matches'), 1);
});

test('extractRenderGuards: tallies duplicate guards for the same tab', () => {
  const src = [
    "{activeTab === 'matches' && (<>a</>)}",
    "{activeTab === 'matches' && (<>b</>)}",
    "{activeTab === 'matches' && (<>c</>)}",
  ].join('\n');
  assert.strictEqual(extractRenderGuards(src).get('matches'), 3);
});

// -----------------------------------------------------------------------------
// validate — the invariant: exactly one guard per tab, no unknown ids
// -----------------------------------------------------------------------------
test('validate: passes when every tab has exactly one guard', () => {
  const tabs = ['overview', 'matches'];
  const counts = new Map([
    ['overview', 1],
    ['matches', 1],
  ]);
  assert.deepStrictEqual(validate(tabs, counts), []);
});

test('validate: flags a tab with no render guard', () => {
  const tabs = ['overview', 'matches'];
  const counts = new Map([['overview', 1]]);
  const errors = validate(tabs, counts);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /'matches' has no render guard/);
});

test('validate: flags a tab with more than one render guard', () => {
  const tabs = ['overview', 'matches'];
  const counts = new Map([
    ['overview', 1],
    ['matches', 4],
  ]);
  const errors = validate(tabs, counts);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /'matches' has 4 render guards/);
});

test('validate: flags a guard referencing an unknown tab id', () => {
  const tabs = ['overview'];
  const counts = new Map([
    ['overview', 1],
    ['ghost', 1],
  ]);
  const errors = validate(tabs, counts);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /'ghost' which is not defined in TAB_META/);
});

// -----------------------------------------------------------------------------
// End-to-end: the real AdminPanel.jsx must currently satisfy the invariant.
// -----------------------------------------------------------------------------
test('real AdminPanel.jsx has exactly one render guard per tab', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'web', 'src', 'pages', 'AdminPanel.jsx'),
    'utf8'
  );
  const tabIds = extractTabMetaIds(src);
  assert.ok(tabIds.length > 0, 'TAB_META keys parsed');
  const guardCounts = extractRenderGuards(src);
  const errors = validate(tabIds, guardCounts);
  assert.deepStrictEqual(errors, [], errors.join('; '));
});
