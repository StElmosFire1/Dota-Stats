// Task #874 — confirm the purchase history stays accurate after refunds.
//
// GET /me/purchase-history (Task #768) must never show refunded/revoked
// purchases or pending unpaid checkouts as completed purchases. The filters
// live in three layers:
//   1. listOneOffPerks (magazineV3/oneOffPerks.js) — `revoked_at IS NULL`
//      drops both pending checkouts (revoked_at = NOW() at creation) and
//      refund-revoked perks.
//   2. src/db/index.js list helpers — status/source WHERE clauses
//      (coin_pack_purchases status='completed', frame_purchases
//      status='active', entitlements granted_by='stripe').
//   3. buildPurchaseHistory (src/web/purchaseHistory.js) — defensive
//      source/coins_spent filtering + newest-first ordering.
//
// This file pins all three layers.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const { createDb } = require('../src/monetization/magazineV3/oneOffPerks');
const { buildPurchaseHistory } = require('../src/web/purchaseHistory');

// ── Stub a require.cache entry so require(specifier) returns `exports`.
function stubModule(specifier, exports, fromPath = __filename) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

// ───────────────────────────────────────────────────────────────────────────
// Layer 1 — listOneOffPerks drops pending + revoked rows.
//
// The fake pool APPLIES the WHERE semantics to an in-memory fixture (rather
// than only asserting SQL text) so a regression that removes the revoked_at
// filter — or stops routing through it — fails the pipeline test below too.
// ───────────────────────────────────────────────────────────────────────────

const PERK_FIXTURE = [
  { id: 1, perk_key: 'cosmetic:vanity_url', source: 'stripe',
    granted_at: '2026-01-05T00:00:00Z', revoked_at: null,
    amount_cents: 1200, currency: 'aud', stripe_payment_intent: 'pi_ok',
    expires_at: null, metadata: null },
  // Pending unpaid checkout — createOneOffPerkPending stamps revoked_at=NOW().
  { id: 2, perk_key: 'cosmetic:trophy_frame', source: 'stripe_pending',
    granted_at: '2026-01-06T00:00:00Z', revoked_at: '2026-01-06T00:00:00Z',
    amount_cents: 600, currency: 'aud', stripe_payment_intent: null,
    expires_at: null, metadata: null },
  // Refunded → revoked perk.
  { id: 3, perk_key: 'cosmetic:voice_pack', source: 'stripe',
    granted_at: '2026-01-04T00:00:00Z', revoked_at: '2026-01-10T00:00:00Z',
    amount_cents: 800, currency: 'aud', stripe_payment_intent: 'pi_refunded',
    expires_at: null, metadata: null },
];

function makePerkPool(rows) {
  const calls = [];
  return {
    calls,
    async query(sqlRaw, params = []) {
      const sql = String(sqlRaw).replace(/\s+/g, ' ').trim();
      calls.push({ sql, params });
      if (!/FROM user_one_off_perks/.test(sql)) {
        throw new Error('unexpected query: ' + sql.slice(0, 100));
      }
      let out = rows.filter(r => String(r.account_id ?? params[0]) === String(params[0]));
      if (/revoked_at IS NULL/.test(sql)) out = out.filter(r => r.revoked_at === null);
      if (/ORDER BY granted_at DESC/.test(sql)) {
        out = [...out].sort((a, b) => new Date(b.granted_at) - new Date(a.granted_at));
      }
      return { rows: out, rowCount: out.length };
    },
  };
}

test('listOneOffPerks excludes pending (revoked_at set) and refund-revoked rows', async () => {
  const pool = makePerkPool(PERK_FIXTURE);
  const magDb = createDb({ getPool: () => pool });
  const rows = await magDb.listOneOffPerks(777);
  assert.deepEqual(rows.map(r => r.id), [1]); // only the paid, unrevoked perk
  // And the SQL actually carries the filter (belt-and-braces).
  assert.match(pool.calls[0].sql, /revoked_at IS NULL/);
  assert.match(pool.calls[0].sql, /ORDER BY granted_at DESC/);
});

test('listOneOffPerks superuser synthesis is owner_perk-sourced, and assembly drops it all', async () => {
  const prev = process.env.SUPERUSER_STEAM_IDS;
  process.env.SUPERUSER_STEAM_IDS = '424242';
  try {
    const pool = makePerkPool(PERK_FIXTURE);
    const magDb = createDb({ getPool: () => pool });
    const rows = await magDb.listOneOffPerks(424242);
    assert.ok(rows.length > 0, 'superuser should get synthesized catalogue rows');
    assert.ok(rows.every(r => r.source === 'owner_perk' && r.granted_at === null));
    assert.equal(pool.calls.length, 0, 'superuser path must not hit the DB');
    // None of the synthesized rows may appear as purchases.
    const items = buildPurchaseHistory({ perks: rows });
    assert.equal(items.length, 0);
  } finally {
    if (prev === undefined) delete process.env.SUPERUSER_STEAM_IDS;
    else process.env.SUPERUSER_STEAM_IDS = prev;
  }
});

// ───────────────────────────────────────────────────────────────────────────
// Layer 2 — src/db/index.js list helpers keep their status/source filters.
// pg is stubbed BEFORE requiring ../src/db so getPool() returns a capturing
// fake; we assert on the WHERE clauses the helpers issue.
// ───────────────────────────────────────────────────────────────────────────

function loadDbWithCapturingPool() {
  const calls = [];
  const fakePool = {
    calls,
    async query(sqlRaw, params = []) {
      const sql = String(sqlRaw).replace(/\s+/g, ' ').trim();
      calls.push({ sql, params });
      return { rows: [], rowCount: 0 };
    },
  };
  const dbEntry = require.resolve('../src/db/index.js');
  stubModule('pg', { Pool: function Pool() { return fakePool; } }, dbEntry);
  delete require.cache[dbEntry];
  delete require.cache[require.resolve('../src/db')];
  const db = require('../src/db');
  return { db, calls };
}

test('db list helpers filter refunded/pending rows at the SQL layer', async (t) => {
  const { db, calls } = loadDbWithCapturingPool();
  t.after(() => {
    // Undo the pg stub so any later-required module gets the real driver.
    const dbEntry = require.resolve('../src/db/index.js');
    delete require.cache[Module.createRequire(dbEntry).resolve('pg')];
    delete require.cache[dbEntry];
    delete require.cache[require.resolve('../src/db')];
  });

  await db.listCoinPackPurchases(7);
  const topups = calls.pop();
  assert.match(topups.sql, /FROM coin_pack_purchases/);
  assert.match(topups.sql, /status = 'completed'/); // pending/refunded top-ups excluded
  assert.match(topups.sql, /ORDER BY COALESCE\(completed_at, created_at\) DESC/);

  await db.listFramePurchases(7);
  const frames = calls.pop();
  assert.match(frames.sql, /FROM frame_purchases/);
  assert.match(frames.sql, /status = 'active'/); // pending/refunded frames excluded

  await db.listFounderRingPurchases(7);
  const rings = calls.pop();
  assert.match(rings.sql, /FROM entitlements/);
  assert.match(rings.sql, /granted_by = 'stripe'/); // admin/promo grants excluded
  assert.match(rings.sql, /sku LIKE 'founder_ring:%' OR sku = 'founders_pass_ring'/);

  await db.listCoinPurchases(7);
  const coins = calls.pop();
  assert.match(coins.sql, /FROM coin_owned_cosmetics/);
  assert.match(coins.sql, /ORDER BY created_at DESC/);

  // All four helpers short-circuit without an account id (no query issued).
  const before = calls.length;
  assert.deepEqual(await db.listCoinPackPurchases(0), []);
  assert.deepEqual(await db.listFramePurchases(null), []);
  assert.deepEqual(await db.listFounderRingPurchases(undefined), []);
  assert.deepEqual(await db.listCoinPurchases(''), []);
  assert.equal(calls.length, before);
});

// ───────────────────────────────────────────────────────────────────────────
// Layer 3 — full pipeline: listOneOffPerks output → buildPurchaseHistory,
// mixed with the other sources. Pins the task's whole "done" list in one
// realistic scenario.
// ───────────────────────────────────────────────────────────────────────────

test('pipeline: refunds, pending checkouts and grants never appear; top-ups do; newest-first', async () => {
  const magDb = createDb({ getPool: () => makePerkPool(PERK_FIXTURE) });
  const perks = await magDb.listOneOffPerks(777);

  const items = buildPurchaseHistory({
    perks,
    framePurchases: [
      { frame_id: 'cosmic', amount_cents: 399, currency: 'aud',
        purchased_at: '2026-02-01T00:00:00Z' },
    ],
    coinPurchases: [
      // real coin purchase
      { kind: 'founder_ring', value: 'storm', coins_spent: 2000, created_at: '2026-03-01T00:00:00Z' },
      // lootbox grant — coins_spent = 0, must be excluded
      { kind: 'frame', value: 'fire', coins_spent: 0, created_at: '2026-03-02T00:00:00Z' },
    ],
    coinPackPurchases: [
      { id: 9, pack_id: 'standard', coins: 1200, amount_cents: 999, currency: 'aud',
        completed_at: '2026-04-01T00:00:00Z', created_at: '2026-03-31T00:00:00Z' },
    ],
    perkCatalog: { 'cosmetic:vanity_url': { name: 'Vanity URL Slug', cents: 1200 } },
  });

  // Exactly the four real purchases — refunded perk (pi_refunded), pending
  // checkout and coins_spent=0 grant are all absent.
  assert.deepEqual(items.map(i => i.type),
    ['coin_topup', 'coin_cosmetic', 'stripe_frame', 'stripe_perk']); // newest-first
  assert.ok(!items.some(i => i.stripe_payment_intent === 'pi_refunded'));
  assert.ok(!items.some(i => i.key === 'cosmetic:trophy_frame'));
  assert.ok(!items.some(i => i.key === 'frame:fire' && i.type === 'coin_cosmetic'));

  const topup = items.find(i => i.type === 'coin_topup');
  assert.equal(topup.amount_cents, 999);
  assert.equal(topup.purchased_at, '2026-04-01T00:00:00Z');
});

// ───────────────────────────────────────────────────────────────────────────
// Task #881 — charge.refunded actually revokes one-off perks.
//
// revokeOneOffPerksByPaymentIntent stamps revoked_at = NOW() on the active
// row(s) matching the payment intent (idempotent: already-revoked rows are
// skipped), and the webhook branch in src/web/server.js routes through it.
// Combined with the listOneOffPerks filter pinned above, a refunded perk
// disappears from /me/perks and /me/purchase-history.
// ───────────────────────────────────────────────────────────────────────────

function makeRevokePool(rows) {
  const calls = [];
  return {
    calls,
    async query(sqlRaw, params = []) {
      const sql = String(sqlRaw).replace(/\s+/g, ' ').trim();
      calls.push({ sql, params });
      if (!/UPDATE user_one_off_perks/.test(sql)) {
        throw new Error('unexpected query: ' + sql.slice(0, 100));
      }
      // Apply the UPDATE semantics: match intent, skip already-revoked.
      const hit = rows.filter(r =>
        r.stripe_payment_intent === params[0] && r.revoked_at === null);
      for (const r of hit) r.revoked_at = '2026-05-01T00:00:00Z';
      return { rows: hit, rowCount: hit.length };
    },
  };
}

test('revokeOneOffPerksByPaymentIntent stamps revoked_at, is idempotent, skips empty pi', async () => {
  const rows = [
    { id: 1, account_id: 777, perk_key: 'cosmetic:vanity_url', granted_at: '2026-01-05T00:00:00Z',
      source: 'stripe', amount_cents: 1200, currency: 'aud',
      stripe_payment_intent: 'pi_refund_me', revoked_at: null, expires_at: null, metadata: null },
    { id: 2, account_id: 777, perk_key: 'cosmetic:voice_pack', granted_at: '2026-01-06T00:00:00Z',
      source: 'stripe', amount_cents: 800, currency: 'aud',
      stripe_payment_intent: 'pi_other', revoked_at: null, expires_at: null, metadata: null },
  ];
  const pool = makeRevokePool(rows);
  const magDb = createDb({ getPool: () => pool });

  // No payment intent → short-circuit, no query.
  assert.deepEqual(await magDb.revokeOneOffPerksByPaymentIntent(null), []);
  assert.deepEqual(await magDb.revokeOneOffPerksByPaymentIntent(''), []);
  assert.equal(pool.calls.length, 0);

  // First call revokes exactly the matching active row.
  const revoked = await magDb.revokeOneOffPerksByPaymentIntent('pi_refund_me');
  assert.deepEqual(revoked.map(r => r.id), [1]);
  assert.ok(rows[0].revoked_at !== null);
  assert.equal(rows[1].revoked_at, null, 'unrelated perk untouched');
  // SQL carries the guards that make it safe/idempotent.
  const call = pool.calls[pool.calls.length - 1];
  assert.match(call.sql, /SET revoked_at = NOW\(\)/);
  assert.match(call.sql, /stripe_payment_intent = \$1/);
  assert.match(call.sql, /revoked_at IS NULL/);

  // Second call (webhook retry) is a no-op.
  assert.deepEqual(await magDb.revokeOneOffPerksByPaymentIntent('pi_refund_me'), []);
});

test('refund-revoked perk vanishes from listOneOffPerks (the /me/perks + purchase-history source)', async () => {
  const rows = [
    { id: 1, account_id: 777, perk_key: 'cosmetic:vanity_url', granted_at: '2026-01-05T00:00:00Z',
      source: 'stripe', amount_cents: 1200, currency: 'aud',
      stripe_payment_intent: 'pi_refund_me', revoked_at: null, expires_at: null, metadata: null },
  ];
  // Pool that serves both the UPDATE (revoke) and the SELECT (list) against
  // the same in-memory rows.
  const pool = {
    async query(sqlRaw, params = []) {
      const sql = String(sqlRaw).replace(/\s+/g, ' ').trim();
      if (/UPDATE user_one_off_perks/.test(sql)) {
        const hit = rows.filter(r => r.stripe_payment_intent === params[0] && r.revoked_at === null);
        for (const r of hit) r.revoked_at = '2026-05-01T00:00:00Z';
        return { rows: hit, rowCount: hit.length };
      }
      let out = rows.filter(r => String(r.account_id) === String(params[0]));
      if (/revoked_at IS NULL/.test(sql)) out = out.filter(r => r.revoked_at === null);
      return { rows: out, rowCount: out.length };
    },
  };
  const magDb = createDb({ getPool: () => pool });

  assert.deepEqual((await magDb.listOneOffPerks(777)).map(r => r.id), [1]);
  await magDb.revokeOneOffPerksByPaymentIntent('pi_refund_me');
  assert.deepEqual(await magDb.listOneOffPerks(777), []);
  assert.equal(await magDb.hasOneOffPerk(777, 'cosmetic:vanity_url'), false);
});

test('charge.refunded webhook branch routes through revokeOneOffPerksByPaymentIntent', () => {
  // The webhook handler is deep inside createServer(); booting the whole
  // server in a unit test is impractical, so pin the wiring at source level:
  // the charge.refunded branch must call the revoke helper (best-effort,
  // like the other refund handlers).
  const fs = require('fs');
  const src = fs.readFileSync(require.resolve('../src/web/server.js'), 'utf8');
  const start = src.indexOf("event.type === 'charge.refunded'");
  assert.ok(start > -1, 'charge.refunded branch exists');
  const branch = src.slice(start, src.indexOf('} else if', start + 1));
  assert.match(branch, /magV3\.revokeOneOffPerksByPaymentIntent\(pi\)/);
  assert.match(branch, /\.catch\(\(\) => \[\]\)/, 'best-effort like the other refund handlers');
});
