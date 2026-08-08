'use strict';

// Task #854 — regression tests for the retirement-attribution visibility
// boundary in src/monetization/lootbox/db.js. listSets() must only include
// who retired a set (retired_by / retired_by_name) when the caller explicitly
// opts in via { includeRetirementActor: true }. The public /lootbox/catalog
// endpoint calls listSets() with no options, so the default MUST omit the
// operator's account id and nickname — only the superuser admin routes ask.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createLootboxDb } = require('../src/monetization/lootbox/db');

function makeFakePool({ retiredRows = [], customSets = [] } = {}) {
  const pool = {
    query: async (sql, params = []) => {
      const s = String(sql).replace(/\s+/g, ' ').trim();

      // _retiredMeta: joins nicknames to resolve the operator's display name.
      if (/FROM lootbox_retired_sets rs/i.test(s)) {
        return { rows: retiredRows };
      }
      if (/FROM lootbox_custom_sets/i.test(s) && /^SELECT set_id, name/i.test(s)) {
        return { rows: customSets };
      }
      return { rows: [] };
    },
  };
  return pool;
}

const RETIRED = [
  // Operator-retired set with a resolvable nickname.
  { set_id: 'ti-2025', retired_at: '2026-08-01T00:00:00Z', retired_by: '108449472', retired_by_name: 'Harry' },
  // Seeded default-retired set — no operator.
  { set_id: 'launch', retired_at: '2026-01-01T00:00:00Z', retired_by: null, retired_by_name: null },
];

test('listSets() by default omits retirement actor fields (public catalog boundary)', async () => {
  const db = createLootboxDb({ getPool: () => makeFakePool({ retiredRows: RETIRED }) });
  const sets = await db.listSets();

  assert.ok(sets.length > 0, 'catalog sets are listed');
  for (const s of sets) {
    assert.ok(!('retired_by' in s), `set ${s.id} must not expose retired_by publicly`);
    assert.ok(!('retired_by_name' in s), `set ${s.id} must not expose retired_by_name publicly`);
  }
  // Serialized payload (what res.json would send) contains no actor identity.
  const json = JSON.stringify(sets);
  assert.ok(!json.includes('retired_by'), 'serialized public payload has no retired_by keys');
  assert.ok(!json.includes('Harry'), 'serialized public payload has no operator nickname');
  assert.ok(!json.includes('108449472'), 'serialized public payload has no operator account id');

  // Status + timestamp remain public.
  const retired = sets.filter((s) => s.retired);
  for (const s of retired) assert.ok(s.retired_at, 'retired_at stays visible publicly');
});

test('listSets({ includeRetirementActor: true }) attaches who retired each set', async () => {
  const db = createLootboxDb({ getPool: () => makeFakePool({ retiredRows: RETIRED }) });
  const sets = await db.listSets({ includeRetirementActor: true });

  const bySetId = new Map(sets.map((s) => [s.set_id, s]));
  // Any set retired by an operator carries the id + resolved display name.
  for (const s of sets.filter((x) => x.retired)) {
    assert.ok('retired_by' in s && 'retired_by_name' in s, `set ${s.id} carries actor fields for admins`);
  }
  // Non-retired sets have null actor fields (keys present, no identity).
  for (const s of sets.filter((x) => !x.retired)) {
    assert.equal(s.retired_by, null);
    assert.equal(s.retired_by_name, null);
  }
});

test('actor fields resolve nickname and fall back to null for seeded rows', async () => {
  const customSets = [
    { set_id: 'ti-2025', name: 'TI 2025', description: null, item_skus: ['a'], created_by: null, created_at: '2026-07-01T00:00:00Z' },
    { set_id: 'launch', name: 'Launch', description: null, item_skus: ['b'], created_by: null, created_at: '2026-01-01T00:00:00Z' },
  ];
  const db = createLootboxDb({ getPool: () => makeFakePool({ retiredRows: RETIRED, customSets }) });
  const sets = await db.listSets({ includeRetirementActor: true });
  const bySetId = new Map(sets.map((s) => [s.set_id, s]));

  const operatorRetired = bySetId.get('ti-2025');
  assert.equal(operatorRetired.retired, true);
  assert.equal(operatorRetired.retired_by, '108449472');
  assert.equal(operatorRetired.retired_by_name, 'Harry');

  const seeded = bySetId.get('launch');
  assert.equal(seeded.retired, true);
  assert.equal(seeded.retired_by, null, 'seeded default-retired set has no operator');
  assert.equal(seeded.retired_by_name, null);
});
