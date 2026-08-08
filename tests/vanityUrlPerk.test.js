// Task #770 — Stripe webhook handling for the Custom URL one-off perk.
//
// POST /api/shop/vanity-url/stripe-checkout creates a Stripe session with
// metadata { purpose: 'one_off_perk', perk_key: 'cosmetic:vanity_url' } and
// records a pending (revoked) user_one_off_perks row. The verified-signature
// webhook in server.js routes purpose === 'one_off_perk' through
// handleStripeWebhookPurpose, which calls grantOneOffPerk() to activate the
// pending row. This file proves the whole chain end-to-end for the vanity
// URL perk specifically:
//
//   1. createOneOffPerkPending('cosmetic:vanity_url') does NOT grant access.
//   2. Simulated webhook (real handleStripeWebhookPurpose) flips it active.
//   3. hasOneOffPerk(accountId, 'cosmetic:vanity_url') is now true.
//   4. GET /api/me/vanity-slug — invoked against the REAL server.js route —
//      returns has_perk: true and can_claim: true backed by that same
//      in-memory perk store, and webhook redelivery stays idempotent.
//
// Route-invocation pattern mirrors tests/vanitySlugUnfurl.test.js: stub the
// heavy transitive deps + the db module via require.cache, load server.js
// fresh, walk the router stack and invoke the handler with fake req/res.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

// ── Shared in-memory user_one_off_perks store ─────────────────────────────
// Modeled on the fake pool in tests/magazineV3.test.js; understands exactly
// the queries oneOffPerks.js issues.
function makePerkPool(rows) {
  return {
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.startsWith('SELECT * FROM user_one_off_perks WHERE stripe_session_id')) {
        return { rows: rows.filter(r => r.stripe_session_id === params[0]) };
      }
      if (s.startsWith('INSERT INTO user_one_off_perks')) {
        const pending = s.includes("'stripe_pending'");
        const row = pending ? {
          id: rows.length + 1, account_id: params[0], perk_key: params[1],
          source: 'stripe_pending', stripe_session_id: params[2],
          amount_cents: params[3], currency: params[4],
          metadata: params[5] ? JSON.parse(params[5]) : null,
          revoked_at: new Date(), expires_at: null, granted_at: new Date(),
        } : {
          id: rows.length + 1, account_id: params[0], perk_key: params[1],
          source: params[2], stripe_session_id: params[3],
          stripe_payment_intent: params[4], amount_cents: params[5],
          currency: params[6], expires_at: params[7],
          metadata: params[8] ? JSON.parse(params[8]) : null,
          revoked_at: null, granted_at: new Date(),
        };
        rows.push(row);
        return { rows: [row] };
      }
      if (s.startsWith('SELECT 1 FROM user_one_off_perks')) {
        const m = rows.filter(r =>
          r.account_id === params[0] && r.perk_key === params[1] &&
          r.revoked_at === null &&
          (r.expires_at === null || r.expires_at > new Date()));
        return { rows: m.length ? [{ '?column?': 1 }] : [] };
      }
      if (s.startsWith('UPDATE user_one_off_perks')) {
        const row = rows.find(r => r.id === params[0]);
        if (row) {
          row.revoked_at = null;
          row.source = params[1];
          row.stripe_payment_intent = params[2] ?? row.stripe_payment_intent;
          row.amount_cents = params[3] ?? row.amount_cents;
          row.currency = params[4] ?? row.currency;
          row.granted_at = new Date();
        }
        return { rows: row ? [row] : [] };
      }
      throw new Error('unexpected query: ' + s);
    },
  };
}

// Grab the REAL webhook dispatcher + db factory before any require.cache
// stubbing happens further down.
const { handleStripeWebhookPurpose } = require('../src/monetization/magazineV3/stripeWebhook');
const { createDb: createOneOffPerkDb } = require('../src/monetization/magazineV3/oneOffPerks');

const ACCOUNT_ID = 424242; // definitely not a superuser
const SESSION_ID = 'cs_test_vanity_770';
const PERK_KEY = 'cosmetic:vanity_url';

// Shared across tests in declaration order (node:test runs them serially).
const perkRows = [];
const perkDb = createOneOffPerkDb({ getPool: () => makePerkPool(perkRows) });

// ── 1–3. pending → webhook → granted ──────────────────────────────────────

test('vanity URL perk: pending checkout row does NOT grant access', async () => {
  assert.equal(await perkDb.hasOneOffPerk(ACCOUNT_ID, PERK_KEY), false);

  // What POST /shop/vanity-url/stripe-checkout records after creating the
  // Stripe session.
  await perkDb.createOneOffPerkPending({
    accountId: ACCOUNT_ID, perkKey: PERK_KEY,
    stripeSessionId: SESSION_ID, amountCents: 1200, currency: 'aud',
    metadata: { name: 'Custom Profile URL — OCE Inhouse' },
  });

  assert.equal(await perkDb.hasOneOffPerk(ACCOUNT_ID, PERK_KEY), false,
    'pre-webhook pending row must NOT grant vanity URL access');
});

test('vanity URL perk: Stripe webhook (one_off_perk purpose) activates the perk', async () => {
  // Simulate the checkout.session.completed payload the server.js webhook
  // handler passes through after signature verification. Metadata matches
  // exactly what /shop/vanity-url/stripe-checkout sets.
  const session = {
    id: SESSION_ID,
    payment_intent: 'pi_test_vanity_770',
    amount_total: 1200,
    currency: 'aud',
    metadata: {
      purpose: 'one_off_perk',
      account_id: String(ACCOUNT_ID),
      perk_key: PERK_KEY,
    },
  };
  await handleStripeWebhookPurpose({
    purpose: session.metadata.purpose,
    session,
    db: null,
    magV3: perkDb,
    log: { log: () => {}, warn: () => {} },
  });

  assert.equal(await perkDb.hasOneOffPerk(ACCOUNT_ID, PERK_KEY), true,
    'webhook must activate the pending vanity URL perk');
  assert.equal(perkRows.length, 1, 'webhook must activate the existing pending row, not insert a duplicate');
  assert.equal(perkRows[0].source, 'stripe');
  assert.equal(perkRows[0].stripe_payment_intent, 'pi_test_vanity_770');
});

test('vanity URL perk: webhook redelivery is idempotent', async () => {
  await handleStripeWebhookPurpose({
    purpose: 'one_off_perk',
    session: {
      id: SESSION_ID,
      metadata: { purpose: 'one_off_perk', account_id: String(ACCOUNT_ID), perk_key: PERK_KEY },
    },
    db: null,
    magV3: perkDb,
    log: { log: () => {}, warn: () => {} },
  });
  assert.equal(perkRows.length, 1, 'redelivered webhook must not duplicate rows');
  assert.equal(await perkDb.hasOneOffPerk(ACCOUNT_ID, PERK_KEY), true);
});

// ── 4. GET /api/me/vanity-slug reflects the granted perk ─────────────────
// Load the real server.js API router with stubbed heavy deps, wiring
// db.magV3 to the SAME perk store the webhook just granted into.

function stubModule(specifier, exports, fromPath = __filename) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

function _stubServerDeps(dbOverrides = {}) {
  const baseDb = {
    getVanitySlugByAccount: async () => null,
    hasCoinCosmetic: async () => false,
    magV3: perkDb,
    getPool: () => ({ query: async () => ({ rows: [] }) }),
  };
  const merged = { ...baseDb, ...dbOverrides };
  const proxiedDb = new Proxy(merged, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return async () => null;
    },
  });

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

  const dbPath = require.resolve('../src/db');
  delete require.cache[dbPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: proxiedDb };
}

function _loadServerFresh() {
  delete require.cache[require.resolve('../src/web/server')];
  return require('../src/web/server');
}

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

function _findRoute(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method]) {
      return layer.route;
    }
  }
  throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
}

function _makeRes() {
  return {
    headersSent: false, statusCode: 200, body: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    set(k, v) { typeof k === 'object' ? Object.assign(this.headers, k) : this.headers[k] = v; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    json(b) { this.body = b; this.headersSent = true; return this; },
    send(b) { this.body = b; this.headersSent = true; return this; },
  };
}

async function _invokeHandler(route, req) {
  const res = _makeRes();
  let nextErr = null;
  for (const layer of route.stack) {
    if (res.headersSent) break;
    await new Promise((resolve, reject) => {
      try {
        const ret = layer.handle(req, res, (err) => { if (err) nextErr = err; resolve(); });
        if (ret && typeof ret.then === 'function') ret.then(() => resolve(), reject);
      } catch (err) { reject(err); }
    });
    if (nextErr) throw nextErr;
  }
  return res;
}

function _makeReq(overrides = {}) {
  const headers = { host: 'oceinhouse.gg', ...(overrides.headers || {}) };
  return {
    headers,
    params: overrides.params || {},
    query: overrides.query || {},
    body: overrides.body || {},
    session: overrides.session || {},
    protocol: 'https',
    get(name) { return headers[String(name).toLowerCase()]; },
  };
}

test('GET /api/me/vanity-slug: post-webhook perk holder gets has_perk + can_claim',
  _withUnreffedIntervals(async () => {
    _stubServerDeps();
    const { createApiRouter } = _loadServerFresh();
    const router = createApiRouter({}, null);
    const route = _findRoute(router, 'get', '/me/vanity-slug');
    const res = await _invokeHandler(route, _makeReq({ session: { accountId: ACCOUNT_ID } }));

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.has_perk, true, 'granted Stripe perk must surface as has_perk: true');
    assert.equal(res.body.can_claim, true, 'perk holder must be allowed to claim a slug');
    assert.equal(res.body.grandfathered, false, 'a purchased perk is not the grandfathered path');
  })
);

test('GET /api/me/vanity-slug: account WITHOUT the perk cannot claim',
  _withUnreffedIntervals(async () => {
    _stubServerDeps();
    const { createApiRouter } = _loadServerFresh();
    const router = createApiRouter({}, null);
    const route = _findRoute(router, 'get', '/me/vanity-slug');
    // Different account — never went through checkout/webhook.
    const res = await _invokeHandler(route, _makeReq({ session: { accountId: 555 } }));

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.has_perk, false);
    assert.equal(res.body.can_claim, false, 'no perk + no slug must mean can_claim: false');
  })
);
