'use strict';

// Task #811 — unit tests for the lootbox dupe-returns audit trail in
// src/monetization/lootbox/db.js. The audit trail (Task #807) records who
// changed the duplicate-payout overrides, the old + new raw override blobs,
// and when. These tests pin down three guarantees that a regression could
// silently break:
//   1. saveDupeReturns(overrides, changedBy) inserts exactly one audit row
//      capturing changed_by, old_value and new_value.
//   2. A no-op save (identical override blob) does NOT create a new row.
//   3. listDupeReturnsAudit returns rows newest-first and clamps the limit.
//
// We stub a tiny in-memory pg.Pool that backs site_settings with a Map and the
// audit table with an array, applying ORDER BY / LIMIT / OFFSET so paging and
// ordering are observable end-to-end.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createLootboxDb } = require('../src/monetization/lootbox/db');

function makeFakeDb() {
  const siteSettings = new Map(); // key -> value (string)
  const auditRows = [];
  let nextId = 1;
  let clock = 0; // monotonic stand-in for changed_at
  const queries = [];

  const pool = {
    query: async (sql, params = []) => {
      queries.push({ sql, params });
      const s = String(sql).replace(/\s+/g, ' ').trim();

      // SELECT value FROM site_settings WHERE key = $1
      if (/^SELECT value FROM site_settings WHERE key/i.test(s)) {
        const key = params[0];
        const val = siteSettings.get(key);
        return { rows: val === undefined ? [] : [{ value: val }] };
      }

      // INSERT INTO site_settings (...) ON CONFLICT (...) DO UPDATE ...
      if (/^INSERT INTO site_settings/i.test(s)) {
        const [key, value] = params;
        siteSettings.set(key, value);
        return { rows: [], rowCount: 1 };
      }

      // INSERT INTO lootbox_dupe_returns_audit (changed_by, old_value, new_value)
      if (/^INSERT INTO lootbox_dupe_returns_audit/i.test(s)) {
        const [changed_by, old_value, new_value] = params;
        auditRows.push({
          id: nextId++,
          changed_by,
          old_value,
          new_value,
          changed_at: ++clock,
        });
        return { rows: [], rowCount: 1 };
      }

      // SELECT COUNT(*)::int AS n FROM lootbox_dupe_returns_audit
      if (/COUNT\(\*\)::int AS n FROM lootbox_dupe_returns_audit/i.test(s)) {
        return { rows: [{ n: auditRows.length }] };
      }

      // SELECT ... FROM lootbox_dupe_returns_audit ORDER BY changed_at DESC, id DESC LIMIT $1 OFFSET $2
      if (/FROM lootbox_dupe_returns_audit/i.test(s) && /ORDER BY/i.test(s)) {
        const [limit, offset] = params;
        const sorted = [...auditRows].sort((a, b) => {
          if (b.changed_at !== a.changed_at) return b.changed_at - a.changed_at;
          return b.id - a.id;
        });
        return { rows: sorted.slice(offset, offset + limit) };
      }

      return { rows: [] };
    },
  };

  return {
    getPool: () => pool,
    queries,
    siteSettings,
    auditRows,
  };
}

test('saveDupeReturns inserts exactly one audit row capturing changed_by, old_value, new_value', async () => {
  const fake = makeFakeDb();
  const db = createLootboxDb({ getPool: fake.getPool });

  await db.saveDupeReturns({ common: 5 }, 'admin-42');

  assert.equal(fake.auditRows.length, 1, 'exactly one audit row was inserted');
  const row = fake.auditRows[0];
  assert.equal(row.changed_by, 'admin-42', 'records who made the change');
  assert.equal(row.old_value, '{}', 'old value is the prior (empty) override blob');
  assert.equal(row.new_value, JSON.stringify({ common: 5 }), 'new value is the saved override blob');

  // The live value is persisted to site_settings under the dupe-returns key.
  assert.equal(fake.siteSettings.size, 1, 'one site_settings key written');
  const [storedValue] = [...fake.siteSettings.values()];
  assert.equal(storedValue, JSON.stringify({ common: 5 }));
});

test('saveDupeReturns coerces a missing changedBy to "unknown"', async () => {
  const fake = makeFakeDb();
  const db = createLootboxDb({ getPool: fake.getPool });

  await db.saveDupeReturns({ rare: 9 });

  assert.equal(fake.auditRows.length, 1);
  assert.equal(fake.auditRows[0].changed_by, 'unknown');
});

test('a no-op save (identical override blob) does NOT create a new audit row', async () => {
  const fake = makeFakeDb();
  const db = createLootboxDb({ getPool: fake.getPool });

  // First save establishes the stored blob + the first audit row.
  await db.saveDupeReturns({ common: 5 }, 'admin-42');
  assert.equal(fake.auditRows.length, 1, 'first save logged one row');

  // Re-saving the identical blob (a refresh-and-resave with no edits) must be a
  // no-op for the audit trail even though site_settings is re-upserted.
  await db.saveDupeReturns({ common: 5 }, 'admin-42');
  assert.equal(fake.auditRows.length, 1, 'identical save did not add a second row');

  // A genuine change still logs.
  await db.saveDupeReturns({ common: 6 }, 'admin-42');
  assert.equal(fake.auditRows.length, 2, 'a real change logs a new row');
  assert.equal(fake.auditRows[1].old_value, JSON.stringify({ common: 5 }));
  assert.equal(fake.auditRows[1].new_value, JSON.stringify({ common: 6 }));
});

test('listDupeReturnsAudit returns rows newest-first', async () => {
  const fake = makeFakeDb();
  const db = createLootboxDb({ getPool: fake.getPool });

  await db.saveDupeReturns({ common: 1 }, 'a');
  await db.saveDupeReturns({ common: 2 }, 'b');
  await db.saveDupeReturns({ common: 3 }, 'c');
  assert.equal(fake.auditRows.length, 3, 'three distinct changes were logged');

  const rows = await db.listDupeReturnsAudit();
  assert.deepEqual(
    rows.map((r) => r.new_value),
    [JSON.stringify({ common: 3 }), JSON.stringify({ common: 2 }), JSON.stringify({ common: 1 })],
    'newest change comes first'
  );
  assert.deepEqual(rows.map((r) => r.changed_by), ['c', 'b', 'a']);
});

test('listDupeReturnsAudit clamps the limit to a max of 100', async () => {
  const fake = makeFakeDb();
  const db = createLootboxDb({ getPool: fake.getPool });

  await db.listDupeReturnsAudit(500, 0);

  // Find the SELECT against the audit table and confirm the over-large limit
  // was clamped to 100 before reaching the query layer.
  const listQuery = fake.queries.find(
    (q) => /FROM lootbox_dupe_returns_audit/i.test(q.sql) && /ORDER BY/i.test(q.sql)
  );
  assert.ok(listQuery, 'an audit list query was issued');
  assert.equal(listQuery.params[0], 100, 'limit clamped to 100');
  assert.equal(listQuery.params[1], 0, 'offset preserved');
});

test('listDupeReturnsAudit falls back to the default limit and clamps a negative offset', async () => {
  const fake = makeFakeDb();
  const db = createLootboxDb({ getPool: fake.getPool });

  // A zero/blank limit falls back to the default of 20; a negative offset is
  // clamped to 0.
  await db.listDupeReturnsAudit(0, -3);

  const listQuery = fake.queries.find(
    (q) => /FROM lootbox_dupe_returns_audit/i.test(q.sql) && /ORDER BY/i.test(q.sql)
  );
  assert.ok(listQuery, 'an audit list query was issued');
  assert.equal(listQuery.params[0], 20, 'zero limit falls back to the default of 20');
  assert.equal(listQuery.params[1], 0, 'negative offset clamped to 0');
});
