// Task #271 — automated tests for the share-card hero validation +
// owner-only OG preview gating shipped in Task #259.
//
// Two security-relevant code paths were uncovered:
//   1. validateExtras() in src/profileCosmetics.js coerces malformed
//      share_card_hero_id values to null so a bad client save can't
//      poison the field. Without coverage, a future refactor could
//      silently start persisting garbage strings or out-of-range ints.
//   2. GET /og/profile/by-id/:accountId.png honours ?preview_hero_id=
//      ONLY when the requester's session matches the account being
//      rendered. A regression here would let a third party trick the
//      generator into rendering arbitrary heroes on someone else's card.
//
// Pattern mirrors tests/vanitySlugUnfurl.test.js: stub server.js's heavy
// transitive deps + the db module via require.cache, walk the route
// stack, and invoke the handler directly with a fake req/res. The
// profileOgCard generator is also stubbed so the test captures the
// resolved heroId without spinning up canvas.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const { validateExtras } = require('../src/profileCosmetics');

// ── 1. validateExtras() — share_card_hero_id shapes ──────────────────

test('validateExtras: null share_card_hero_id stays null', () => {
  const r = validateExtras({ share_card_hero_id: null });
  assert.equal(r.ok, true);
  assert.equal(r.extras.share_card_hero_id, null);
});

test('validateExtras: missing share_card_hero_id defaults to null', () => {
  const r = validateExtras({});
  assert.equal(r.ok, true);
  assert.equal(r.extras.share_card_hero_id, null);
});

test('validateExtras: empty-string share_card_hero_id coerces to null', () => {
  const r = validateExtras({ share_card_hero_id: '' });
  assert.equal(r.ok, true);
  assert.equal(r.extras.share_card_hero_id, null);
});

test("validateExtras: 'most_played' sentinel is preserved", () => {
  const r = validateExtras({ share_card_hero_id: 'most_played' });
  assert.equal(r.ok, true);
  assert.equal(r.extras.share_card_hero_id, 'most_played');
});

test('validateExtras: positive integer hero id is preserved', () => {
  const r = validateExtras({ share_card_hero_id: 14 });
  assert.equal(r.ok, true);
  assert.equal(r.extras.share_card_hero_id, 14);
});

test('validateExtras: numeric string hero id is parsed to int', () => {
  const r = validateExtras({ share_card_hero_id: '42' });
  assert.equal(r.ok, true);
  assert.equal(r.extras.share_card_hero_id, 42);
});

test('validateExtras: garbage string is coerced to null (not persisted)', () => {
  const r = validateExtras({ share_card_hero_id: 'pwned"; DROP TABLE--' });
  assert.equal(r.ok, true);
  assert.equal(r.extras.share_card_hero_id, null);
});

test('validateExtras: zero / negative / NaN hero ids coerce to null', () => {
  for (const bad of [0, -1, -9999, NaN, Infinity]) {
    const r = validateExtras({ share_card_hero_id: bad });
    assert.equal(r.ok, true, `value ${bad} must validate`);
    assert.equal(r.extras.share_card_hero_id, null,
      `value ${bad} must be coerced to null`);
  }
});

test('validateExtras: out-of-range hero id (>= 1,000,000) coerces to null', () => {
  const r = validateExtras({ share_card_hero_id: 9999999 });
  assert.equal(r.ok, true);
  assert.equal(r.extras.share_card_hero_id, null);
});

test('validateExtras: object / non-numeric array shapes coerce to null (no crash)', () => {
  // Note: a single-element array like [14] coerces to "14" via Array.toString
  // and parses to a valid hero id; that's fine — same effect as submitting 14.
  // What we care about is that non-numeric / structural shapes don't poison.
  for (const bad of [{}, [], { hero: 1 }, ['a', 'b'], { toString: () => 'nope' }]) {
    const r = validateExtras({ share_card_hero_id: bad });
    assert.equal(r.ok, true);
    assert.equal(r.extras.share_card_hero_id, null);
  }
});

// ── 2. GET /og/profile/by-id/:accountId.png — preview_hero_id gate ───

function stubModule(specifier, exports, fromPath = __filename) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

// Capture the opts the route resolves into a card render. We stub the
// generator so the test never touches @napi-rs/canvas and so we can
// assert exactly which heroId the route asked the generator to draw.
let capturedCardOpts = null;
function _stubServerDeps(dbOverrides = {}) {
  const baseDb = {
    isWellFormedVanitySlug: () => true,
    getAccountIdByVanitySlug: async () => null,
    getVanitySlugByAccount: async () => null,
    getNickname: async () => null,
    getPlayerRating: async () => null,
    getPlayerProfileCustomization: async () => null,
    getPool: () => ({ query: async () => ({ rows: [] }) }),
    isProMember: async () => false,
    getOwnedEntitlements: async () => [],
    getMergedAccountIds: async (id) => [id],
    getPlayerAchievements: async () => [],
    hasFrameUnlocked: async () => true,
    hasEntitlement: async () => false,
    countEntitlementHolders: async () => 0,
    grantEntitlementWithCap: async () => ({ ok: true }),
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
  stubModule('../src/services/profileOgCard', {
    generateProfileOgCard: async (opts) => {
      capturedCardOpts = opts;
      return Buffer.from('fake-png');
    },
  });

  const dbPath = require.resolve('../src/db');
  delete require.cache[dbPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: proxiedDb };

  return { proxiedDb };
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

function _findAppRoute(app, method, path) {
  const router = app._router || app.router;
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method]) {
      return layer.route;
    }
  }
  throw new Error(`app route not found: ${method.toUpperCase()} ${path}`);
}

function _makeRes() {
  const res = {
    headersSent: false,
    statusCode: 200,
    body: null,
    headers: {},
    redirectedTo: null,
    redirectedStatus: null,
    status(code) { this.statusCode = code; return this; },
    set(k, v) {
      if (typeof k === 'object') Object.assign(this.headers, k);
      else this.headers[k] = v;
      return this;
    },
    setHeader(k, v) { this.headers[k] = v; return this; },
    send(b) { this.body = b; this.headersSent = true; return this; },
    json(b) { this.body = b; this.headersSent = true; return this; },
    redirect(a, b) {
      if (typeof a === 'number') { this.redirectedStatus = a; this.redirectedTo = b; }
      else { this.redirectedStatus = 302; this.redirectedTo = a; }
      this.statusCode = this.redirectedStatus;
      this.headers['Location'] = this.redirectedTo;
      this.headersSent = true;
      return this;
    },
  };
  return res;
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
  const headers = { host: 'oceinhouse.gg', 'user-agent': '', ...(overrides.headers || {}) };
  return {
    headers,
    params: overrides.params || {},
    query: overrides.query || {},
    body: overrides.body || {},
    session: overrides.session || {},
    protocol: overrides.protocol || 'https',
    get(name) { return headers[String(name).toLowerCase()]; },
  };
}

// Saved share-card override = hero 5 (Crystal Maiden); most-played
// from player_stats = hero 99 (Bristleback). The preview override that
// the owner is auditioning = hero 14 (Pudge). We assert which of the
// three the route picks for each session+query combination.
const SAVED_OVERRIDE_HERO = 5;
const MOST_PLAYED_HERO = 99;
const PREVIEW_HERO = 14;
const ACCOUNT_ID = '12345';

function _seedDbWithSavedOverride() {
  return _stubServerDeps({
    getPlayerProfileCustomization: async () => ({
      pinned_hero_id: null,
      extras: { share_card_hero_id: SAVED_OVERRIDE_HERO },
    }),
    getPool: () => ({
      query: async () => ({ rows: [{ hero_id: MOST_PLAYED_HERO, hero_name: 'npc_dota_hero_bristleback', games: 5 }] }),
    }),
    getNickname: async () => 'TestPro',
    getPlayerRating: async () => ({ display_name: 'TestPro', mmr: 4000, wins: 1, losses: 0 }),
  });
}

test('OG by-id: anonymous ?preview_hero_id is IGNORED (saved override wins)',
  _withUnreffedIntervals(async () => {
    capturedCardOpts = null;
    _seedDbWithSavedOverride();
    const { createServer } = _loadServerFresh();
    const app = createServer({});
    const route = _findAppRoute(app, 'get', '/og/profile/by-id/:accountId.png');
    const res = await _invokeHandler(route, _makeReq({
      params: { accountId: ACCOUNT_ID },
      query: { preview_hero_id: String(PREVIEW_HERO) },
      session: {},
    }));
    assert.equal(res.statusCode, 200);
    assert.equal(capturedCardOpts.heroId, SAVED_OVERRIDE_HERO,
      'an anonymous third party MUST NOT be able to override the rendered hero');
    assert.equal(res.headers['Cache-Control'], 'public, max-age=600',
      'non-preview responses keep the public cache header');
  })
);

test('OG by-id: signed-in non-owner ?preview_hero_id is IGNORED',
  _withUnreffedIntervals(async () => {
    capturedCardOpts = null;
    _seedDbWithSavedOverride();
    const { createServer } = _loadServerFresh();
    const app = createServer({});
    const route = _findAppRoute(app, 'get', '/og/profile/by-id/:accountId.png');
    const res = await _invokeHandler(route, _makeReq({
      params: { accountId: ACCOUNT_ID },
      query: { preview_hero_id: String(PREVIEW_HERO) },
      session: { accountId: '67890' }, // a different signed-in user
    }));
    assert.equal(res.statusCode, 200);
    assert.equal(capturedCardOpts.heroId, SAVED_OVERRIDE_HERO,
      'a signed-in third party MUST NOT be able to override the rendered hero');
    assert.equal(res.headers['Cache-Control'], 'public, max-age=600',
      'non-owner requests must keep the public cache (no preview bypass)');
  })
);

test('OG by-id: owner ?preview_hero_id IS honoured',
  _withUnreffedIntervals(async () => {
    capturedCardOpts = null;
    _seedDbWithSavedOverride();
    const { createServer } = _loadServerFresh();
    const app = createServer({});
    const route = _findAppRoute(app, 'get', '/og/profile/by-id/:accountId.png');
    const res = await _invokeHandler(route, _makeReq({
      params: { accountId: ACCOUNT_ID },
      query: { preview_hero_id: String(PREVIEW_HERO) },
      session: { accountId: ACCOUNT_ID },
    }));
    assert.equal(res.statusCode, 200);
    assert.equal(capturedCardOpts.heroId, PREVIEW_HERO,
      'the owner CAN audition a hero before saving');
    assert.equal(res.headers['Cache-Control'], 'no-store',
      'preview responses MUST bypass the public cache');
  })
);

test("OG by-id: owner ?preview_hero_id=most_played skips saved override",
  _withUnreffedIntervals(async () => {
    capturedCardOpts = null;
    _seedDbWithSavedOverride();
    const { createServer } = _loadServerFresh();
    const app = createServer({});
    const route = _findAppRoute(app, 'get', '/og/profile/by-id/:accountId.png');
    const res = await _invokeHandler(route, _makeReq({
      params: { accountId: ACCOUNT_ID },
      query: { preview_hero_id: 'most_played' },
      session: { accountId: ACCOUNT_ID },
    }));
    assert.equal(res.statusCode, 200);
    assert.equal(capturedCardOpts.heroId, MOST_PLAYED_HERO,
      "owner's most_played sentinel must skip the saved override");
    assert.equal(res.headers['Cache-Control'], 'no-store');
  })
);

test('OG by-id: non-owner ?preview_hero_id=most_played is IGNORED',
  _withUnreffedIntervals(async () => {
    capturedCardOpts = null;
    _seedDbWithSavedOverride();
    const { createServer } = _loadServerFresh();
    const app = createServer({});
    const route = _findAppRoute(app, 'get', '/og/profile/by-id/:accountId.png');
    const res = await _invokeHandler(route, _makeReq({
      params: { accountId: ACCOUNT_ID },
      query: { preview_hero_id: 'most_played' },
      session: { accountId: '67890' },
    }));
    assert.equal(res.statusCode, 200);
    assert.equal(capturedCardOpts.heroId, SAVED_OVERRIDE_HERO,
      'most_played sentinel from a third party must be ignored');
    assert.equal(res.headers['Cache-Control'], 'public, max-age=600',
      'non-owner most_played sentinel must keep the public cache (no preview bypass)');
  })
);

test('OG by-id: non-numeric accountId is rejected (302 to /oa-logo.png)',
  _withUnreffedIntervals(async () => {
    capturedCardOpts = null;
    _stubServerDeps();
    const { createServer } = _loadServerFresh();
    const app = createServer({});
    const route = _findAppRoute(app, 'get', '/og/profile/by-id/:accountId.png');
    const res = await _invokeHandler(route, _makeReq({
      params: { accountId: 'not-a-number' },
      query: { preview_hero_id: '14' },
      session: { accountId: 'not-a-number' },
    }));
    assert.equal(res.redirectedStatus, 302);
    assert.equal(res.redirectedTo, '/oa-logo.png');
    assert.equal(capturedCardOpts, null,
      'a malformed accountId must short-circuit before the generator runs');
  })
);
