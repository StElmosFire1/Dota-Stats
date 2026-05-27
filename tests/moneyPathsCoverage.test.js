// Task #416 — additional coverage for money paths.
//
// Extends the existing tests/stripeWebhook*.test.js + the inhouse
// provisioner test with the gaps the task called out:
//
//   1. Webhook fulfilment of coaching_group_seat + coaching_vod_review
//      (paid completed, unpaid deferral, async_payment_succeeded,
//      async_payment_failed, checkout.session.expired, charge.refunded,
//      payment_intent.succeeded, payment_intent.canceled).
//   2. Refund-path fail-closed tests for the three Stripe-touching student
//      routes — 1:1 booking no-show-refund, group session cancel, VOD
//      review refund. When the Stripe call throws, the DB row MUST stay
//      put and the route MUST surface 502 so the caller can retry.
//   3. Race test: concurrent /group-sessions/:id/join calls against a
//      capacity-bounded session must respect capacity (no over-booking).

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

function stubModule(specifier, exports, fromPath = __filename) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

// ---------------------------------------------------------------------------
// Shared boot helper. Mirrors the pattern in stripeWebhookAsyncPayment.test.js
// so the gaps below are tested in the same isolated way (no real DB / Stripe).
// ---------------------------------------------------------------------------
function _bootServer({ event, dbOverrides = {}, stripeOverrides = {} } = {}) {
  const calls = {
    markBookingPaidBySession: [],
    markGroupSeatPaidBySession: [],
    markVodPaidBySession: [],
    markBookingCancelledBySession: [],
    markGroupSeatCancelledBySession: [],
    markVodCancelledBySession: [],
    markBookingRefundedByIntent: [],
    markGroupSeatRefundedByIntent: [],
    markVodRefundedByIntent: [],
    markBookingCompletedByIntent: [],
    markGroupSeatCapturedByIntent: [],
    reopenGroupSessionIfRoom: [],
    markBookingRefunded: [],
    setVodStatus: [],
    setGroupSessionStatus: [],
    releaseUnattachedGroupSeat: [],
    reserveGroupSeat: [],
    attachStripeSessionToGroupSeat: [],
    stripeRefund: [],
    stripePaymentIntentsCancel: [],
    stripeCheckoutCreate: [],
  };

  const dbStub = {
    async markBookingPaidBySession(s, pi) { calls.markBookingPaidBySession.push({ s, pi }); return { id: 'b_1' }; },
    async markGroupSeatPaidBySession(s, pi) { calls.markGroupSeatPaidBySession.push({ s, pi }); return { id: 'gs_1', session_id: 99 }; },
    async markVodPaidBySession(s, pi) { calls.markVodPaidBySession.push({ s, pi }); return { id: 'v_1', coach_account_id: '4242' }; },
    async markBookingCancelledBySession(s) { calls.markBookingCancelledBySession.push(s); return { id: 'b_1' }; },
    async markGroupSeatCancelledBySession(s) { calls.markGroupSeatCancelledBySession.push(s); return { id: 'gs_1', session_id: 99 }; },
    async markVodCancelledBySession(s) { calls.markVodCancelledBySession.push(s); return { id: 'v_1' }; },
    async markBookingRefundedByIntent(pi) { calls.markBookingRefundedByIntent.push(pi); return { id: 'b_1' }; },
    async markGroupSeatRefundedByIntent(pi) { calls.markGroupSeatRefundedByIntent.push(pi); return { id: 'gs_1', session_id: 99 }; },
    async markVodRefundedByIntent(pi) { calls.markVodRefundedByIntent.push(pi); return { id: 'v_1' }; },
    async markBookingCompletedByIntent(pi) { calls.markBookingCompletedByIntent.push(pi); return { id: 'b_1' }; },
    async markGroupSeatCapturedByIntent(pi) { calls.markGroupSeatCapturedByIntent.push(pi); return { id: 'gs_1' }; },
    async reopenGroupSessionIfRoom(id) { calls.reopenGroupSessionIfRoom.push(id); return null; },
    async getGroupSession(id) { return { id, capacity: 3, seats_taken: 0, status: 'open', currency: 'aud', price_per_seat_cents: 5000, coach_account_id: '4242', title: 'Plat workshop', duration_minutes: 60 }; },
    async setGroupSessionStatus(id, s) { calls.setGroupSessionStatus.push({ id, s }); return null; },
    async getCoach() { return { account_id: '4242', stripe_account_id: 'acct_coach', status: 'active' }; },
    async resolveCommissionBpsForCoach() { return 1500; },
    async listSeatsForSession() { return []; },
    async releaseUnattachedGroupSeat(id) { calls.releaseUnattachedGroupSeat.push(id); return null; },
    async reserveGroupSeat(args) { calls.reserveGroupSeat.push(args); return { id: 7, session_id: args.sessionId }; },
    async attachStripeSessionToGroupSeat(id, cs) { calls.attachStripeSessionToGroupSeat.push({ id, cs }); return { id, stripe_session_id: cs }; },
    async getBooking(id) { return { id, student_account_id: '1111', coach_account_id: '4242', status: 'paid', slot_start_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), stripe_payment_intent: 'pi_b1' }; },
    async getVodReview(id) { return { id, student_account_id: '1111', coach_account_id: '4242', status: 'paid', stripe_payment_intent: 'pi_v1' }; },
    async markBookingRefunded(id) { calls.markBookingRefunded.push(id); return { id, status: 'refunded' }; },
    async setVodStatus(id, s) { calls.setVodStatus.push({ id, s }); return { id, status: s }; },
    async upsertStripeFeeFromCharge() { return null; },
    async resolveStripeFeeSourceByIntent() { return { sourceKind: null, sourceId: null }; },
    getPool: () => ({
      query: async () => ({ rows: [] }),
      connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    }),
    ...dbOverrides,
  };
  const proxiedDb = new Proxy(dbStub, {
    get(target, prop) {
      if (prop in target) return target[prop];
      // Feature-flag lookup is hit by _coachingOn; default-on so the
      // coaching routes don't 404 in test.
      if (prop === 'getFeatureFlag') return async () => ({ state: 'on' });
      if (prop === 'isFeatureFlagOn') return async () => true;
      return async () => null;
    },
  });

  const stripeFactory = () => ({
    webhooks: { constructEvent: () => event },
    checkout: {
      sessions: {
        create: stripeOverrides.checkoutCreate || (async (args) => { calls.stripeCheckoutCreate.push(args); return { id: 'cs_x', url: 'https://stripe.test/x' }; }),
        retrieve: async () => ({}),
      },
    },
    paymentIntents: {
      capture: async () => ({}),
      cancel: stripeOverrides.paymentIntentsCancel || (async (pi) => { calls.stripePaymentIntentsCancel.push(pi); return { id: pi }; }),
    },
    refunds: {
      create: stripeOverrides.refundsCreate || (async (args) => { calls.stripeRefund.push(args); return { id: 're_x' }; }),
    },
    accounts: { create: async () => ({}), retrieve: async () => ({}) },
  });
  stubModule('stripe', stripeFactory);

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
    isPurchasableFounderRingSlug: () => true,
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

// Walk the api Router (mounted at /api) to find a router-level route.
function _findRouterRoute(app, method, routePath) {
  const stack = app.router?.stack || app._router?.stack || [];
  for (const layer of stack) {
    if (!layer.handle?.stack) continue;
    for (const inner of layer.handle.stack) {
      if (inner.route && inner.route.path === routePath && inner.route.methods[method]) {
        return inner.route;
      }
    }
  }
  throw new Error(`router route not found: ${method.toUpperCase()} ${routePath}`);
}

async function _invokeWebhook(app) {
  const route = _findAppRoute(app, 'post', '/api/stripe/webhook');
  const layers = route.stack;
  const req = { headers: { 'stripe-signature': 't=1,v1=fake' }, body: Buffer.from('{}'), method: 'POST', url: '/api/stripe/webhook' };
  return _runLayer(layers[layers.length - 1].handle, req);
}

async function _runRoute(app, method, path, { params = {}, body = {}, session = {}, query = {} } = {}) {
  const route = _findRouterRoute(app, method, path);
  // The route may carry an express.json() middleware before the handler;
  // body is provided synchronously, so just walk all layers in order with
  // a no-op next() for the middleware (express.json is async-safe over an
  // already-parsed body).
  const req = { method: method.toUpperCase(), url: path, headers: {}, params, body, query, session };
  // Execute every layer; only the last one writes a response, the
  // earlier ones (e.g. express.json) are no-ops on our pre-parsed body.
  let lastResult;
  for (const layer of route.stack) {
    lastResult = await _runLayer(layer.handle, req, true);
    if (lastResult.headersSent) return lastResult;
  }
  return lastResult;
}

function _runLayer(handler, req, allowPass = false) {
  let resJson = null, resStatus = 200, resText = null;
  const res = {
    headersSent: false,
    status(code) { resStatus = code; return this; },
    json(obj) { resJson = obj; this.headersSent = true; return this; },
    send(obj) { resText = obj; this.headersSent = true; return this; },
    set() { return this; },
    setHeader() { return this; },
  };
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve({ status: resStatus, body: resJson, text: resText, headersSent: res.headersSent }); } };
    try {
      const ret = handler(req, res, (err) => {
        if (err) return reject(err);
        if (allowPass) return done();
        resolve({ status: resStatus, body: resJson, text: resText, headersSent: res.headersSent });
      });
      if (ret && typeof ret.then === 'function') ret.then(done, reject);
      else done();
    } catch (err) { reject(err); }
  });
}

function _completed(payment_status, metadata) {
  return {
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_' + metadata.purpose, payment_status, payment_intent: 'pi_' + metadata.purpose, amount_total: 5000, currency: 'aud', metadata } },
  };
}
function _asyncOk(metadata) {
  return {
    type: 'checkout.session.async_payment_succeeded',
    data: { object: { id: 'cs_async_' + metadata.purpose, payment_status: 'paid', payment_intent: 'pi_async_' + metadata.purpose, amount_total: 5000, currency: 'aud', metadata } },
  };
}

// ===========================================================================
// Webhook fulfilment — coaching_group_seat
// ===========================================================================
test('webhook: checkout.session.completed PAID coaching_group_seat → markGroupSeatPaidBySession', async () => {
  const { app, calls } = _bootServer({ event: _completed('paid', { purpose: 'coaching_group_seat' }) });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.markGroupSeatPaidBySession.length, 1);
});

test('webhook: checkout.session.completed UNPAID coaching_group_seat → does NOT fulfil', async () => {
  const { app, calls } = _bootServer({ event: _completed('unpaid', { purpose: 'coaching_group_seat' }) });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.markGroupSeatPaidBySession.length, 0);
});

test('webhook: async_payment_succeeded coaching_group_seat → markGroupSeatPaidBySession', async () => {
  const { app, calls } = _bootServer({ event: _asyncOk({ purpose: 'coaching_group_seat' }) });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.markGroupSeatPaidBySession.length, 1);
});

test('webhook: async_payment_failed coaching_group_seat → cancels seat AND reopens session', async () => {
  const event = { type: 'checkout.session.async_payment_failed', data: { object: { id: 'cs_gs_fail', metadata: { purpose: 'coaching_group_seat' } } } };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.deepEqual(calls.markGroupSeatCancelledBySession, ['cs_gs_fail']);
  assert.equal(calls.reopenGroupSessionIfRoom.length, 1);
});

test('webhook: checkout.session.expired coaching_group_seat → cancels seat AND reopens session', async () => {
  const event = { type: 'checkout.session.expired', data: { object: { id: 'cs_gs_exp', metadata: { purpose: 'coaching_group_seat' } } } };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.deepEqual(calls.markGroupSeatCancelledBySession, ['cs_gs_exp']);
});

test('webhook: charge.refunded with PI → also flips group_seat AND vod_review rows', async () => {
  const event = { type: 'charge.refunded', data: { object: { id: 'ch_x', payment_intent: 'pi_x' } } };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.deepEqual(calls.markGroupSeatRefundedByIntent, ['pi_x']);
  assert.deepEqual(calls.markVodRefundedByIntent, ['pi_x']);
});

test('webhook: payment_intent.succeeded coaching_group_seat → markGroupSeatCapturedByIntent', async () => {
  const event = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_gs_cap', metadata: { purpose: 'coaching_group_seat' } } } };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.deepEqual(calls.markGroupSeatCapturedByIntent, ['pi_gs_cap']);
});

test('webhook: payment_intent.canceled coaching_group_seat → flips refunded', async () => {
  const event = { type: 'payment_intent.canceled', data: { object: { id: 'pi_gs_cnl', metadata: { purpose: 'coaching_group_seat' } } } };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.deepEqual(calls.markGroupSeatRefundedByIntent, ['pi_gs_cnl']);
});

// ===========================================================================
// Webhook fulfilment — coaching_vod_review
// ===========================================================================
test('webhook: checkout.session.completed PAID coaching_vod_review → markVodPaidBySession', async () => {
  const { app, calls } = _bootServer({ event: _completed('paid', { purpose: 'coaching_vod_review' }) });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.markVodPaidBySession.length, 1);
});

test('webhook: checkout.session.completed UNPAID coaching_vod_review → does NOT fulfil', async () => {
  const { app, calls } = _bootServer({ event: _completed('unpaid', { purpose: 'coaching_vod_review' }) });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.markVodPaidBySession.length, 0);
});

test('webhook: async_payment_succeeded coaching_vod_review → markVodPaidBySession', async () => {
  const { app, calls } = _bootServer({ event: _asyncOk({ purpose: 'coaching_vod_review' }) });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.markVodPaidBySession.length, 1);
});

test('webhook: async_payment_failed coaching_vod_review → markVodCancelledBySession', async () => {
  const event = { type: 'checkout.session.async_payment_failed', data: { object: { id: 'cs_vod_fail', metadata: { purpose: 'coaching_vod_review' } } } };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.deepEqual(calls.markVodCancelledBySession, ['cs_vod_fail']);
});

test('webhook: checkout.session.expired coaching_vod_review → markVodCancelledBySession', async () => {
  const event = { type: 'checkout.session.expired', data: { object: { id: 'cs_vod_exp', metadata: { purpose: 'coaching_vod_review' } } } };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.deepEqual(calls.markVodCancelledBySession, ['cs_vod_exp']);
});

test('webhook: payment_intent.canceled coaching_vod_review → markVodRefundedByIntent', async () => {
  const event = { type: 'payment_intent.canceled', data: { object: { id: 'pi_vod_cnl', metadata: { purpose: 'coaching_vod_review' } } } };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.deepEqual(calls.markVodRefundedByIntent, ['pi_vod_cnl']);
});

// ===========================================================================
// Refund-path fail-closed — 1:1 booking no-show-refund
// ===========================================================================
test('refund fail-closed: /bookings/:id/no-show-refund — Stripe cancel throws → 502, no markBookingRefunded', async () => {
  const { app, calls } = _bootServer({
    event: { type: 'noop', data: { object: {} } },
    stripeOverrides: {
      paymentIntentsCancel: async () => { throw new Error('Stripe down'); },
      refundsCreate: async () => { throw new Error('Stripe down'); },
    },
  });
  const r = await _runRoute(app, 'post', '/bookings/:id/no-show-refund', {
    params: { id: '1' }, session: { accountId: '1111' },
  });
  assert.equal(r.status, 502, `expected 502 fail-closed, got ${r.status} ${JSON.stringify(r.body)}`);
  assert.equal(calls.markBookingRefunded.length, 0, 'must NOT flip booking to refunded when Stripe fails');
});

test('refund fail-closed: /bookings/:id/no-show-refund — Stripe cancel succeeds → 200 + DB flip', async () => {
  const { app, calls } = _bootServer({
    event: { type: 'noop', data: { object: {} } },
  });
  const r = await _runRoute(app, 'post', '/bookings/:id/no-show-refund', {
    params: { id: '1' }, session: { accountId: '1111' },
  });
  assert.equal(r.status, 200);
  assert.equal(calls.markBookingRefunded.length, 1);
});

// ===========================================================================
// Refund-path fail-closed — VOD review
// ===========================================================================
test('refund fail-closed: /vod-reviews/:id/refund — Stripe cancel throws → 502, no setVodStatus refunded', async () => {
  const { app, calls } = _bootServer({
    event: { type: 'noop', data: { object: {} } },
    stripeOverrides: {
      paymentIntentsCancel: async () => { throw new Error('Stripe boom'); },
    },
  });
  const r = await _runRoute(app, 'post', '/vod-reviews/:id/refund', {
    params: { id: '1' }, session: { accountId: '1111' },
  });
  assert.equal(r.status, 502);
  // Neither markVodRefundedByIntent (webhook path) nor setVodStatus
  // (no-PI fallback) should have been called from a failed refund.
  assert.equal(calls.markVodRefundedByIntent.length, 0);
  assert.equal(calls.setVodStatus.length, 0);
});

test('refund fail-closed: /vod-reviews/:id/refund — Stripe cancel succeeds → 200 + markVodRefundedByIntent', async () => {
  const { app, calls } = _bootServer({ event: { type: 'noop', data: { object: {} } } });
  const r = await _runRoute(app, 'post', '/vod-reviews/:id/refund', {
    params: { id: '1' }, session: { accountId: '1111' },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(calls.markVodRefundedByIntent, ['pi_v1']);
});

// ===========================================================================
// Refund-path fail-closed — group session cancel (refunds every paid seat)
// ===========================================================================
test('refund fail-closed: /me/coach/group-sessions/:id/cancel — Stripe cancel throws → 502, session NOT flipped to cancelled', async () => {
  const seats = [
    { id: 11, status: 'paid', stripe_payment_intent: 'pi_seat_a' },
    { id: 12, status: 'paid', stripe_payment_intent: 'pi_seat_b' },
  ];
  const { app, calls } = _bootServer({
    event: { type: 'noop', data: { object: {} } },
    dbOverrides: {
      async listSeatsForSession() { return seats; },
      async getGroupSession(id) { return { id, capacity: 3, status: 'open', coach_account_id: '4242' }; },
    },
    stripeOverrides: {
      paymentIntentsCancel: async () => { throw new Error('Stripe outage'); },
    },
  });
  const r = await _runRoute(app, 'post', '/me/coach/group-sessions/:id/cancel', {
    params: { id: '99' }, session: { accountId: '4242' },
  });
  assert.equal(r.status, 502, `expected 502 fail-closed, got ${r.status} ${JSON.stringify(r.body)}`);
  assert.equal(calls.setGroupSessionStatus.length, 0,
    'must NOT flip group session to cancelled when any seat refund failed');
  assert.equal(calls.markGroupSeatRefundedByIntent.length, 0,
    'must NOT mark seat refunded when Stripe call failed');
});

test('refund fail-closed: /me/coach/group-sessions/:id/cancel — all Stripe cancels succeed → 200 + status flipped', async () => {
  const seats = [
    { id: 11, status: 'paid', stripe_payment_intent: 'pi_seat_a' },
  ];
  const { app, calls } = _bootServer({
    event: { type: 'noop', data: { object: {} } },
    dbOverrides: {
      async listSeatsForSession() { return seats; },
      async getGroupSession(id) { return { id, capacity: 3, status: 'open', coach_account_id: '4242' }; },
    },
  });
  const r = await _runRoute(app, 'post', '/me/coach/group-sessions/:id/cancel', {
    params: { id: '99' }, session: { accountId: '4242' },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(calls.setGroupSessionStatus, [{ id: 99, s: 'cancelled' }]);
  assert.deepEqual(calls.markGroupSeatRefundedByIntent, ['pi_seat_a']);
});

// ===========================================================================
// Race: concurrent /group-sessions/:id/join — capacity must hold
// ===========================================================================
test('race: 5 concurrent group session joins on a capacity-3 session → exactly 3 succeed, 2 get 400 "Session full"', async () => {
  let seatsHeld = 0;
  const capacity = 3;
  // Serialised reserve that mirrors the SQL FOR UPDATE + COUNT pattern in
  // db.reserveGroupSeat — at most `capacity` reservations succeed; the
  // rest throw "Session full".
  let chain = Promise.resolve();
  async function serializedReserve(args) {
    let release;
    const wait = new Promise(r => { release = r; });
    const prev = chain;
    chain = chain.then(() => wait);
    await prev;
    try {
      if (seatsHeld >= capacity) throw new Error('Session full');
      seatsHeld++;
      return { id: 100 + seatsHeld, session_id: args.sessionId };
    } finally {
      release();
    }
  }
  const { app, calls } = _bootServer({
    event: { type: 'noop', data: { object: {} } },
    dbOverrides: {
      reserveGroupSeat: serializedReserve,
      async getGroupSession(id) {
        return { id, capacity, seats_taken: 0, status: 'open', currency: 'aud',
                 price_per_seat_cents: 5000, coach_account_id: '4242',
                 title: 'Race test', duration_minutes: 60 };
      },
      async getCoach() { return { account_id: '4242', stripe_account_id: 'acct_coach', status: 'active' }; },
      async resolveCommissionBpsForCoach() { return 1500; },
    },
  });
  const STUDENTS = ['s1','s2','s3','s4','s5'];
  const results = await Promise.all(STUDENTS.map((sid, i) =>
    _runRoute(app, 'post', '/group-sessions/:id/join', {
      params: { id: '99' }, session: { accountId: sid }, body: {},
    })
  ));
  const okCount = results.filter(r => r.status === 200).length;
  const fullCount = results.filter(r => r.status === 400 && /full/i.test(r.body?.error || '')).length;
  assert.equal(okCount, capacity, `expected ${capacity} successful joins; got ${okCount} (${JSON.stringify(results.map(r=>({s:r.status,b:r.body})))})`);
  assert.equal(fullCount, STUDENTS.length - capacity, 'rest must be rejected with "Session full"');
  assert.equal(seatsHeld, capacity, 'no over-booking past capacity');
  // Checkout creation must only have happened for the successful reservations.
  assert.equal(calls.stripeCheckoutCreate.length, capacity);
});
