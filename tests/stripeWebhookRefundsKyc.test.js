// Task #255 — automated tests for the remaining Stripe webhook branches.
//
// Task #237 covered checkout.session.completed (paid/unpaid) and the
// async-payment branches introduced by BECS Direct Debit. This file locks
// in the *other* branches of the same handler (src/web/server.js, ~lines
// 920-1000) which were untested:
//
//   - charge.refunded            → markProRefunded + markBookingRefundedByIntent
//   - payment_intent.succeeded   → markBookingCompletedByIntent (PI safety net)
//   - payment_intent.canceled    → markBookingRefundedByIntent (PI safety net)
//   - account.updated            → setCoachKycActive (Stripe Connect KYC)
//   - checkout.session.expired   → markBookingCancelledBySession (free slot)
//
// Each branch has a happy-path test (correct helper called) and a negative
// test (helper NOT called for unrelated event shapes / missing metadata).

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

function stubModule(specifier, exports, fromPath = __filename) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

function _bootServer({ event }) {
  const calls = {
    markProRefunded: [],
    markBookingRefundedByIntent: [],
    markBookingCompletedByIntent: [],
    setCoachKycActive: [],
    markBookingCancelledBySession: [],
    markTournamentEntryPaid: [],
    confirmProPurchase: [],
    markBookingPaidBySession: [],
    confirmBuyin: [],
  };

  const dbStub = {
    async markProRefunded(pi) {
      calls.markProRefunded.push(pi);
      return { id: 'pro_1', account_id: '7777' };
    },
    async markBookingRefundedByIntent(pi) {
      calls.markBookingRefundedByIntent.push(pi);
      return { id: 'booking_1' };
    },
    async markBookingCompletedByIntent(pi) {
      calls.markBookingCompletedByIntent.push(pi);
      return { id: 'booking_1' };
    },
    async setCoachKycActive(acct) {
      calls.setCoachKycActive.push(acct);
      return { id: 'coach_1', account_id: '4242' };
    },
    async markBookingCancelledBySession(sessionId) {
      calls.markBookingCancelledBySession.push(sessionId);
      return { id: 'booking_1' };
    },
    async markTournamentEntryPaid(...args) { calls.markTournamentEntryPaid.push(args); return null; },
    async confirmProPurchase(...args) { calls.confirmProPurchase.push(args); return null; },
    async markBookingPaidBySession(...args) { calls.markBookingPaidBySession.push(args); return null; },
    async confirmBuyin(...args) { calls.confirmBuyin.push(args); return null; },
    getPool: () => ({
      query: async () => ({ rows: [] }),
      connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    }),
  };
  const proxiedDb = new Proxy(dbStub, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return async () => null;
    },
  });

  stubModule('stripe', () => ({
    webhooks: { constructEvent: () => event },
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
      notifyCoachingBookingConfirmed: async () => {},
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
  const handler = layers[layers.length - 1].handle;
  await new Promise((resolve, reject) => {
    try {
      const ret = handler(req, res, (err) => err ? reject(err) : resolve());
      if (ret && typeof ret.then === 'function') ret.then(() => resolve(), reject);
    } catch (err) { reject(err); }
  });
  return { status: resStatus, body: resJson, text: resText };
}

// ── charge.refunded ───────────────────────────────────────────────────────
test('charge.refunded with payment_intent → revokes Pro AND flips coaching booking', async () => {
  const event = {
    type: 'charge.refunded',
    data: { object: { id: 'ch_1', payment_intent: 'pi_refund_1' } },
  };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { received: true });
  // Both helpers are called unconditionally — whichever row matches the PI
  // gets flipped, the other is a no-op. This is the documented behaviour.
  assert.deepEqual(calls.markProRefunded, ['pi_refund_1'],
    'markProRefunded must be called with the charge payment_intent');
  assert.deepEqual(calls.markBookingRefundedByIntent, ['pi_refund_1'],
    'markBookingRefundedByIntent must be called with the charge payment_intent');
});

test('charge.refunded WITHOUT payment_intent → no DB mutation', async () => {
  const event = {
    type: 'charge.refunded',
    data: { object: { id: 'ch_2', payment_intent: null } },
  };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.markProRefunded.length, 0,
    'a charge with no payment_intent must not trigger Pro refund');
  assert.equal(calls.markBookingRefundedByIntent.length, 0,
    'a charge with no payment_intent must not trigger booking refund');
});

// ── payment_intent.succeeded (PI safety net for coaching capture) ─────────
test('payment_intent.succeeded for coaching_booking → marks booking completed', async () => {
  const event = {
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_capture_1', metadata: { purpose: 'coaching_booking' } } },
  };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.deepEqual(calls.markBookingCompletedByIntent, ['pi_capture_1'],
    'PI safety net must promote the matching coaching booking to completed');
});

test('payment_intent.succeeded for non-coaching purpose → no DB mutation', async () => {
  const event = {
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_other', metadata: { purpose: 'tournament_entry' } } },
  };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.markBookingCompletedByIntent.length, 0,
    'PI safety net is scoped to coaching_booking only');
});

test('payment_intent.succeeded with no metadata → no DB mutation', async () => {
  const event = {
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_bare', metadata: {} } },
  };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.markBookingCompletedByIntent.length, 0);
});

// ── payment_intent.canceled (PI safety net for refunds) ───────────────────
test('payment_intent.canceled for coaching_booking → flips booking refunded', async () => {
  const event = {
    type: 'payment_intent.canceled',
    data: { object: { id: 'pi_cancel_1', metadata: { purpose: 'coaching_booking' } } },
  };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.deepEqual(calls.markBookingRefundedByIntent, ['pi_cancel_1'],
    'PI cancel safety net must flip the matching booking row to refunded');
});

test('payment_intent.canceled for non-coaching purpose → no DB mutation', async () => {
  const event = {
    type: 'payment_intent.canceled',
    data: { object: { id: 'pi_cancel_other', metadata: { purpose: 'tournament_entry' } } },
  };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.markBookingRefundedByIntent.length, 0,
    'PI cancel safety net is scoped to coaching_booking only');
});

// ── account.updated (Stripe Connect KYC) ──────────────────────────────────
test('account.updated with charges_enabled AND payouts_enabled → promotes coach to active', async () => {
  const event = {
    type: 'account.updated',
    data: { object: { id: 'acct_kyc_1', charges_enabled: true, payouts_enabled: true } },
  };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.deepEqual(calls.setCoachKycActive, ['acct_kyc_1'],
    'fully-onboarded Connect account must promote coach to active');
});

test('account.updated with charges_enabled only (payouts disabled) → coach NOT promoted', async () => {
  const event = {
    type: 'account.updated',
    data: { object: { id: 'acct_kyc_2', charges_enabled: true, payouts_enabled: false } },
  };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.setCoachKycActive.length, 0,
    'must NOT promote until BOTH charges_enabled AND payouts_enabled — taking bookings we cannot pay out is a defect');
});

test('account.updated with payouts_enabled only (charges disabled) → coach NOT promoted', async () => {
  const event = {
    type: 'account.updated',
    data: { object: { id: 'acct_kyc_3', charges_enabled: false, payouts_enabled: true } },
  };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.setCoachKycActive.length, 0);
});

test('account.updated with neither flag → coach NOT promoted', async () => {
  const event = {
    type: 'account.updated',
    data: { object: { id: 'acct_kyc_4', charges_enabled: false, payouts_enabled: false } },
  };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.setCoachKycActive.length, 0);
});

// ── checkout.session.expired ──────────────────────────────────────────────
test('checkout.session.expired for coaching_booking → frees the slot', async () => {
  const event = {
    type: 'checkout.session.expired',
    data: { object: { id: 'cs_expired_1', metadata: { purpose: 'coaching_booking' } } },
  };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.deepEqual(calls.markBookingCancelledBySession, ['cs_expired_1'],
    'expired coaching checkout must free the slot so future bookings are not blocked');
});

test('checkout.session.expired for non-coaching purpose → no DB mutation', async () => {
  const event = {
    type: 'checkout.session.expired',
    data: { object: { id: 'cs_expired_2', metadata: { purpose: 'tournament_entry' } } },
  };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.markBookingCancelledBySession.length, 0,
    'session.expired is scoped to coaching_booking only');
});

test('checkout.session.expired with no metadata → no DB mutation', async () => {
  const event = {
    type: 'checkout.session.expired',
    data: { object: { id: 'cs_expired_3', metadata: {} } },
  };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.markBookingCancelledBySession.length, 0);
});
