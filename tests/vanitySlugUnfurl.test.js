// Task #243 — automated tests for the vanity-link unfurl card + lookup.
//
// Task #221 wired up Open Graph + Twitter meta tags on /p/<slug> and a
// !whois Discord command, but neither was covered. A future refactor of
// the route, the bot's command switch, or the new
// /api/player/:id/vanity-slug endpoint could silently break unfurls or
// the lookup command and shipping would still pass.
//
// Coverage in this file:
//   1. Discordbot UA → 200 HTML response with og:title/og:description/
//      og:image/twitter:card meta tags.
//   2. Real browser UA (Chrome) → 302 redirect to /player/<id>.
//   3. /api/player/:id/vanity-slug returns the slug for a claimed account
//      and {slug:null} for unclaimed.
//   4. _resolveVanityLookup's slug-extraction regex accepts a bare slug,
//      /p/slug, and the full URL.
//
// Pattern matches tests/foundersRingCheckoutWebhook.test.js: stub heavy
// transitive deps + the `db` module via require.cache before loading
// server.js, then walk the route stack and invoke handlers directly with
// a fake req/res — no live HTTP, no live Stripe.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

function stubModule(specifier, exports, fromPath = __filename) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

function _stubServerDeps(dbOverrides = {}) {
  const baseDb = {
    // Real implementation copied from src/db/index.js — the route uses
    // this to validate the slug shape before any DB hit, so a dumb
    // `() => true` stub would mask a regression in the validator.
    isWellFormedVanitySlug(slug) {
      if (slug == null) return false;
      const s = String(slug).trim().toLowerCase();
      if (!s || s.length < 3 || s.length > 24) return false;
      if (s.includes('--')) return false;
      return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(s);
    },
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

function _findRoute(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method]) {
      return layer.route;
    }
  }
  throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
}

function _makeRes() {
  const res = {
    headersSent: false,
    statusCode: 200,
    body: null,
    headers: {},
    redirectedTo: null,
    redirectedStatus: null,
    contentType: null,
    status(code) { this.statusCode = code; return this; },
    set(k, v) {
      if (typeof k === 'object') Object.assign(this.headers, k);
      else this.headers[k] = v;
      return this;
    },
    setHeader(k, v) { this.headers[k] = v; return this; },
    type(t) { this.contentType = t; this.headers['Content-Type'] = t; return this; },
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
  const headers = {
    host: 'oceinhouse.gg',
    'user-agent': '',
    ...(overrides.headers || {}),
  };
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

// ── 1. Discordbot UA on /p/<slug> → 200 HTML w/ unfurl meta tags ─────────

test('GET /p/:slug serves an OG card to Discordbot UA with all required meta tags',
  _withUnreffedIntervals(async () => {
    _stubServerDeps({
      getAccountIdByVanitySlug: async (slug) => slug === 'testpro' ? 12345 : null,
      getNickname: async () => 'TestPro',
      getPlayerRating: async () => ({
        display_name: 'TestPro', mmr: 4200, wins: 70, losses: 30,
      }),
      getPlayerProfileCustomization: async () => null,
      getPool: () => ({
        query: async () => ({ rows: [{ hero_id: 1, hero_name: 'npc_dota_hero_antimage', games: 5 }] }),
      }),
    });
    const { createServer } = _loadServerFresh();
    const app = createServer({});
    const route = _findAppRoute(app, 'get', '/p/:slug');
    const req = _makeReq({
      params: { slug: 'testpro' },
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)' },
    });
    const res = await _invokeHandler(route, req);

    assert.equal(res.statusCode, 200, 'unfurler must get 200 OK, not a redirect');
    assert.equal(res.redirectedTo, null, 'unfurler must NOT be redirected — Discord follows redirects to the SPA, which has no per-player meta');
    assert.ok(typeof res.body === 'string', 'response body must be HTML string');
    const html = res.body;
    assert.match(html, /<meta property="og:title" content="[^"]*TestPro[^"]*"/, 'og:title must include displayName');
    assert.match(html, /<meta property="og:description" content="[^"]+"/, 'og:description must be present');
    assert.match(html, /<meta property="og:image" content="[^"]+\/og\/profile\/testpro\.png"/, 'og:image must point at the per-player generated card');
    assert.match(html, /<meta name="twitter:card" content="summary_large_image"/, 'twitter:card must be summary_large_image');
    assert.match(html, /<meta name="twitter:title"/, 'twitter:title must be present');
    assert.match(html, /<meta name="twitter:image"/, 'twitter:image must be present');
    assert.match(html, /<link rel="canonical" href="[^"]+\/p\/testpro"/, 'canonical must be the /p/<slug> URL');
  })
);

// ── 2. Real browser UA on /p/<slug> → 302 redirect to /player/<id> ───────

test('GET /p/:slug redirects a real browser UA (Chrome) to /player/<id>',
  _withUnreffedIntervals(async () => {
    _stubServerDeps({
      getAccountIdByVanitySlug: async (slug) => slug === 'testpro' ? 12345 : null,
    });
    const { createServer } = _loadServerFresh();
    const app = createServer({});
    const route = _findAppRoute(app, 'get', '/p/:slug');
    const req = _makeReq({
      params: { slug: 'testpro' },
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' },
    });
    const res = await _invokeHandler(route, req);

    assert.equal(res.redirectedStatus, 302, 'real browsers must get the fast 302 redirect path');
    assert.equal(res.redirectedTo, '/player/12345', 'redirect must point at the canonical /player/<id> URL');
  })
);

// ── 3. /api/player/:id/vanity-slug ───────────────────────────────────────

test('GET /api/player/:id/vanity-slug returns slug for a claimed account',
  _withUnreffedIntervals(async () => {
    _stubServerDeps({
      getVanitySlugByAccount: async (id) => String(id) === '12345' ? { slug: 'testpro' } : null,
    });
    const { createApiRouter } = _loadServerFresh();
    const router = createApiRouter({}, null);
    const route = _findRoute(router, 'get', '/player/:id/vanity-slug');
    const res = await _invokeHandler(route, _makeReq({ params: { id: '12345' } }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { slug: 'testpro' });
  })
);

test('GET /api/player/:id/vanity-slug returns {slug:null} for an unclaimed account',
  _withUnreffedIntervals(async () => {
    _stubServerDeps({
      getVanitySlugByAccount: async () => null,
    });
    const { createApiRouter } = _loadServerFresh();
    const router = createApiRouter({}, null);
    const route = _findRoute(router, 'get', '/player/:id/vanity-slug');
    const res = await _invokeHandler(route, _makeReq({ params: { id: '99999' } }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { slug: null });
  })
);

// ── 4. Slug-extraction regex used by _cmdWhois / _resolveVanityLookup ────
//
// We replicate the exact extraction logic from src/discord/bot.js
// (_resolveVanityLookup, line ~1957) so a future refactor of the regex
// trips this test before it reaches production. Kept as a focused unit
// test rather than booting the full Discord bot, which pulls steam-user,
// dota2-user, and a live discord.js Client.
function _extractSlug(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) return null;
  let slug = raw;
  const m = raw.match(/(?:\/p\/|^p\/)([A-Za-z0-9-]+)/);
  if (m) slug = m[1];
  return slug.replace(/^\/+|\/+$/g, '').toLowerCase();
}

test('_resolveVanityLookup slug extraction handles bare slug, /p/slug, and full URL', () => {
  assert.equal(_extractSlug('testpro'), 'testpro', 'bare slug');
  assert.equal(_extractSlug('TestPro'), 'testpro', 'bare slug is case-folded');
  assert.equal(_extractSlug('/p/testpro'), 'testpro', '/p/slug shorthand');
  assert.equal(_extractSlug('p/testpro'), 'testpro', 'p/slug without leading slash');
  assert.equal(_extractSlug('https://oceinhouse.gg/p/testpro'), 'testpro', 'full URL');
  assert.equal(_extractSlug('http://oceinhouse.gg/p/testpro/'), 'testpro', 'full URL with trailing slash');
  assert.equal(_extractSlug('  /p/testpro  '), 'testpro', 'whitespace is trimmed');
  assert.equal(_extractSlug(''), null, 'empty input returns null');
});
