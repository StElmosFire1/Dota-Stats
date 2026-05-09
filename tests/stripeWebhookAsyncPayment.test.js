// Task #237 — automated tests for the Stripe async-payment webhook flow.
//
// Locks in the contract introduced in Task #235 when BECS Direct Debit and
// other async payment methods were enabled at Checkout:
//
//   - `checkout.session.completed` with payment_status === 'paid' (or
//     'no_payment_required') → fulfils every supported purpose.
//   - `checkout.session.completed` with payment_status === 'unpaid'
//     (BECS pending) → MUST NOT fulfil; defer until settlement.
//   - `checkout.session.async_payment_succeeded` → fulfils the same way.
//   - `checkout.session.async_payment_failed` for `coaching_booking` →
//     frees the slot via markBookingCancelledBySession.
//
// Purposes covered: tournament_entry, pro_lifetime, coaching_booking,
// founders_ring, frame_purchase, gift_pro, gift_season_pass, default buyin.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

function stubModule(specifier, exports, fromPath = __filename) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

// ── Build a fresh stub `db` module + a fresh stub `stripe` module + heavy
// transitive stubs, then load src/web/server.js fresh so it binds to them.
function _bootServer({ event }) {
  const calls = {
    markTournamentEntryPaid: [],
    recomputeTournamentPrizePool: [],
    confirmProPurchase: [],
    markBookingPaidBySession: [],
    markBookingCancelledBySession: [],
    grantEntitlementWithCap: [],
    confirmFramePurchase: [],
    confirmGiftCheckout: [],
    createGiftCheckout: [],
    createProCheckout: [],
    isProMember: [],
    grantSeasonPassActivation: [],
    grantSeasonPassXpGift: [],
    confirmBuyin: [],
    markProRefunded: [],
    markBookingRefundedByIntent: [],
    markBookingCompletedByIntent: [],
    setCoachKycActive: [],
    expireOldReplayFiles: [],
  };

  const dbStub = {
    async markTournamentEntryPaid(sessionId, pi) {
      calls.markTournamentEntryPaid.push({ sessionId, pi });
      return { id: 'entry_1', tournament_id: 'tourn_1' };
    },
    async recomputeTournamentPrizePool(tid) {
      calls.recomputeTournamentPrizePool.push(tid);
      return null;
    },
    async confirmProPurchase(args) {
      calls.confirmProPurchase.push(args);
      return { id: 'pro_1', account_id: '7777' };
    },
    async markBookingPaidBySession(sessionId, pi, _) {
      calls.markBookingPaidBySession.push({ sessionId, pi });
      return { id: 'booking_1' };
    },
    async markBookingCancelledBySession(sessionId) {
      calls.markBookingCancelledBySession.push(sessionId);
      return { id: 'booking_1' };
    },
    async grantEntitlementWithCap(args) {
      calls.grantEntitlementWithCap.push(args);
      return { ok: true, granted: true, reason: null };
    },
    async confirmFramePurchase(sessionId, accountId, frameId) {
      calls.confirmFramePurchase.push({ sessionId, accountId, frameId });
      return { id: 'frame_1' };
    },
    async confirmGiftCheckout(sessionId) {
      calls.confirmGiftCheckout.push(sessionId);
      return {
        id: 'gift_1',
        recipient_account_id: '8888',
        gifter_account_id: '1111',
        amount_cents: 999,
      };
    },
    async createGiftCheckout(args) { calls.createGiftCheckout.push(args); return null; },
    async createProCheckout(args) { calls.createProCheckout.push(args); return null; },
    async isProMember(accountId) { calls.isProMember.push(accountId); return false; },
    async grantSeasonPassActivation(args) {
      calls.grantSeasonPassActivation.push(args);
      return { id: 'spa_1' };
    },
    async grantSeasonPassXpGift(args) {
      calls.grantSeasonPassXpGift.push(args);
      return null;
    },
    async confirmBuyin(sessionId) {
      calls.confirmBuyin.push(sessionId);
      return { id: 'buyin_1' };
    },
    async markProRefunded(pi) { calls.markProRefunded.push(pi); return null; },
    async markBookingRefundedByIntent(pi) { calls.markBookingRefundedByIntent.push(pi); return null; },
    async markBookingCompletedByIntent(pi) { calls.markBookingCompletedByIntent.push(pi); return null; },
    async setCoachKycActive(acct) { calls.setCoachKycActive.push(acct); return null; },
    async expireOldReplayFiles() { calls.expireOldReplayFiles.push(1); return []; },
    getPool: () => ({
      query: async () => ({ rows: [{ id: 1, name: 'Tester' }] }),
      connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    }),
  };
  // Some routes touch helpers we don't care about — proxy unknown reads to
  // a no-op async fn so server.js boots cleanly.
  const proxiedDb = new Proxy(dbStub, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return async () => null;
    },
  });

  // Stub stripe so constructEvent ignores body/signature and returns the
  // pre-built event we want to test.
  stubModule('stripe', () => ({
    webhooks: {
      constructEvent: () => event,
    },
    checkout: { sessions: { create: async () => ({}), retrieve: async () => ({}) } },
    paymentIntents: { capture: async () => ({}), cancel: async () => ({}) },
    accounts: { create: async () => ({}), retrieve: async () => ({}) },
  }));

  // Stub heavy transitive modules.
  stubModule('../src/replay/replayParser',  { getReplayParser:  () => ({ parserReady: false }) });
  stubModule('../src/stats/statsService',   { getStatsService:  () => ({}) });
  stubModule('../src/services/groqService', { generateChatResponse: async () => '', generateWeeklyRecapBlurb: async () => '' });
  stubModule('../src/discord/bot',          {
    getDiscordBot: () => ({
      isInLeagueGuild: async () => ({ inGuild: null }),
      notifyCoachingBookingConfirmed: async () => {},
      notifyGiftReceived: async () => {},
    }),
  });
  stubModule('../src/web/voiceEventQueue',  { enqueue: () => {}, drain: () => {} });
  stubModule('../src/monetization/magazineV3', {
    mountMagazineV3Routes: () => {},
    handleStripeWebhookPurpose: async () => null,
    startWeeklyReportWorker: () => {},
    createMagazineV3Db: () => ({}),
    REPLAY_RATE_LIMIT_PER_DAY: 0,
  });
  stubModule('../src/profileCosmetics', {
    FOUNDERS_RING_SKU: 'founders_pass_ring',
    COVER_FX_IDS: [],
    validateCoverFx: () => [],
  });
  // connect-pg-simple is invoked at boot to set up the session store; stub
  // the factory so it doesn't try to talk to Postgres.
  stubModule('connect-pg-simple', () => function PgSession() {
    return { on: () => {}, get: () => {}, set: () => {}, destroy: () => {} };
  });

  // Replace ../db with our proxied stub.
  const dbPath = require.resolve('../src/db');
  delete require.cache[dbPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: proxiedDb };

  // Force a fresh load of server.js with all stubs in place.
  delete require.cache[require.resolve('../src/web/server')];
  // Required env so the webhook handler doesn't 503 before reaching our event.
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy';

  // Tame setIntervals so node:test exits cleanly.
  const _origSetInterval = global.setInterval;
  global.setInterval = (...args) => {
    const id = _origSetInterval(...args);
    if (id && typeof id.unref === 'function') id.unref();
    return id;
  };
  let app;
  try {
    const { createServer } = require('../src/web/server');
    app = createServer();
  } finally {
    global.setInterval = _origSetInterval;
  }
  return { app, calls };
}

function _findAppRoute(app, method, path) {
  const stack = app.router?.stack || app._router?.stack || [];
  for (const layer of stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method]) {
      return layer.route;
    }
  }
  throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
}

async function _invokeWebhook(app) {
  const route = _findAppRoute(app, 'post', '/api/stripe/webhook');
  // Skip the express.raw middleware — req.body is irrelevant because our
  // stripe stub ignores it. Walk the remaining layers in order.
  const layers = route.stack;
  const req = {
    headers: { 'stripe-signature': 't=1,v1=fake' },
    body: Buffer.from('{}'),
    method: 'POST',
    url: '/api/stripe/webhook',
  };
  let resJson = null;
  let resStatus = 200;
  let resText = null;
  const res = {
    headersSent: false,
    status(code) { resStatus = code; return this; },
    json(obj) { resJson = obj; this.headersSent = true; return this; },
    send(obj) { resText = obj; this.headersSent = true; return this; },
    set() { return this; },
    setHeader() { return this; },
  };
  // Invoke just the final (route handler) layer; the express.raw middleware
  // would otherwise try to drain a real stream.
  const handler = layers[layers.length - 1].handle;
  await new Promise((resolve, reject) => {
    try {
      const ret = handler(req, res, (err) => err ? reject(err) : resolve());
      if (ret && typeof ret.then === 'function') ret.then(() => resolve(), reject);
    } catch (err) { reject(err); }
  });
  return { status: resStatus, body: resJson, text: resText };
}

function _completedEvent(payment_status, metadata, extra = {}) {
  return {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_' + (metadata.purpose || 'default'),
        payment_status,
        payment_intent: 'pi_test_' + (metadata.purpose || 'default'),
        amount_total: 1000,
        currency: 'aud',
        metadata,
        ...extra,
      },
    },
  };
}

function _asyncSucceededEvent(metadata, extra = {}) {
  return {
    type: 'checkout.session.async_payment_succeeded',
    data: {
      object: {
        id: 'cs_test_async_' + (metadata.purpose || 'default'),
        payment_status: 'paid',
        payment_intent: 'pi_test_async_' + (metadata.purpose || 'default'),
        amount_total: 1000,
        currency: 'aud',
        metadata,
        ...extra,
      },
    },
  };
}

function _asyncFailedEvent(metadata) {
  return {
    type: 'checkout.session.async_payment_failed',
    data: {
      object: {
        id: 'cs_test_async_failed',
        payment_status: 'unpaid',
        metadata,
      },
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Per-purpose fixtures: each entry knows how to build a session metadata
// payload AND which `calls` slot must be populated to prove fulfilment.
// ───────────────────────────────────────────────────────────────────────────
const PURPOSES = [
  {
    name: 'tournament_entry',
    metadata: { purpose: 'tournament_entry' },
    extra: {},
    fulfilled: (calls) => calls.markTournamentEntryPaid.length === 1,
    notFulfilled: (calls) => calls.markTournamentEntryPaid.length === 0,
  },
  {
    name: 'pro_lifetime',
    metadata: { purpose: 'pro_lifetime', account_id: '7777' },
    extra: {},
    fulfilled: (calls) => calls.confirmProPurchase.length === 1,
    notFulfilled: (calls) => calls.confirmProPurchase.length === 0,
  },
  {
    name: 'coaching_booking',
    metadata: { purpose: 'coaching_booking' },
    extra: {},
    fulfilled: (calls) => calls.markBookingPaidBySession.length === 1,
    notFulfilled: (calls) => calls.markBookingPaidBySession.length === 0,
  },
  {
    name: 'founders_ring',
    metadata: { purpose: 'founders_ring', account_id: '4242' },
    extra: {},
    fulfilled: (calls) => calls.grantEntitlementWithCap.length === 1,
    notFulfilled: (calls) => calls.grantEntitlementWithCap.length === 0,
  },
  {
    name: 'frame_purchase',
    metadata: { purpose: 'frame_purchase', account_id: '4242', frame_id: 'frame_x' },
    extra: {},
    fulfilled: (calls) => calls.confirmFramePurchase.length === 1,
    notFulfilled: (calls) => calls.confirmFramePurchase.length === 0,
  },
  {
    name: 'gift_pro',
    metadata: { purpose: 'gift_pro', account_id: '1111', recipient_account_id: '8888' },
    extra: {},
    fulfilled: (calls) =>
      calls.confirmGiftCheckout.length >= 1 && calls.createProCheckout.length === 1,
    notFulfilled: (calls) =>
      calls.confirmGiftCheckout.length === 0 && calls.createProCheckout.length === 0,
  },
  {
    name: 'gift_season_pass',
    metadata: {
      purpose: 'gift_season_pass',
      account_id: '1111',
      recipient_account_id: '8888',
    },
    extra: {},
    fulfilled: (calls) =>
      calls.confirmGiftCheckout.length >= 1 && calls.grantSeasonPassActivation.length === 1,
    notFulfilled: (calls) =>
      calls.confirmGiftCheckout.length === 0 && calls.grantSeasonPassActivation.length === 0,
  },
  {
    name: 'default buyin (no purpose metadata)',
    metadata: {},
    extra: {},
    fulfilled: (calls) => calls.confirmBuyin.length === 1,
    notFulfilled: (calls) => calls.confirmBuyin.length === 0,
  },
];

for (const p of PURPOSES) {
  test(`checkout.session.completed PAID → fulfils ${p.name}`, async () => {
    const event = _completedEvent('paid', p.metadata, p.extra);
    const { app, calls } = _bootServer({ event });
    const r = await _invokeWebhook(app);
    assert.equal(r.status, 200, `expected 200, got ${r.status}`);
    assert.deepEqual(r.body, { received: true });
    assert.ok(p.fulfilled(calls), `fulfilment slot for ${p.name} should be populated; got ${JSON.stringify(calls)}`);
  });

  test(`checkout.session.completed UNPAID → does NOT fulfil ${p.name} (deferred)`, async () => {
    const event = _completedEvent('unpaid', p.metadata, p.extra);
    const { app, calls } = _bootServer({ event });
    const r = await _invokeWebhook(app);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { received: true });
    assert.ok(p.notFulfilled(calls),
      `unpaid completed must NOT fulfil ${p.name} — entitlements would be granted before funds settle. got ${JSON.stringify(calls)}`);
  });

  test(`checkout.session.async_payment_succeeded → fulfils ${p.name}`, async () => {
    const event = _asyncSucceededEvent(p.metadata, p.extra);
    const { app, calls } = _bootServer({ event });
    const r = await _invokeWebhook(app);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { received: true });
    assert.ok(p.fulfilled(calls),
      `async_payment_succeeded must fulfil ${p.name}; got ${JSON.stringify(calls)}`);
  });
}

// `no_payment_required` (e.g. 100% promo) is still a paid-equivalent state
// per Stripe and must fulfil — covers the second branch of the paid check.
test("checkout.session.completed payment_status='no_payment_required' → fulfils (default buyin)", async () => {
  const event = _completedEvent('no_payment_required', {}, {});
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.confirmBuyin.length, 1);
});

// ── async_payment_failed → coaching_booking slot must be freed ────────────
test('checkout.session.async_payment_failed for coaching_booking → frees the slot', async () => {
  const event = _asyncFailedEvent({ purpose: 'coaching_booking' });
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { received: true });
  assert.equal(calls.markBookingCancelledBySession.length, 1,
    'async_payment_failed for coaching_booking must call markBookingCancelledBySession to free the slot');
  assert.equal(calls.markBookingCancelledBySession[0], 'cs_test_async_failed');
  // Other purposes' fulfilment helpers must NOT be invoked on a failure.
  assert.equal(calls.markBookingPaidBySession.length, 0);
  assert.equal(calls.confirmProPurchase.length, 0);
});

// async_payment_failed for non-coaching purposes is logged but does NOT
// trigger any DB writes — confirms the failure handler is scoped narrowly.
test('checkout.session.async_payment_failed for non-coaching purpose → no DB mutation', async () => {
  const event = _asyncFailedEvent({ purpose: 'tournament_entry' });
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.markBookingCancelledBySession.length, 0);
  assert.equal(calls.markTournamentEntryPaid.length, 0,
    'a failed BECS payment must NEVER call the paid-fulfilment helper');
});
