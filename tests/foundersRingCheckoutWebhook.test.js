// Task #240 — automated tests for the Stripe Founders Pass checkout +
// webhook flow. Task #220 covered the cap helper itself
// (`grantEntitlementWithCap`) and the cover_fx Pro-gate; this file covers
// the actual Stripe wiring around the Founders Pass:
//
//   1. POST /api/shop/founders-ring/checkout
//        a. 401 when the caller is not signed in.
//        b. 409 when the caller already owns the ring.
//        c. 409 when the cap (sold >= cap) is already reached.
//        d. Happy path → calls Stripe with metadata.purpose === 'founders_ring'
//           (and account_id / sku) and returns the session URL.
//
//   2. POST /api/stripe/webhook (purpose === 'founders_ring' branch)
//        a. Routes a synthetic checkout.session.completed event through to
//           db.grantEntitlementWithCap with the right args.
//        b. Idempotent on replay — a second identical event still resolves
//           cleanly (same call args, no exception); the db helper is the
//           idempotency guarantor (returns already_owned on the replay).
//
// We re-use the existing test harness pattern from tests/foundersRingCap.js:
// stub heavy transitive modules + the `db` module via require.cache before
// loading server.js, then walk the route stack and invoke handlers directly
// with a fake req/res — no live HTTP, no live Stripe.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

// ── stubModule: same primitive as foundersRingCap.test.js ────────────────
function stubModule(specifier, exports, fromPath = __filename) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

// ── _stubServerDeps: like foundersRingCap.test.js but parametrised for
// the founders-ring flow. We let the caller pre-seed the db stub with
// hasEntitlement / countEntitlementHolders / grantEntitlementWithCap
// behaviours and capture every grantEntitlementWithCap call so the
// webhook test can assert "called with the right args".
// The checkout route 503s before any ownership/cap logic when
// STRIPE_SECRET_KEY is absent, so hosts that run tests without a Stripe env
// (e.g. the prod deploy gate shell) need a dummy key for the 4xx-path tests.
// The Stripe client itself is stubbed — no network calls are ever made.
if (!process.env.STRIPE_SECRET_KEY) process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';

function _stubServerDeps(dbOverrides = {}) {
  const captured = {
    grantCalls: [],
    hasEntitlementCalls: [],
    countEntitlementHoldersCalls: [],
    stripeCreateCalls: [],
  };

  const baseDb = {
    isProMember: async () => false,
    getPlayerProfileCustomization: async () => ({ cover_fx: [], pinned_achievements: [] }),
    setPlayerProfileCustomization: async (_id, fields) => fields,
    getOwnedEntitlements: async () => [],
    getMergedAccountIds: async (id) => [id],
    getPlayerAchievements: async () => [],
    hasFrameUnlocked: async () => true,
    getPool: () => ({ query: async () => ({ rows: [] }) }),
    hasEntitlement: async (accountId, sku) => {
      captured.hasEntitlementCalls.push({ accountId, sku });
      return false;
    },
    countEntitlementHolders: async (sku) => {
      captured.countEntitlementHoldersCalls.push({ sku });
      return 0;
    },
    grantEntitlementWithCap: async (args) => {
      captured.grantCalls.push(args);
      return { ok: true, granted: true, reason: null };
    },
  };
  // Apply caller overrides (these win over defaults but are still wrapped
  // by the capture-recording variants where applicable).
  const merged = { ...baseDb };
  for (const [k, v] of Object.entries(dbOverrides)) {
    if (k === 'hasEntitlement') {
      merged.hasEntitlement = async (accountId, sku) => {
        captured.hasEntitlementCalls.push({ accountId, sku });
        return v(accountId, sku);
      };
    } else if (k === 'countEntitlementHolders') {
      merged.countEntitlementHolders = async (sku) => {
        captured.countEntitlementHoldersCalls.push({ sku });
        return v(sku);
      };
    } else if (k === 'grantEntitlementWithCap') {
      merged.grantEntitlementWithCap = async (args) => {
        captured.grantCalls.push(args);
        return v(args);
      };
    } else {
      merged[k] = v;
    }
  }
  // Forward any unknown db.* read as a no-op async stub so unrelated
  // routes loaded by createApiRouter don't blow up at module-load time.
  const proxiedDb = new Proxy(merged, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return async () => null;
    },
  });

  // Heavy transitive modules — replace with inert exports.
  stubModule('../src/replay/replayParser',  { getReplayParser:  () => ({ parserReady: false }) });
  stubModule('../src/stats/statsService',   { getStatsService:  () => ({}) });
  stubModule('../src/services/groqService', { generateChatResponse: async () => '', generateWeeklyRecapBlurb: async () => '' });
  stubModule('../src/discord/bot',          { getDiscordBot:    () => ({ isInLeagueGuild: async () => ({ inGuild: null }) }) });
  stubModule('../src/web/voiceEventQueue',  { enqueue: () => {}, drain: () => {} });
  stubModule('../src/monetization/magazineV3', {
    mountMagazineV3Routes: () => {},
    handleStripeWebhookPurpose: async () => null,
    startWeeklyReportWorker: () => {},
    REPLAY_RATE_LIMIT_PER_DAY: 0,
  });

  // Stub the Stripe SDK. `require('stripe')(secret)` returns an object
  // with `checkout.sessions.create` and `webhooks.constructEvent`. The
  // webhook test pre-sets `__nextEvent` on the stub so constructEvent
  // returns a controlled synthetic event.
  const stripeStub = {
    __nextEvent: null,
    __refundResult: null,    // override return value of refunds.create
    __refundShouldThrow: null, // Error to throw from refunds.create
    __refundCalls: [],
    checkout: {
      sessions: {
        create: async (args) => {
          captured.stripeCreateCalls.push(args);
          return { id: 'cs_test_fake', url: 'https://stripe.test/checkout/cs_test_fake' };
        },
      },
    },
    refunds: {
      create: async (args) => {
        stripeStub.__refundCalls.push(args);
        if (stripeStub.__refundShouldThrow) throw stripeStub.__refundShouldThrow;
        return stripeStub.__refundResult || { id: 're_test_fake', status: 'succeeded' };
      },
    },
    webhooks: {
      constructEvent: (_body, _sig, _secret) => {
        if (!stripeStub.__nextEvent) {
          throw new Error('test bug: stripeStub.__nextEvent not set');
        }
        return stripeStub.__nextEvent;
      },
    },
  };
  const stripeFactory = (_key) => stripeStub;
  stubModule('stripe', stripeFactory);

  // Replace the `../db` module BEFORE loading server.js.
  const dbPath = require.resolve('../src/db');
  delete require.cache[dbPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: proxiedDb };

  return { captured, proxiedDb, stripeStub };
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
        // Sync middleware that ends the response without calling next()
        // (e.g. requireSuperuser returning res.status(401).json(...)) would
        // otherwise leave this promise unresolved and hang the test loop.
        else if (res.headersSent) resolve();
      } catch (err) { reject(err); }
    });
    if (nextErr) throw nextErr;
  }
  return { status: resStatus, body: resJson };
}

// Common setup: server.js spawns a few setInterval timers at module-load
// time. Wrap setInterval so node:test can exit cleanly after assertions.
function _withUnreffedIntervals(fn) {
  return async (...args) => {
    const orig = global.setInterval;
    global.setInterval = (...a) => {
      const id = orig(...a);
      if (id && typeof id.unref === 'function') id.unref();
      return id;
    };
    try { return await fn(...args); }
    finally { global.setInterval = orig; }
  };
}

function _loadServerFresh() {
  delete require.cache[require.resolve('../src/web/server')];
  return require('../src/web/server');
}

// ── 1. POST /api/shop/founders-ring/checkout ─────────────────────────────

test('founders-ring/checkout: 401 when not signed in', _withUnreffedIntervals(async () => {
  _stubServerDeps();
  const { createApiRouter } = _loadServerFresh();
  const router = createApiRouter({}, null);
  const route = _findRoute(router, 'post', '/shop/founders-ring/checkout');
  const result = await _invokeHandler(route, { session: {}, body: {}, headers: {} });
  assert.equal(result.status, 401);
  assert.match(result.body.error, /sign in/i);
}));

test('founders-ring/checkout: 409 when caller already owns the ring', _withUnreffedIntervals(async () => {
  const { captured } = _stubServerDeps({
    hasEntitlement: async () => true,
  });
  const { createApiRouter } = _loadServerFresh();
  const router = createApiRouter({}, null);
  const route = _findRoute(router, 'post', '/shop/founders-ring/checkout');
  const result = await _invokeHandler(route, {
    session: { accountId: 12345 },
    body: {},
    headers: {},
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.already_owned, true);
  // Stripe must NOT have been called when the caller already owns the ring.
  assert.equal(captured.stripeCreateCalls.length, 0,
    'Stripe checkout.sessions.create must not be called when caller already owns');
}));

test('founders-ring/checkout: 409 sold_out when cap reached', _withUnreffedIntervals(async () => {
  const prev = process.env.FOUNDERS_RING_CAP;
  process.env.FOUNDERS_RING_CAP = '5';
  try {
    const { captured } = _stubServerDeps({
      hasEntitlement: async () => false,
      countEntitlementHolders: async () => 5, // == cap
    });
    const { createApiRouter } = _loadServerFresh();
    const router = createApiRouter({}, null);
    const route = _findRoute(router, 'post', '/shop/founders-ring/checkout');
    const result = await _invokeHandler(route, {
      session: { accountId: 99 }, body: {}, headers: {},
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.sold_out, true);
    assert.equal(captured.stripeCreateCalls.length, 0,
      'Stripe checkout must not be created once the cap is reached');
  } finally {
    if (prev === undefined) delete process.env.FOUNDERS_RING_CAP;
    else process.env.FOUNDERS_RING_CAP = prev;
  }
}));

test('founders-ring/checkout: happy path creates Stripe session with purpose=founders_ring metadata', _withUnreffedIntervals(async () => {
  const prevSecret = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  try {
    const { captured } = _stubServerDeps({
      hasEntitlement: async () => false,
      countEntitlementHolders: async () => 0,
    });
    const { createApiRouter } = _loadServerFresh();
    const router = createApiRouter({}, null);
    const route = _findRoute(router, 'post', '/shop/founders-ring/checkout');
    const result = await _invokeHandler(route, {
      session: { accountId: 4242 }, body: {}, headers: {},
    });
    assert.equal(result.status, 200);
    assert.match(result.body.url, /^https:\/\/stripe\.test\//);
    assert.equal(captured.stripeCreateCalls.length, 1);
    const args = captured.stripeCreateCalls[0];
    assert.equal(args.mode, 'payment');
    assert.equal(args.metadata.purpose, 'founders_ring',
      'metadata.purpose MUST be exactly "founders_ring" so the webhook routes correctly');
    assert.equal(args.metadata.account_id, '4242');
    assert.equal(args.metadata.sku, 'founders_pass_ring');
  } finally {
    if (prevSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = prevSecret;
  }
}));

// ── 2. Stripe webhook → founders_ring branch ─────────────────────────────
//
// The webhook is mounted on `app` (not on the router) inside createServer().
// We boot a real createServer() with the heavy deps stubbed, then walk
// app._router.stack to find the route layer for /api/stripe/webhook and
// invoke its handler directly. The Stripe stub's constructEvent returns
// whatever event we pre-stage on `stripeStub.__nextEvent`.

function _findAppRoute(app, method, path) {
  // Express 4 stashes the internal router on `app._router`; Express 5 moved
  // it to `app.router` and only lazy-creates `_router` on first use. Support
  // both so the test isn't pinned to a single express major.
  const router = app._router || app.router;
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method]) {
      return layer.route;
    }
  }
  throw new Error(`app route not found: ${method.toUpperCase()} ${path}`);
}

async function _bootServerWithStubs(dbOverrides) {
  const prevEnv = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  };
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
  if (process.env.NODE_ENV === 'production') delete process.env.NODE_ENV;

  const harness = _stubServerDeps(dbOverrides);
  // Also neutralise connect-pg-simple — it tries to talk to Postgres at
  // boot. Stub it to a trivial Store factory so createServer() never
  // touches a real DB.
  stubModule('connect-pg-simple', () => {
    function FakeStore() {
      this.on = () => {};
      this.get = (_sid, cb) => cb && cb(null, null);
      this.set = (_sid, _sess, cb) => cb && cb(null);
      this.destroy = (_sid, cb) => cb && cb(null);
    }
    return FakeStore;
  });

  const { createServer } = _loadServerFresh();
  const app = createServer({});
  return { app, ...harness, restoreEnv() {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }};
}

function _makeFoundersRingEvent(accountId, sessionId = 'cs_live_fake_1') {
  return {
    id: 'evt_test_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        payment_status: 'paid',
        amount_total: 999,
        currency: 'aud',
        payment_intent: 'pi_test_1',
        metadata: {
          purpose: 'founders_ring',
          account_id: String(accountId),
          sku: 'founders_pass_ring',
        },
      },
    },
  };
}

test('stripe webhook: founders_ring branch calls grantEntitlementWithCap with correct args', _withUnreffedIntervals(async () => {
  const harness = await _bootServerWithStubs({
    grantEntitlementWithCap: async () => ({ ok: true, granted: true, reason: null }),
  });
  try {
    const { app, captured, stripeStub } = harness;
    const route = _findAppRoute(app, 'post', '/api/stripe/webhook');
    stripeStub.__nextEvent = _makeFoundersRingEvent(7777);
    const req = {
      body: Buffer.from('{}'),
      headers: { 'stripe-signature': 't=1,v1=fake' },
      method: 'POST',
      url: '/api/stripe/webhook',
    };
    const result = await _invokeHandler(route, req);
    assert.equal(result.status, 200, 'webhook should ack successful fulfilment with 200');
    assert.equal(captured.grantCalls.length, 1, 'grantEntitlementWithCap must be called exactly once');
    const call = captured.grantCalls[0];
    assert.equal(call.accountId, '7777');
    assert.equal(call.sku, 'founders_pass_ring');
    assert.equal(call.grantedBy, 'stripe');
    assert.ok(call.cap > 0, 'cap must be a positive number');
    assert.equal(call.metadata.stripe_session_id, 'cs_live_fake_1');
    assert.equal(call.metadata.amount_cents, 999);
    assert.equal(call.metadata.currency, 'aud');
  } finally {
    harness.restoreEnv();
  }
}));

// ── 3. Cap-race auto-refund (Task #256) ──────────────────────────────────
//
// When grantEntitlementWithCap returns reason='cap_reached' AFTER a paid
// checkout (the cap was hit between session-init and webhook delivery), the
// webhook MUST:
//   a. issue stripe.refunds.create({ payment_intent }),
//   b. persist the outcome via db.recordFoundersRingRefund (status, refund_id),
//   c. dispatch a Discord DM to the buyer via the bot's notifyFoundersRingRefund.
// The test drives all three by stubbing grantEntitlementWithCap to return
// cap_reached and asserting the side effects via the captured stub state.

test('stripe webhook: cap-race loser is auto-refunded, audited, and DM\'d', _withUnreffedIntervals(async () => {
  const refundAuditCalls = [];
  const harness = await _bootServerWithStubs({
    grantEntitlementWithCap: async () => ({ ok: false, granted: false, reason: 'cap_reached' }),
    recordFoundersRingRefund: async (args) => {
      refundAuditCalls.push(args);
      return { id: 1, ...args };
    },
  });
  // The default stubbed bot exposes only isInLeagueGuild; swap it for one
  // that captures notifyFoundersRingRefund calls so the assertion is real.
  const dmCalls = [];
  stubModule('../src/discord/bot', {
    getDiscordBot: () => ({
      isInLeagueGuild: async () => ({ inGuild: null }),
      notifyFoundersRingRefund: async (args) => { dmCalls.push(args); return true; },
    }),
  });
  // Re-load server.js so the new bot stub is picked up.
  delete require.cache[require.resolve('../src/web/server')];
  const { createServer } = require('../src/web/server');
  const app = createServer({});
  try {
    const { stripeStub } = harness;
    const route = _findAppRoute(app, 'post', '/api/stripe/webhook');
    stripeStub.__nextEvent = _makeFoundersRingEvent(5151, 'cs_live_caprace_1');
    stripeStub.__refundResult = { id: 're_test_caprace_1', status: 'succeeded' };
    const req = { body: Buffer.from('{}'), headers: { 'stripe-signature': 't=1,v1=fake' } };
    const result = await _invokeHandler(route, req);
    assert.equal(result.status, 200, 'webhook must ack 200 once the auto-refund succeeds');

    // (a) Stripe refund was issued against the right payment_intent.
    assert.equal(stripeStub.__refundCalls.length, 1, 'stripe.refunds.create must be called exactly once');
    assert.equal(stripeStub.__refundCalls[0].payment_intent, 'pi_test_1');
    assert.equal(stripeStub.__refundCalls[0].metadata.reason, 'founders_ring_cap_race');
    assert.equal(stripeStub.__refundCalls[0].metadata.account_id, '5151');
    assert.equal(stripeStub.__refundCalls[0].metadata.stripe_session_id, 'cs_live_caprace_1');

    // (b) Audit row persisted with status=refunded + refund id.
    assert.equal(refundAuditCalls.length, 1, 'recordFoundersRingRefund must be called exactly once');
    const audit = refundAuditCalls[0];
    assert.equal(audit.accountId, '5151');
    assert.equal(audit.sku, 'founders_pass_ring');
    assert.equal(audit.stripeSessionId, 'cs_live_caprace_1');
    assert.equal(audit.stripePaymentIntent, 'pi_test_1');
    assert.equal(audit.stripeRefundId, 're_test_caprace_1');
    assert.equal(audit.amountCents, 999);
    assert.equal(audit.currency, 'aud');
    assert.equal(audit.status, 'refunded');
    assert.equal(audit.errorMessage, null);

    // (c) DM dispatched. Note the dispatch is fire-and-forget on the
    // webhook side; node:test's microtask queue runs the awaited
    // .catch(() => {}) chain before _invokeHandler resolves, so the call
    // is captured by the time we assert here.
    assert.equal(dmCalls.length, 1, 'notifyFoundersRingRefund must be called exactly once');
    assert.equal(dmCalls[0].accountId, '5151');
    assert.equal(dmCalls[0].amountCents, 999);
    assert.equal(dmCalls[0].refundId, 're_test_caprace_1');
  } finally {
    harness.restoreEnv();
  }
}));

test('stripe webhook: cap-race refund FAILURE is audited and webhook re-throws for Stripe retry', _withUnreffedIntervals(async () => {
  const refundAuditCalls = [];
  const harness = await _bootServerWithStubs({
    grantEntitlementWithCap: async () => ({ ok: false, granted: false, reason: 'cap_reached' }),
    recordFoundersRingRefund: async (args) => { refundAuditCalls.push(args); return { id: 2, ...args }; },
  });
  stubModule('../src/discord/bot', {
    getDiscordBot: () => ({
      isInLeagueGuild: async () => ({ inGuild: null }),
      notifyFoundersRingRefund: async () => true,
    }),
  });
  delete require.cache[require.resolve('../src/web/server')];
  const { createServer } = require('../src/web/server');
  const app = createServer({});
  try {
    const { stripeStub } = harness;
    const route = _findAppRoute(app, 'post', '/api/stripe/webhook');
    stripeStub.__nextEvent = _makeFoundersRingEvent(6262, 'cs_live_caprace_fail_1');
    stripeStub.__refundShouldThrow = new Error('stripe upstream rejected');
    const req = { body: Buffer.from('{}'), headers: { 'stripe-signature': 't=1,v1=fake' } };
    // The outer Stripe webhook handler catches the throw and returns 400 so
    // Stripe re-delivers — that's the retry signal we want.
    const result = await _invokeHandler(route, req);
    assert.equal(result.status, 400, 'webhook must return 4xx when refund fails so Stripe retries');

    // Audit row recorded with status='refund_failed' BEFORE the throw.
    assert.equal(refundAuditCalls.length, 1);
    assert.equal(refundAuditCalls[0].status, 'refund_failed');
    assert.equal(refundAuditCalls[0].stripeRefundId, null);
    assert.match(refundAuditCalls[0].errorMessage, /stripe upstream rejected/);
  } finally {
    harness.restoreEnv();
  }
}));

test('stripe webhook: founders_ring branch is idempotent on replay', _withUnreffedIntervals(async () => {
  // First delivery → grant succeeds (granted: true).
  // Replay → grant resolves with already_owned (granted: false). Webhook
  // must still ack 200 in BOTH cases — not throwing on a known replay is
  // exactly what makes it idempotent for Stripe's at-least-once delivery.
  let callIdx = 0;
  const harness = await _bootServerWithStubs({
    grantEntitlementWithCap: async () => {
      callIdx += 1;
      if (callIdx === 1) return { ok: true, granted: true, reason: null };
      return { ok: true, granted: false, reason: 'already_owned' };
    },
  });
  try {
    const { app, captured, stripeStub } = harness;
    const route = _findAppRoute(app, 'post', '/api/stripe/webhook');
    const event = _makeFoundersRingEvent(8888, 'cs_live_replay_1');
    const req1 = {
      body: Buffer.from('{}'),
      headers: { 'stripe-signature': 't=1,v1=fake' },
    };
    stripeStub.__nextEvent = event;
    const r1 = await _invokeHandler(route, req1);
    assert.equal(r1.status, 200);

    // Replay the SAME event id with the SAME session id.
    stripeStub.__nextEvent = event;
    const req2 = {
      body: Buffer.from('{}'),
      headers: { 'stripe-signature': 't=1,v1=fake' },
    };
    const r2 = await _invokeHandler(route, req2);
    assert.equal(r2.status, 200, 'replay must still ack 200 (idempotent)');

    assert.equal(captured.grantCalls.length, 2,
      'webhook routes both deliveries to grantEntitlementWithCap; the helper enforces idempotency');
    // Same args on both calls — the webhook is a pure dispatch.
    assert.deepEqual(
      { a: captured.grantCalls[0].accountId, s: captured.grantCalls[0].sku },
      { a: captured.grantCalls[1].accountId, s: captured.grantCalls[1].sku },
    );
  } finally {
    harness.restoreEnv();
  }
}));

// ── 4. Superuser-only admin routes (Task #257) ───────────────────────────
//
// Three admin routes back the Founders Pass operator console. Each MUST
// reject anonymous and signed-in non-superuser callers, and accept a
// superuser. If a future refactor accidentally drops `requireSuperuser`,
// any signed-in (or even anonymous) user could mint or revoke founders
// rings on demand — exactly the elevation-of-privilege failure the threat
// model is built to catch.
//
//   GET    /api/admin/founders-ring          (list holders)
//   POST   /api/admin/founders-ring          (manual grant)
//   DELETE /api/admin/founders-ring/:accountId (revoke)
//
// requireSuperuser short-circuits with 503 when SUPERUSER_PASSWORD isn't
// configured, so we set it for the lifetime of each test and restore on
// exit. The "anonymous" and "non-superuser signed-in" callers must NOT
// receive 200 (they get 401 with no header, 403 with a wrong header).

function _withSuperuserPassword(fn) {
  return async (...args) => {
    const prev = process.env.SUPERUSER_PASSWORD;
    process.env.SUPERUSER_PASSWORD = 'test-superuser-secret';
    try { return await fn(...args); }
    finally {
      if (prev === undefined) delete process.env.SUPERUSER_PASSWORD;
      else process.env.SUPERUSER_PASSWORD = prev;
    }
  };
}

const _ADMIN_FR_ROUTES = [
  { method: 'get',    path: '/admin/founders-ring',           label: 'GET /admin/founders-ring' },
  { method: 'post',   path: '/admin/founders-ring',           label: 'POST /admin/founders-ring' },
  { method: 'delete', path: '/admin/founders-ring/:accountId', label: 'DELETE /admin/founders-ring/:accountId' },
];

for (const r of _ADMIN_FR_ROUTES) {
  test(`${r.label}: 401 for anonymous caller`, _withUnreffedIntervals(_withSuperuserPassword(async () => {
    const { captured } = _stubServerDeps();
    const { createApiRouter } = _loadServerFresh();
    const router = createApiRouter({}, null);
    const route = _findRoute(router, r.method, r.path);
    const result = await _invokeHandler(route, {
      session: {}, body: { account_id: 1 }, headers: {}, params: { accountId: '1' }, query: {},
    });
    assert.ok(result.status === 401 || result.status === 403,
      `anonymous caller must be rejected (got ${result.status})`);
    assert.equal(captured.grantCalls.length, 0, 'grant must not run for anonymous caller');
  })));

  test(`${r.label}: 401/403 for signed-in non-superuser`, _withUnreffedIntervals(_withSuperuserPassword(async () => {
    const { captured } = _stubServerDeps();
    const { createApiRouter } = _loadServerFresh();
    const router = createApiRouter({}, null);
    const route = _findRoute(router, r.method, r.path);
    // Signed-in user with NO isSuperuser flag, presenting a wrong header.
    const result = await _invokeHandler(route, {
      session: { accountId: 4242 },
      body: { account_id: 1 },
      headers: { 'x-superuser-key': 'wrong-secret' },
      params: { accountId: '1' },
      query: {},
    });
    assert.ok(result.status === 401 || result.status === 403,
      `signed-in non-superuser must be rejected (got ${result.status})`);
    assert.equal(captured.grantCalls.length, 0, 'grant must not run for non-superuser caller');
  })));
}

test('GET /admin/founders-ring: 200 for superuser session, returns sku/cap/sold/holders', _withUnreffedIntervals(_withSuperuserPassword(async () => {
  const fakeHolders = [{ account_id: '1', granted_at: '2026-01-01' }, { account_id: '2', granted_at: '2026-01-02' }];
  _stubServerDeps({
    listEntitlementHolders: async () => fakeHolders,
  });
  const { createApiRouter } = _loadServerFresh();
  const router = createApiRouter({}, null);
  const route = _findRoute(router, 'get', '/admin/founders-ring');
  const result = await _invokeHandler(route, {
    session: { isSuperuser: true }, body: {}, headers: {}, query: {}, params: {},
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.sku, 'founders_pass_ring');
  assert.equal(result.body.sold, 2);
  assert.deepEqual(result.body.holders, fakeHolders);
  assert.ok(result.body.cap > 0);
})));

test('POST /admin/founders-ring: 200 for superuser, calls grantEntitlementWithCap with grantedBy=superuser and reason in metadata', _withUnreffedIntervals(_withSuperuserPassword(async () => {
  const { captured } = _stubServerDeps({
    grantEntitlementWithCap: async () => ({ ok: true, granted: true, reason: null }),
  });
  const { createApiRouter } = _loadServerFresh();
  const router = createApiRouter({}, null);
  const route = _findRoute(router, 'post', '/admin/founders-ring');
  const result = await _invokeHandler(route, {
    session: { isSuperuser: true },
    body: { account_id: '5151', reason: 'community_giveaway' },
    headers: {},
    params: {},
    query: {},
  });
  assert.equal(result.status, 200);
  assert.equal(captured.grantCalls.length, 1);
  const call = captured.grantCalls[0];
  assert.equal(call.accountId, '5151');
  assert.equal(call.sku, 'founders_pass_ring');
  assert.equal(call.grantedBy, 'superuser',
    "grantedBy MUST be 'superuser' so the audit trail distinguishes manual grants from Stripe");
  assert.ok(call.cap > 0);
  assert.equal(call.metadata.reason, 'community_giveaway',
    'metadata.reason MUST forward the operator-supplied reason');
})));

test('POST /admin/founders-ring: defaults metadata.reason to admin_grant when none supplied', _withUnreffedIntervals(_withSuperuserPassword(async () => {
  const { captured } = _stubServerDeps({
    grantEntitlementWithCap: async () => ({ ok: true, granted: true, reason: null }),
  });
  const { createApiRouter } = _loadServerFresh();
  const router = createApiRouter({}, null);
  const route = _findRoute(router, 'post', '/admin/founders-ring');
  const result = await _invokeHandler(route, {
    session: { isSuperuser: true },
    body: { account_id: '99' },
    headers: {}, params: {}, query: {},
  });
  assert.equal(result.status, 200);
  assert.equal(captured.grantCalls[0].metadata.reason, 'admin_grant');
})));

test('POST /admin/founders-ring: 400 when account_id missing (superuser)', _withUnreffedIntervals(_withSuperuserPassword(async () => {
  const { captured } = _stubServerDeps();
  const { createApiRouter } = _loadServerFresh();
  const router = createApiRouter({}, null);
  const route = _findRoute(router, 'post', '/admin/founders-ring');
  const result = await _invokeHandler(route, {
    session: { isSuperuser: true }, body: {}, headers: {}, params: {}, query: {},
  });
  assert.equal(result.status, 400);
  assert.equal(captured.grantCalls.length, 0);
})));

test('DELETE /admin/founders-ring/:accountId: 200 for superuser, calls revokeEntitlement with right account+sku', _withUnreffedIntervals(_withSuperuserPassword(async () => {
  const revokeCalls = [];
  _stubServerDeps({
    revokeEntitlement: async (accountId, sku) => {
      revokeCalls.push({ accountId, sku });
      return 1;
    },
  });
  const { createApiRouter } = _loadServerFresh();
  const router = createApiRouter({}, null);
  const route = _findRoute(router, 'delete', '/admin/founders-ring/:accountId');
  const result = await _invokeHandler(route, {
    session: { isSuperuser: true },
    body: {}, headers: {}, query: {},
    params: { accountId: '7777' },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.removed, 1);
  assert.equal(revokeCalls.length, 1);
  assert.equal(revokeCalls[0].accountId, '7777');
  assert.equal(revokeCalls[0].sku, 'founders_pass_ring');
})));
