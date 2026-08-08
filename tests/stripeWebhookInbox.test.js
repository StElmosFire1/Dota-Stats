// Task #855 — durable Stripe webhook inbox + dispute handling tests.
//
// Contract:
//   - A verified event is persisted + atomically CLAIMED in the inbox
//     (recordStripeWebhookEvent) before processing, and marked processed
//     (awaited) after successful fulfillment, before the 200 ACK.
//   - A replayed event that can't be claimed (already processed, or another
//     worker holds a live claim) short-circuits to 200 { duplicate: true }
//     and runs NO side effects.
//   - If the inbox write itself fails, the route returns a retryable 5xx and
//     does NOT process the event (Stripe redelivers).
//   - When processing throws, the inbox row is marked failed and the route
//     returns 400 so Stripe retries.
//   - The retry sweep re-claims and re-runs stale 'received'/'processing'
//     rows (crash recovery) and failed rows.
//   - charge.dispute.created records the dispute (flagged for review);
//     charge.dispute.closed records it resolved.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

function stubModule(specifier, exports, fromPath = __filename) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

function _bootServer({ event, recordResult = null, recordThrows = false, failFulfillment = false, retryableRows = null }) {
  const calls = {
    recordStripeWebhookEvent: [],
    claimStripeWebhookEvent: [],
    markStripeWebhookProcessed: [],
    markStripeWebhookFailed: [],
    recordStripeDispute: [],
    markTournamentEntryPaid: [],
  };

  const dbStub = {
    async recordStripeWebhookEvent(ev) {
      calls.recordStripeWebhookEvent.push({ id: ev.id, type: ev.type });
      if (recordThrows) throw new Error('inbox db down');
      if (recordResult) return recordResult;
      return { claimed: true, claimToken: 'tok_route_1', duplicate: false, status: 'processing' };
    },
    async claimStripeWebhookEvent(eventId) {
      calls.claimStripeWebhookEvent.push(eventId);
      return 'tok_sweep_1';
    },
    async listRetryableStripeWebhookEvents() {
      return retryableRows || [];
    },
    async markStripeWebhookProcessed(eventId, claimToken) {
      calls.markStripeWebhookProcessed.push({ eventId, claimToken });
      return true;
    },
    async markStripeWebhookFailed(eventId, err, claimToken) {
      calls.markStripeWebhookFailed.push({ eventId, err: String(err), claimToken });
      return true;
    },
    async recordStripeDispute(args) {
      calls.recordStripeDispute.push(args);
      return { id: 1, source_kind: 'booking', source_id: 42, ...args };
    },
    async markTournamentEntryPaid(sessionId, pi) {
      calls.markTournamentEntryPaid.push({ sessionId, pi });
      if (failFulfillment) throw new Error('boom: transient db failure');
      return { id: 'entry_1', tournament_id: 'tourn_1' };
    },
    async recomputeTournamentPrizePool() { return null; },
    getPool: () => ({
      query: async () => ({ rows: [{ id: 1, name: 'Tester' }] }),
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

const _tournamentEvent = {
  id: 'evt_test_inbox_1',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_tourn',
      payment_status: 'paid',
      payment_intent: 'pi_test_tourn',
      amount_total: 1000,
      currency: 'aud',
      metadata: { purpose: 'tournament_entry' },
    },
  },
};

test('new event: claimed, fulfilled, marked processed BEFORE the 200 ACK', async () => {
  const { app, calls } = _bootServer({ event: _tournamentEvent });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { received: true });
  assert.equal(calls.recordStripeWebhookEvent.length, 1);
  assert.equal(calls.recordStripeWebhookEvent[0].id, 'evt_test_inbox_1');
  assert.equal(calls.markTournamentEntryPaid.length, 1);
  // Terminal status write is awaited before the response — no tick needed —
  // and carries the claim token so a lost lease can't overwrite the new owner.
  assert.deepEqual(calls.markStripeWebhookProcessed, [{ eventId: 'evt_test_inbox_1', claimToken: 'tok_route_1' }]);
  assert.equal(calls.markStripeWebhookFailed.length, 0);
});

test('unclaimed replay (already processed): 200 duplicate, NO side effects', async () => {
  const { app, calls } = _bootServer({
    event: _tournamentEvent,
    recordResult: { claimed: false, duplicate: true, status: 'processed' },
  });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { received: true, duplicate: true });
  assert.equal(calls.markTournamentEntryPaid.length, 0);
  assert.equal(calls.markStripeWebhookProcessed.length, 0);
});

test('unclaimed replay (live claim by another worker): 200 duplicate, no processing', async () => {
  const { app, calls } = _bootServer({
    event: _tournamentEvent,
    recordResult: { claimed: false, duplicate: true, status: 'processing' },
  });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { received: true, duplicate: true });
  assert.equal(calls.markTournamentEntryPaid.length, 0);
});

test('re-claimed replay (previously failed / stale claim): reprocessed', async () => {
  const { app, calls } = _bootServer({
    event: _tournamentEvent,
    recordResult: { claimed: true, claimToken: 'tok_reclaim_1', duplicate: true, status: 'processing' },
  });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.markTournamentEntryPaid.length, 1);
  assert.deepEqual(calls.markStripeWebhookProcessed, [{ eventId: 'evt_test_inbox_1', claimToken: 'tok_reclaim_1' }]);
});

test('inbox write failure: retryable 5xx, event NOT processed', async () => {
  const { app, calls } = _bootServer({ event: _tournamentEvent, recordThrows: true });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 500);
  assert.equal(calls.markTournamentEntryPaid.length, 0, 'must not process without a durable record');
  assert.equal(calls.markStripeWebhookProcessed.length, 0);
});

test('fulfillment failure: marked failed (awaited), 400 so Stripe retries', async () => {
  const { app, calls } = _bootServer({ event: _tournamentEvent, failFulfillment: true });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 400);
  assert.equal(calls.markStripeWebhookFailed.length, 1);
  assert.equal(calls.markStripeWebhookFailed[0].eventId, 'evt_test_inbox_1');
  assert.match(calls.markStripeWebhookFailed[0].err, /boom/);
  assert.equal(calls.markStripeWebhookFailed[0].claimToken, 'tok_route_1');
  assert.equal(calls.markStripeWebhookProcessed.length, 0);
});

test('retry sweep: stale received/processing row is re-claimed and re-run (crash recovery)', async () => {
  const staleRow = {
    event_id: 'evt_test_stale_1',
    event_type: 'checkout.session.completed',
    status: 'received',
    attempts: 1,
    payload: JSON.stringify({
      id: 'evt_test_stale_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_stale',
          payment_status: 'paid',
          payment_intent: 'pi_test_stale',
          amount_total: 1000,
          currency: 'aud',
          metadata: { purpose: 'tournament_entry' },
        },
      },
    }),
  };
  const { app, calls } = _bootServer({ event: _tournamentEvent, retryableRows: [staleRow] });
  const sweep = app.locals._runStripeInboxRetrySweep;
  assert.equal(typeof sweep, 'function', 'sweep exposed for tests');
  await sweep();
  assert.deepEqual(calls.claimStripeWebhookEvent, ['evt_test_stale_1']);
  assert.equal(calls.markTournamentEntryPaid.length, 1);
  assert.equal(calls.markTournamentEntryPaid[0].sessionId, 'cs_test_stale');
  // The sweep's terminal write carries ITS fresh lease token.
  assert.deepEqual(calls.markStripeWebhookProcessed, [{ eventId: 'evt_test_stale_1', claimToken: 'tok_sweep_1' }]);
});

test('retry sweep: skips rows whose claim is still live (claim lost)', async () => {
  const staleRow = { event_id: 'evt_test_live_1', event_type: 'x', status: 'processing', attempts: 0, payload: '{}' };
  const { app, calls } = _bootRaw({ retryableRows: [staleRow], claimResult: false });
  await app.locals._runStripeInboxRetrySweep();
  assert.deepEqual(calls.claimStripeWebhookEvent, ['evt_test_live_1']);
  assert.equal(calls.markTournamentEntryPaid.length, 0);
  assert.equal(calls.markStripeWebhookProcessed.length, 0);
  assert.equal(calls.markStripeWebhookFailed.length, 0);
});

// Minimal re-boot helper with configurable claim result.
function _bootRaw({ retryableRows, claimResult }) {
  const calls = {
    claimStripeWebhookEvent: [],
    markStripeWebhookProcessed: [],
    markStripeWebhookFailed: [],
    markTournamentEntryPaid: [],
  };
  const dbStub = {
    async recordStripeWebhookEvent() { return { claimed: true, claimToken: 'tok_x', duplicate: false, status: 'processing' }; },
    async claimStripeWebhookEvent(id) { calls.claimStripeWebhookEvent.push(id); return claimResult; },
    async listRetryableStripeWebhookEvents() { return retryableRows || []; },
    async markStripeWebhookProcessed(id) { calls.markStripeWebhookProcessed.push(id); },
    async markStripeWebhookFailed(id, err) { calls.markStripeWebhookFailed.push({ id, err: String(err) }); },
    async markTournamentEntryPaid(s, pi) { calls.markTournamentEntryPaid.push({ s, pi }); return { id: 'e', tournament_id: 't' }; },
    async recomputeTournamentPrizePool() { return null; },
    getPool: () => ({
      query: async () => ({ rows: [{ id: 1 }] }),
      connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    }),
  };
  const proxiedDb = new Proxy(dbStub, {
    get(target, prop) { return prop in target ? target[prop] : async () => null; },
  });
  const dbPath = require.resolve('../src/db');
  delete require.cache[dbPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: proxiedDb };
  delete require.cache[require.resolve('../src/web/server')];
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

test('charge.dispute.created: recorded + flagged for review', async () => {
  const event = {
    id: 'evt_test_dispute_1',
    type: 'charge.dispute.created',
    data: {
      object: {
        id: 'dp_test_1',
        charge: 'ch_test_1',
        payment_intent: 'pi_test_1',
        amount: 5000,
        currency: 'aud',
        reason: 'fraudulent',
        status: 'needs_response',
      },
    },
  };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.recordStripeDispute.length, 1);
  const d = calls.recordStripeDispute[0];
  assert.equal(d.disputeId, 'dp_test_1');
  assert.equal(d.paymentIntent, 'pi_test_1');
  assert.equal(d.closed, false);
});

test('charge.dispute.closed: recorded as resolved', async () => {
  const event = {
    id: 'evt_test_dispute_2',
    type: 'charge.dispute.closed',
    data: {
      object: {
        id: 'dp_test_1',
        charge: 'ch_test_1',
        payment_intent: 'pi_test_1',
        amount: 5000,
        currency: 'aud',
        reason: 'fraudulent',
        status: 'won',
      },
    },
  };
  const { app, calls } = _bootServer({ event });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 200);
  assert.equal(calls.recordStripeDispute.length, 1);
  assert.equal(calls.recordStripeDispute[0].closed, true);
});
