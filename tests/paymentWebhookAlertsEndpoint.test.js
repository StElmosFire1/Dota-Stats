// Task #897 — endpoint-level coverage for payment-webhook failure alerting.
//
// Boots src/web/server.js with stubbed db/stripe modules (same pattern as
// stripeWebhookAsyncPayment.test.js) and a stubbed paymentAlerts module so
// we can assert exactly when POST /api/stripe/webhook pages the owner:
//
//   - inbox write failure (recordStripeWebhookEvent throws) → 500 + alert
//     with phase 'inbox-write' (this early return bypasses the outer catch,
//     so it must page directly).
//   - signature verification failure (constructEvent throws) → 400 + alert
//     with phase 'request' — that's how a rotated/mistyped
//     STRIPE_WEBHOOK_SECRET manifests.
//   - ABSENT stripe-signature header → 400 with NO alert (unauthenticated
//     noise an attacker could otherwise use to drive owner pings).
//   - handler error (_processStripeEvent throws) → alert with phase
//     'request' via the outer catch, and the inbox row is marked failed.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

function stubModule(specifier, exports, fromPath = __filename) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

function _bootServer({ constructEvent, dbOverrides = {} }) {
  const alerts = [];
  stubModule('../src/observability/paymentAlerts', {
    reportPaymentWebhookFailure: (err, ctx) => alerts.push({ message: err?.message || String(err), ...ctx }),
    checkStuckStripeInbox: async () => null,
    STUCK_THRESHOLD_MINUTES: 30,
  });

  const calls = { markStripeWebhookFailed: [] };
  const dbStub = {
    async recordStripeWebhookEvent() { return { claimed: true, claimToken: 'tok_1' }; },
    async markStripeWebhookProcessed() { return true; },
    async markStripeWebhookFailed(eventId, msg, token) {
      calls.markStripeWebhookFailed.push({ eventId, msg, token });
      return true;
    },
    getPool: () => ({
      query: async () => ({ rows: [] }),
      connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    }),
    ...dbOverrides,
  };
  const proxiedDb = new Proxy(dbStub, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return async () => null;
    },
  });

  stubModule('stripe', () => ({
    webhooks: { constructEvent },
    checkout: { sessions: { create: async () => ({}), retrieve: async () => ({}) } },
    paymentIntents: { capture: async () => ({}), cancel: async () => ({}) },
    accounts: { create: async () => ({}), retrieve: async () => ({}) },
  }));

  stubModule('../src/replay/replayParser',  { getReplayParser:  () => ({ parserReady: false }) });
  stubModule('../src/stats/statsService',   { getStatsService:  () => ({}) });
  stubModule('../src/services/groqService', { generateChatResponse: async () => '', generateWeeklyRecapBlurb: async () => '' });
  stubModule('../src/discord/bot',          { getDiscordBot: () => null });
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
  return { app, alerts, calls };
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

async function _invokeWebhook(app, { signature = 't=1,v1=fake' } = {}) {
  const route = _findAppRoute(app, 'post', '/api/stripe/webhook');
  const req = {
    headers: signature == null ? {} : { 'stripe-signature': signature },
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
  const handler = route.stack[route.stack.length - 1].handle;
  await new Promise((resolve, reject) => {
    try {
      const ret = handler(req, res, (err) => err ? reject(err) : resolve());
      if (ret && typeof ret.then === 'function') ret.then(() => resolve(), reject);
    } catch (err) { reject(err); }
  });
  return { status: resStatus, body: resJson, text: resText };
}

const EVENT = Object.freeze({
  id: 'evt_897',
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_897', payment_status: 'paid', metadata: {}, amount_total: 100, currency: 'aud' } },
});

test('inbox write failure → 500 + alert with phase inbox-write', async () => {
  const { app, alerts } = _bootServer({
    constructEvent: () => EVENT,
    dbOverrides: {
      async recordStripeWebhookEvent() { throw new Error('pg write refused'); },
    },
  });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 500);
  assert.equal(r.text, 'Webhook inbox unavailable');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].phase, 'inbox-write');
  assert.equal(alerts[0].eventId, 'evt_897');
  assert.match(alerts[0].message, /pg write refused/);
});

test('signature verification failure → 400 + alert (bad secret must page)', async () => {
  const { app, alerts } = _bootServer({
    constructEvent: () => { throw new Error('No signatures found matching the expected signature for payload'); },
  });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 400);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].phase, 'request');
  assert.match(alerts[0].message, /No signatures found/);
});

test('absent stripe-signature header → 400 with NO alert (unauthenticated noise)', async () => {
  const { app, alerts } = _bootServer({ constructEvent: () => EVENT });
  const r = await _invokeWebhook(app, { signature: null });
  assert.equal(r.status, 400);
  assert.equal(r.text, 'Missing stripe-signature header');
  assert.equal(alerts.length, 0, 'attackers must not be able to drive owner pings');
});

test('missing STRIPE_WEBHOOK_SECRET → 503 + one alert with phase config', async () => {
  const { app, alerts } = _bootServer({ constructEvent: () => EVENT });
  // The handler reads the secret at request time, so unset it just for this
  // invocation to simulate the production misconfiguration.
  const saved = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const r = await _invokeWebhook(app);
    assert.equal(r.status, 503);
    assert.equal(r.text, 'Stripe webhook secret not configured');
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].phase, 'config');
    assert.match(alerts[0].message, /STRIPE_WEBHOOK_SECRET is not configured/);
  } finally {
    process.env.STRIPE_WEBHOOK_SECRET = saved;
  }
});

test('handler error → inbox row marked failed + alert via outer catch', async () => {
  const { app, alerts, calls } = _bootServer({
    constructEvent: () => ({
      ...EVENT,
      data: { object: { ...EVENT.data.object, metadata: { purpose: 'tournament_entry', tournament_id: 't1' } } },
    }),
    dbOverrides: {
      async markTournamentEntryPaid() { throw new Error('fulfilment exploded'); },
    },
  });
  const r = await _invokeWebhook(app);
  assert.equal(r.status, 400);
  assert.equal(calls.markStripeWebhookFailed.length, 1);
  assert.equal(calls.markStripeWebhookFailed[0].eventId, 'evt_897');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].phase, 'request');
  assert.match(alerts[0].message, /fulfilment exploded/);
});
