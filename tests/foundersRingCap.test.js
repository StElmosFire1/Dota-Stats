// Task #220 — automated tests for the Founders Pass cap and Cover FX gating.
//
// Covers:
//  1. grantEntitlementWithCap is concurrency-safe — under N parallel grants
//     against a cap of K (K < N), exactly K succeed and the rest fail with
//     reason='cap_reached'.
//  2. validateCoverFx dedupes, drops unknown ids, drops non-strings, and
//     caps the array length at COVER_FX_IDS.length (6).
//  3. POST /api/me/profile strips cover_fx for non-Pro members — sending
//     a populated cover_fx as a non-Pro member persists [] to the column.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

// ── Shared util: stub a require.cache entry so a require(...) returns `exports`.
function stubModule(specifier, exports, fromPath = __filename) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

// ───────────────────────────────────────────────────────────────────────────
// 1. grantEntitlementWithCap concurrency
// ───────────────────────────────────────────────────────────────────────────
//
// We stub the `pg` module before requiring `../src/db` so the DB module's
// internal `getPool()` returns our fake pool. The fake serializes
// transactions per-SKU using a Promise chain that mirrors the
// `pg_advisory_xact_lock(hashtext(sku))` semantics — concurrent BEGINs are
// fine, but the SELECT pg_advisory_xact_lock call blocks until the
// previous transaction has COMMIT/ROLLBACK'd.

function _makeFakePgPool() {
  const entitlements = [];
  const skuLockChain = new Map();
  return {
    entitlements,
    async connect() {
      let txInserts = [];
      let releaseLock = null;
      return {
        async query(sqlRaw, params = []) {
          const sql = String(sqlRaw);
          if (sql === 'BEGIN') { txInserts = []; return { rows: [] }; }
          if (sql === 'COMMIT') {
            for (const e of txInserts) entitlements.push(e);
            txInserts = [];
            if (releaseLock) { releaseLock(); releaseLock = null; }
            return { rows: [] };
          }
          if (sql === 'ROLLBACK') {
            txInserts = [];
            if (releaseLock) { releaseLock(); releaseLock = null; }
            return { rows: [] };
          }
          if (sql.includes('pg_advisory_xact_lock')) {
            const sku = params[0];
            const prev = skuLockChain.get(sku) || Promise.resolve();
            let release;
            const next = new Promise(r => { release = r; });
            skuLockChain.set(sku, next);
            await prev;
            releaseLock = release;
            return { rows: [{}] };
          }
          if (sql.includes('SELECT 1 FROM entitlements')) {
            const [accountId, sku] = params;
            const found =
              entitlements.some(e => e.account_id === accountId && e.sku === sku) ||
              txInserts.some(e => e.account_id === accountId && e.sku === sku);
            return { rows: found ? [{ '?column?': 1 }] : [] };
          }
          if (sql.includes('SELECT COUNT(*)::int AS n FROM entitlements')) {
            const [sku] = params;
            const n =
              entitlements.filter(e => e.sku === sku).length +
              txInserts.filter(e => e.sku === sku).length;
            return { rows: [{ n }] };
          }
          if (sql.startsWith('INSERT INTO entitlements')) {
            const [accountId, sku] = params;
            const exists =
              entitlements.some(e => e.account_id === accountId && e.sku === sku) ||
              txInserts.some(e => e.account_id === accountId && e.sku === sku);
            if (!exists) txInserts.push({ account_id: accountId, sku });
            return { rows: [] };
          }
          throw new Error('unexpected query in fake pool: ' + sql.slice(0, 80));
        },
        release() {
          if (releaseLock) { releaseLock(); releaseLock = null; }
        },
      };
    },
  };
}

function _loadDbWithFakePool(fakePool) {
  // Stub `pg` BEFORE requiring `../src/db` so the module-level `pool`
  // variable is bound to our fake on first getPool() call.
  delete require.cache[require.resolve('pg')];
  delete require.cache[require.resolve('../src/db')];
  delete require.cache[require.resolve('../src/db/index.js')];
  require.cache[require.resolve('pg')] = {
    id: require.resolve('pg'),
    filename: require.resolve('pg'),
    loaded: true,
    exports: { Pool: function FakePool() { return fakePool; } },
  };
  return require('../src/db');
}

test('grantEntitlementWithCap: 5 concurrent grants vs cap=3 → exactly 3 succeed', async () => {
  const fakePool = _makeFakePgPool();
  const db = _loadDbWithFakePool(fakePool);
  const SKU = 'founders_pass_ring';
  const calls = [];
  for (let i = 1; i <= 5; i++) {
    calls.push(db.grantEntitlementWithCap({ accountId: i, sku: SKU, cap: 3 }));
  }
  const results = await Promise.all(calls);
  const granted = results.filter(r => r.ok && r.granted);
  const capped  = results.filter(r => !r.ok && r.reason === 'cap_reached');
  assert.equal(granted.length, 3, 'exactly 3 grants should succeed');
  assert.equal(capped.length, 2, 'remaining 2 should fail with cap_reached');
  assert.equal(fakePool.entitlements.filter(e => e.sku === SKU).length, 3,
    'ledger should hold exactly the cap (3) rows');
});

test('grantEntitlementWithCap: idempotent — repeat grant for same account returns already_owned without rotating ledger', async () => {
  const fakePool = _makeFakePgPool();
  const db = _loadDbWithFakePool(fakePool);
  const SKU = 'founders_pass_ring';
  const r1 = await db.grantEntitlementWithCap({ accountId: 42, sku: SKU, cap: 1 });
  const r2 = await db.grantEntitlementWithCap({ accountId: 42, sku: SKU, cap: 1 });
  assert.deepEqual(r1, { ok: true, granted: true, reason: null });
  assert.deepEqual(r2, { ok: true, granted: false, reason: 'already_owned' });
  // A different account at cap=1 should still be capped (not granted).
  const r3 = await db.grantEntitlementWithCap({ accountId: 99, sku: SKU, cap: 1 });
  assert.equal(r3.ok, false);
  assert.equal(r3.reason, 'cap_reached');
  assert.equal(fakePool.entitlements.filter(e => e.sku === SKU).length, 1);
});

// ───────────────────────────────────────────────────────────────────────────
// 2. validateCoverFx canonicalisation
// ───────────────────────────────────────────────────────────────────────────

test('validateCoverFx: dedupes, drops unknowns, drops non-strings, caps length at 6', () => {
  // Re-require fresh so the db stub from above doesn't leak (this module
  // doesn't depend on db, but be explicit).
  delete require.cache[require.resolve('../src/profileCosmetics')];
  const cosm = require('../src/profileCosmetics');

  // Non-array → empty array.
  assert.deepEqual(cosm.validateCoverFx(null), []);
  assert.deepEqual(cosm.validateCoverFx('shimmer'), []);
  assert.deepEqual(cosm.validateCoverFx({ shimmer: true }), []);

  // Dedup + drop unknowns + drop non-strings, preserving first-seen order.
  const out = cosm.validateCoverFx([
    'shimmer', 'shimmer', 'kenburns',
    'NOT_A_REAL_FX', null, 42, { id: 'particle' },
    'parallax',
  ]);
  assert.deepEqual(out, ['shimmer', 'kenburns', 'parallax']);

  // Cap at COVER_FX_IDS.length (6) — flooding with 50 valid+repeats can't
  // grow the array past 6 entries.
  const flooded = [];
  for (let i = 0; i < 10; i++) {
    for (const id of cosm.COVER_FX_IDS) flooded.push(id);
  }
  flooded.push('shimmer', 'kenburns'); // extra dupes after the flood
  const capped = cosm.validateCoverFx(flooded);
  assert.equal(capped.length, cosm.COVER_FX_IDS.length);
  assert.equal(capped.length, 6);
  // Exactly the canonical id set, in first-seen order.
  assert.deepEqual(capped, cosm.COVER_FX_IDS);
});

// ───────────────────────────────────────────────────────────────────────────
// 3. POST /api/me/profile strips cover_fx for non-Pro members
// ───────────────────────────────────────────────────────────────────────────
//
// We mount the real createApiRouter() with a stubbed `db` module + stubbed
// heavy transitive modules, then invoke the POST /me/profile route handler
// directly with a fake req/res. We assert the value persisted via
// db.setPlayerProfileCustomization.cover_fx is the empty array (i.e. the
// non-Pro caller's attempted FX selection was stripped).

function _stubServerDeps({ isPro, currentCustomization }) {
  const captured = { savedArgs: null, postRouteCalled: false };
  const dbStub = {
    isProMember: async () => isPro,
    getPlayerProfileCustomization: async () => currentCustomization,
    setPlayerProfileCustomization: async (_id, fields) => {
      captured.savedArgs = fields;
      return fields;
    },
    getOwnedEntitlements: async () => [],
    getMergedAccountIds: async (id) => [id],
    getPlayerAchievements: async () => [],
    hasFrameUnlocked: async () => true,
    getPool: () => ({ query: async () => ({ rows: [] }) }),
    // The router pulls many other db.* helpers at construction OR on hit;
    // forward unknown property reads as no-op async functions so any
    // accidental access from unrelated routes loaded by createApiRouter
    // doesn't blow up at module-load time. (Routes we don't call won't run.)
  };
  // Make any unknown db.* reference a no-op async stub so `createApiRouter`
  // can wire up every route without referencing handlers.
  const proxiedDb = new Proxy(dbStub, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return async () => null;
    },
  });

  // Heavy transitive modules — replace with inert exports so requiring
  // ../src/web/server.js doesn't pull half the app into the test process.
  stubModule('../src/replay/replayParser',  { getReplayParser:  () => ({ parserReady: false }) });
  stubModule('../src/stats/statsService',   { getStatsService:  () => ({}) });
  stubModule('../src/services/groqService', { generateChatResponse: async () => '', generateWeeklyRecapBlurb: async () => '' });
  stubModule('../src/discord/bot',          { getDiscordBot:    () => ({ isInLeagueGuild: async () => ({ inGuild: null }) }) });
  stubModule('../src/web/voiceEventQueue',  { enqueue: () => {}, drain: () => {} });
  // Magazine v3 mounter logs a `route mount failed` warning when invoked
  // with `app=null`; stub it out so test output stays clean.
  stubModule('../src/monetization/magazineV3', {
    mountMagazineV3Routes: () => {},
    handleStripeWebhookPurpose: async () => null,
    startWeeklyReportWorker: () => {},
    REPLAY_RATE_LIMIT_PER_DAY: 0,
  });

  // Replace the `../db` module BEFORE loading server.js.
  const dbPath = require.resolve('../src/db');
  delete require.cache[dbPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: proxiedDb };

  return { captured, proxiedDb };
}

function _findRoute(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method]) {
      return layer.route;
    }
  }
  throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
}

async function _invokeHandler(route, req) {
  // Walk the route's middleware stack. We pre-set req.body so the
  // express.json() middleware (which would parse a real request stream)
  // is effectively a no-op — it sees a body-less req but next()s through.
  let resJson = null;
  let resStatus = 200;
  let nextErr = null;
  const res = {
    headersSent: false,
    status(code) { resStatus = code; return this; },
    json(obj) { resJson = obj; this.headersSent = true; return this; },
    set() { return this; },
    setHeader() { return this; },
    send(obj) { resJson = obj; this.headersSent = true; return this; },
  };
  const stack = [...route.stack];
  for (const layer of stack) {
    if (res.headersSent) break;
    await new Promise((resolve, reject) => {
      try {
        const ret = layer.handle(req, res, (err) => { if (err) nextErr = err; resolve(); });
        if (ret && typeof ret.then === 'function') ret.then(() => resolve(), reject);
      } catch (err) { reject(err); }
    });
    if (nextErr) throw nextErr;
  }
  return { status: resStatus, body: resJson };
}

test('POST /api/me/profile strips cover_fx for a non-Pro member', async () => {
  // Neutralize the long-running setInterval timers in server.js so node:test
  // can exit cleanly after the assertions resolve.
  const _origSetInterval = global.setInterval;
  global.setInterval = (...args) => {
    const id = _origSetInterval(...args);
    if (id && typeof id.unref === 'function') id.unref();
    return id;
  };

  try {
    const { captured } = _stubServerDeps({
      isPro: false,
      currentCustomization: { cover_fx: [], pinned_achievements: [] },
    });

    // Force a fresh load of server.js with our stubs in place.
    delete require.cache[require.resolve('../src/web/server')];
    const { createApiRouter } = require('../src/web/server');
    const router = createApiRouter({}, null);

    const route = _findRoute(router, 'post', '/me/profile');
    const req = {
      session: { accountId: 12345 },
      body: {
        // Non-Pro caller tries to enable every cover effect at once.
        cover_fx: ['shimmer', 'kenburns', 'parallax', 'particle', 'vignette-pulse', 'streak-glow'],
      },
      headers: {},
    };
    const result = await _invokeHandler(route, req);

    // The route documents this case as 403 ("reserved for Pro members").
    // Whichever shape the implementation chose (403 OR silently strip and
    // 200), the security guarantee is the same: the column must NOT be
    // populated. Assert that explicitly.
    if (result.status === 200) {
      assert.ok(captured.savedArgs, 'setPlayerProfileCustomization should have been called');
      assert.deepEqual(captured.savedArgs.cover_fx, [],
        'non-Pro cover_fx must be stripped to [] before persistence');
    } else {
      assert.equal(result.status, 403, 'non-Pro cover_fx should be 403 if not silently stripped');
      assert.equal(captured.savedArgs, null,
        'on 403 the persistence helper must not be called at all');
    }
  } finally {
    global.setInterval = _origSetInterval;
  }
});

test('POST /api/me/profile preserves existing cover_fx when the field is omitted (Pro member)', async () => {
  const _origSetInterval = global.setInterval;
  global.setInterval = (...args) => {
    const id = _origSetInterval(...args);
    if (id && typeof id.unref === 'function') id.unref();
    return id;
  };
  try {
    const existing = ['shimmer', 'kenburns'];
    const { captured } = _stubServerDeps({
      isPro: true,
      currentCustomization: { cover_fx: existing, pinned_achievements: [] },
    });
    delete require.cache[require.resolve('../src/web/server')];
    const { createApiRouter } = require('../src/web/server');
    const router = createApiRouter({}, null);
    const route = _findRoute(router, 'post', '/me/profile');
    const req = { session: { accountId: 7 }, body: { /* no cover_fx field */ }, headers: {} };
    const result = await _invokeHandler(route, req);
    assert.equal(result.status, 200);
    assert.ok(captured.savedArgs);
    assert.deepEqual(captured.savedArgs.cover_fx, existing,
      'omitting cover_fx must preserve the previously stored array for Pro members');
  } finally {
    global.setInterval = _origSetInterval;
  }
});
