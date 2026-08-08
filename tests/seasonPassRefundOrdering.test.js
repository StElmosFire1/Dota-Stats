// Task #912 — season passes revoke on refund, ordering-safe.
//
// End-to-end webhook tests (same boot/stub pattern as
// stripeWebhookRefundsKyc.test.js) for the season-pass legs of the Stripe
// handler in src/web/server.js:
//
//   - fulfillment-before-refund (self + gift): charge.refunded flips the
//     active pass row by stored payment intent
//   - refund-before-fulfillment (self + gift): Stripe doesn't order webhook
//     delivery, so charge.refunded records the intent in
//     stripe_refunded_intents and the later fulfillment revokes immediately
//     instead of leaving an active pass (and skips the gift XP bonus)
//   - replay/idempotency: re-delivering either event leaves state unchanged

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

function stubModule(specifier, exports, fromPath = __filename) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

// In-memory season-pass "DB": rows keyed by account:season, plus the durable
// refunded-intents set. Mirrors the real helpers' semantics closely enough
// to exercise ordering + idempotency.
function _makeSeasonPassDb() {
  const state = {
    rows: new Map(),          // `${account}:${season}` -> row
    refundedIntents: new Set(),
    gifts: new Map(),         // session id -> gift row
    xpGrants: [],
  };
  const db = {
    state,
    async recordRefundedPaymentIntent(pi) {
      if (!pi || pi === 'none') return null;
      state.refundedIntents.add(pi);
      return pi;
    },
    async isPaymentIntentRefunded(pi) {
      return Boolean(pi) && state.refundedIntents.has(pi);
    },
    async recordSeasonPassSelfPurchase({ accountId, seasonNumber, stripeSessionId }) {
      const key = `${accountId}:${seasonNumber}`;
      if (state.rows.has(key)) return null;
      const row = { account_id: accountId, season_number: seasonNumber, stripe_session_id: stripeSessionId, gift_stripe_session_id: null, status: 'pending', stripe_payment_intent: null };
      state.rows.set(key, row);
      return row;
    },
    async confirmSeasonPassSelfPurchase(sessionId, { paymentIntent = null } = {}) {
      for (const row of state.rows.values()) {
        if (row.stripe_session_id === sessionId && row.status === 'pending') {
          row.status = 'active';
          row.stripe_payment_intent = paymentIntent || row.stripe_payment_intent;
          return row;
        }
      }
      return null;
    },
    async grantSeasonPassActivation({ accountId, seasonNumber, giftStripeSessionId, paymentIntent = null }) {
      const key = `${accountId}:${seasonNumber}`;
      if (state.rows.has(key)) return null; // ON CONFLICT DO NOTHING
      const row = { account_id: accountId, season_number: seasonNumber, stripe_session_id: null, gift_stripe_session_id: giftStripeSessionId, status: 'active', stripe_payment_intent: paymentIntent };
      state.rows.set(key, row);
      return row;
    },
    async markSeasonPassRefundedByIntent(pi) {
      if (!pi || pi === 'none') return [];
      const flipped = [];
      for (const row of state.rows.values()) {
        if (row.stripe_payment_intent === pi && row.status === 'active') {
          row.status = 'refunded';
          flipped.push(row);
        }
      }
      return flipped;
    },
    async confirmGiftCheckout(sessionId) {
      return state.gifts.get(sessionId) || null;
    },
    async createGiftCheckout(g) {
      state.gifts.set(g.stripeSessionId, {
        gifter_account_id: g.gifterAccountId,
        recipient_account_id: g.recipientAccountId,
        gift_type: g.giftType,
        stripe_session_id: g.stripeSessionId,
        status: 'completed',
      });
    },
    async grantSeasonPassXpGift(args) { state.xpGrants.push(args); return true; },
    async hasSeasonPassActivation(accountId, seasonNumber) {
      const row = state.rows.get(`${accountId}:${seasonNumber}`);
      return Boolean(row && row.status === 'active');
    },
    getPool: () => ({
      // gift branch looks up the active season via raw pool.query
      query: async () => ({ rows: [{ id: 12 }] }),
      connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    }),
  };
  return db;
}

function _bootServer(dbStub) {
  const eventHolder = { event: null };
  const proxiedDb = new Proxy(dbStub, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'magV3') return { revokeOneOffPerksByPaymentIntent: async () => [] };
      return async () => null;
    },
  });

  stubModule('stripe', () => ({
    webhooks: { constructEvent: () => eventHolder.event },
    checkout: { sessions: { create: async () => ({}), retrieve: async () => ({}) } },
    paymentIntents: { capture: async () => ({}), cancel: async () => ({}) },
    accounts: { create: async () => ({}), retrieve: async () => ({}) },
  }));
  stubModule('../src/replay/replayParser',  { getReplayParser:  () => ({ parserReady: false }) });
  stubModule('../src/stats/statsService',   { getStatsService:  () => ({}) });
  stubModule('../src/services/groqService', { generateChatResponse: async () => '', generateWeeklyRecapBlurb: async () => '' });
  stubModule('../src/discord/bot', {
    getDiscordBot: () => ({
      isInLeagueGuild: async () => ({ inGuild: null }),
      notifyGiftReceived: async () => {},
    }),
  });
  stubModule('../src/web/voiceEventQueue', { enqueue: () => {}, drain: () => {} });
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
  stubModule('connect-pg-simple', () => function PgSession() {
    return { on: () => {}, get: () => {}, set: () => {}, destroy: () => {} };
  });

  const dbPath = require.resolve('../src/db');
  delete require.cache[dbPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: proxiedDb };

  delete require.cache[require.resolve('../src/web/server')];
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy';

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
  return { app, eventHolder };
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

async function _deliver(app, eventHolder, event) {
  eventHolder.event = event;
  const route = _findAppRoute(app, 'post', '/api/stripe/webhook');
  const layers = route.stack;
  const req = {
    headers: { 'stripe-signature': 't=1,v1=fake' },
    body: Buffer.from('{}'),
    method: 'POST',
    url: '/api/stripe/webhook',
  };
  let resStatus = 200;
  const res = {
    headersSent: false,
    status(code) { resStatus = code; return this; },
    json() { this.headersSent = true; return this; },
    send() { this.headersSent = true; return this; },
    set() { return this; },
    setHeader() { return this; },
  };
  const handler = layers[layers.length - 1].handle;
  await new Promise((resolve, reject) => {
    try {
      const ret = handler(req, res, (err) => err ? reject(err) : resolve());
      if (ret && typeof ret.then === 'function') ret.then(() => resolve(), reject);
    } catch (err) { reject(err); }
  });
  return resStatus;
}

const _selfCheckout = (sessionId, pi) => ({
  type: 'checkout.session.completed',
  data: { object: {
    id: sessionId, payment_status: 'paid', payment_intent: pi,
    amount_total: 799, currency: 'aud',
    metadata: { purpose: 'season_pass_self' },
  } },
});
const _giftCheckout = (sessionId, pi) => ({
  type: 'checkout.session.completed',
  data: { object: {
    id: sessionId, payment_status: 'paid', payment_intent: pi,
    amount_total: 799, currency: 'aud',
    metadata: { purpose: 'gift_season_pass', account_id: '111', recipient_account_id: '222', season_id: '12' },
  } },
});
const _refund = (pi) => ({
  type: 'charge.refunded',
  data: { object: { id: 'ch_1', payment_intent: pi } },
});

test('self purchase: fulfillment then refund → pass revoked', async () => {
  const dbStub = _makeSeasonPassDb();
  await dbStub.recordSeasonPassSelfPurchase({ accountId: '111', seasonNumber: 12, stripeSessionId: 'cs_self_1' });
  const { app, eventHolder } = _bootServer(dbStub);

  assert.equal(await _deliver(app, eventHolder, _selfCheckout('cs_self_1', 'pi_self_1')), 200);
  assert.equal(await dbStub.hasSeasonPassActivation('111', 12), true, 'pass active after fulfillment');

  assert.equal(await _deliver(app, eventHolder, _refund('pi_self_1')), 200);
  assert.equal(await dbStub.hasSeasonPassActivation('111', 12), false, 'pass revoked after refund');
  assert.equal(dbStub.state.rows.get('111:12').status, 'refunded');

  // Replay both events — state unchanged.
  await _deliver(app, eventHolder, _refund('pi_self_1'));
  await _deliver(app, eventHolder, _selfCheckout('cs_self_1', 'pi_self_1'));
  assert.equal(dbStub.state.rows.get('111:12').status, 'refunded', 'replays must not resurrect the pass');
});

test('self purchase: refund BEFORE fulfillment → pass never stays active', async () => {
  const dbStub = _makeSeasonPassDb();
  await dbStub.recordSeasonPassSelfPurchase({ accountId: '111', seasonNumber: 12, stripeSessionId: 'cs_self_2' });
  const { app, eventHolder } = _bootServer(dbStub);

  assert.equal(await _deliver(app, eventHolder, _refund('pi_self_2')), 200);
  assert.ok(dbStub.state.refundedIntents.has('pi_self_2'), 'refunded intent recorded durably');

  assert.equal(await _deliver(app, eventHolder, _selfCheckout('cs_self_2', 'pi_self_2')), 200);
  assert.equal(await dbStub.hasSeasonPassActivation('111', 12), false, 'late fulfillment must not grant a refunded pass');
  assert.equal(dbStub.state.rows.get('111:12').status, 'refunded');
});

test('gift: fulfillment then refund → recipient pass revoked, gift row flipped later by real helper', async () => {
  const dbStub = _makeSeasonPassDb();
  await dbStub.createGiftCheckout({ gifterAccountId: '111', recipientAccountId: '222', giftType: 'season_pass', stripeSessionId: 'cs_gift_1' });
  const { app, eventHolder } = _bootServer(dbStub);

  assert.equal(await _deliver(app, eventHolder, _giftCheckout('cs_gift_1', 'pi_gift_1')), 200);
  assert.equal(await dbStub.hasSeasonPassActivation('222', 12), true);
  assert.equal(dbStub.state.xpGrants.length, 1, 'gift XP bonus granted on normal fulfillment');

  assert.equal(await _deliver(app, eventHolder, _refund('pi_gift_1')), 200);
  assert.equal(await dbStub.hasSeasonPassActivation('222', 12), false, 'gifted pass revoked after refund');
});

// ── failure semantics: fail-closed, Stripe must retry ─────────────────────
test('fulfillment: refund lookup failure → webhook non-2xx (Stripe retries), pass not granted silently', async () => {
  const dbStub = _makeSeasonPassDb();
  await dbStub.recordSeasonPassSelfPurchase({ accountId: '111', seasonNumber: 12, stripeSessionId: 'cs_fail_1' });
  await dbStub.recordRefundedPaymentIntent('pi_fail_1');
  const realLookup = dbStub.isPaymentIntentRefunded;
  dbStub.isPaymentIntentRefunded = async () => { throw new Error('db down'); };
  const { app, eventHolder } = _bootServer(dbStub);

  const status = await _deliver(app, eventHolder, _selfCheckout('cs_fail_1', 'pi_fail_1'));
  assert.ok(status >= 400, `refund-lookup failure must not ACK the webhook (got ${status})`);

  // Retry after the DB recovers → revoked, never active.
  dbStub.isPaymentIntentRefunded = realLookup;
  // confirm already flipped pending→active on the failed attempt; the retry's
  // ordering check must still revoke it.
  assert.equal(await _deliver(app, eventHolder, _selfCheckout('cs_fail_1', 'pi_fail_1')), 200);
  assert.equal(await dbStub.hasSeasonPassActivation('111', 12), false, 'retry must revoke the refunded pass');
});

test('charge.refunded: season-pass revoke failure → webhook non-2xx (Stripe retries)', async () => {
  const dbStub = _makeSeasonPassDb();
  await dbStub.recordSeasonPassSelfPurchase({ accountId: '111', seasonNumber: 12, stripeSessionId: 'cs_fail_2' });
  const { app, eventHolder } = _bootServer(dbStub);
  assert.equal(await _deliver(app, eventHolder, _selfCheckout('cs_fail_2', 'pi_fail_2')), 200);

  const realRevoke = dbStub.markSeasonPassRefundedByIntent.bind(dbStub);
  dbStub.markSeasonPassRefundedByIntent = async () => { throw new Error('db down'); };
  const status = await _deliver(app, eventHolder, _refund('pi_fail_2'));
  assert.ok(status >= 400, `failed season-pass revoke must not ACK the refund webhook (got ${status})`);
  assert.ok(dbStub.state.refundedIntents.has('pi_fail_2'), 'refunded intent still recorded durably');
  assert.equal(await dbStub.hasSeasonPassActivation('111', 12), true, 'pass untouched until retry succeeds');

  // Stripe retry after recovery → revoked.
  dbStub.markSeasonPassRefundedByIntent = realRevoke;
  assert.equal(await _deliver(app, eventHolder, _refund('pi_fail_2')), 200);
  assert.equal(await dbStub.hasSeasonPassActivation('111', 12), false);
});

test('gift: refund BEFORE fulfillment → no active pass, no XP bonus', async () => {
  const dbStub = _makeSeasonPassDb();
  await dbStub.createGiftCheckout({ gifterAccountId: '111', recipientAccountId: '222', giftType: 'season_pass', stripeSessionId: 'cs_gift_2' });
  const { app, eventHolder } = _bootServer(dbStub);

  assert.equal(await _deliver(app, eventHolder, _refund('pi_gift_2')), 200);
  assert.equal(await _deliver(app, eventHolder, _giftCheckout('cs_gift_2', 'pi_gift_2')), 200);

  assert.equal(await dbStub.hasSeasonPassActivation('222', 12), false, 'late gift fulfillment must not grant a refunded pass');
  assert.equal(dbStub.state.rows.get('222:12').status, 'refunded');
  assert.equal(dbStub.state.xpGrants.length, 0, 'XP bonus must be skipped for a refunded gift');

  // Replay fulfillment — still revoked, still no XP.
  await _deliver(app, eventHolder, _giftCheckout('cs_gift_2', 'pi_gift_2'));
  assert.equal(dbStub.state.rows.get('222:12').status, 'refunded');
  assert.equal(dbStub.state.xpGrants.length, 0);
});
