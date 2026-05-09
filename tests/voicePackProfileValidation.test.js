// Task #218 — server-side test coverage for the voice-pack validation block
// added under Task #206 to POST /api/me/profile.
//
// Pattern mirrors the layout-theme cosmetics validation tests called out in
// the task description: load the real route via createApiRouter(), stub the
// db layer (and the heavy non-route requires server.js pulls in at top
// level), then drive the route with supertest-shaped fetches over a
// throwaway HTTP server. The route reaches voice-pack validation only after
// every preceding cosmetic field validates, so each request body sets
// safe/empty values for the other knobs.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const Module = require('node:module');

// --- Pre-load stubs into require.cache BEFORE requiring server.js ---------
// server.js top-level requires several heavy modules (replay parser, stats,
// groq, discord/bot). None of them are exercised by /me/profile, so we
// short-circuit them with empty/no-op exports so a clean test environment
// (no DATABASE_URL, no Steam, no Discord) doesn't have to spin them up.
function stubModule(relPathFromSrcWeb, exports) {
  const resolved = require.resolve(path.join(__dirname, '..', 'src', 'web', relPathFromSrcWeb));
  require.cache[resolved] = new Module(resolved);
  require.cache[resolved].filename = resolved;
  require.cache[resolved].loaded = true;
  require.cache[resolved].exports = exports;
}

stubModule('../replay/replayParser', { getReplayParser: () => ({ parserReady: false }) });
stubModule('../stats/statsService', { getStatsService: () => ({}) });
stubModule('../services/groqService', {
  generateChatResponse: async () => null,
  generateWeeklyRecapBlurb: async () => null,
});
stubModule('../discord/bot', { getDiscordBot: () => null });
// createApiRouter() mounts the Magazine v3 routes via a require() inside
// the factory; with no `app` reference the mount logs a noisy warning.
// Stub the mounter so the test output stays quiet.
stubModule('../monetization/magazineV3', { mountMagazineV3Routes: () => {} });

// db stub — populated per-test via setDbMocks() below. Routes call
// `require('../db')` and the top of server.js also does `const db =
// require('../db')`, both resolving to the same cached object, so mutating
// this object's methods from the test takes effect everywhere.
const dbStub = {};
stubModule('../db', dbStub);

// Stop ensure-dir + repeating timers from leaking past the test process.
const _origSetInterval = global.setInterval;
global.setInterval = function patchedSetInterval(fn, ms, ...rest) {
  const t = _origSetInterval(fn, ms, ...rest);
  if (t && typeof t.unref === 'function') t.unref();
  return t;
};

const { createApiRouter } = require('../src/web/server');
const cosm = require('../src/profileCosmetics');

global.setInterval = _origSetInterval;

// --- Test harness --------------------------------------------------------
const express = require('express');

let savedFields = null;
let isProValue = false;

function resetMocks() {
  rotateAccountId();
  savedFields = null;
  isProValue = false;
  Object.assign(dbStub, {
    isProMember: async () => isProValue,
    getPlayerProfileCustomization: async () => ({ pinned_achievements: [], cover_fx: [] }),
    setPlayerProfileCustomization: async (_accountId, fields) => {
      savedFields = fields;
      return { account_id: _accountId, ...fields };
    },
    getOwnedEntitlements: async () => [],
    hasFrameUnlocked: async () => true,
    getMergedAccountIds: async (id) => [id],
    getPlayerAchievements: async () => [],
    expireOldReplayFiles: async () => [],
    getPool: () => ({ query: async () => ({ rows: [] }) }),
  });
}

let server = null;
let baseUrl = null;
// _isProAccount caches its result for 60s keyed by accountId, so each test
// uses a fresh id to dodge cross-test cache pollution.
let _nextAccountId = 1000000;
let CURRENT_ACCOUNT_ID = String(_nextAccountId);
function rotateAccountId() {
  _nextAccountId += 1;
  CURRENT_ACCOUNT_ID = String(_nextAccountId);
}

before(async () => {
  resetMocks();
  const app = express();
  // Inject session BEFORE the router so /me/profile sees a logged-in user.
  app.use((req, _res, next) => {
    req.session = { accountId: CURRENT_ACCOUNT_ID };
    next();
  });
  app.use('/api', createApiRouter({}));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function postProfile(body) {
  const res = await fetch(`${baseUrl}/api/me/profile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

// Minimal valid baseline body — every preceding cosmetic check passes,
// so the response is driven purely by the voice-pack field under test.
function baseBody(extra = {}) {
  return {
    bio: '',
    custom_title: '',
    theme_accent: '',
    pinned_hero_id: '',
    pinned_hero_caption: '',
    pinned_match_id: '',
    profile_frame: 'none',
    profile_layout_theme: '',
    extras: {},
    pinned_achievements: [],
    cover_fx: [],
    ...extra,
  };
}

// --- Tests ---------------------------------------------------------------

test('rejects an unknown voice pack with HTTP 400', async () => {
  resetMocks();
  isProValue = true; // Pro flag must NOT bypass the unknown-value check.
  const { status, body } = await postProfile(baseBody({ selected_voice_pack: 'totally-fake-pack' }));
  assert.strictEqual(status, 400);
  assert.strictEqual(body.error, 'Unknown voice pack');
  assert.strictEqual(savedFields, null, 'must not persist on validation failure');
});

test('rejects a non-Pro user picking a premium pack with HTTP 403', async () => {
  for (const pack of cosm.PREMIUM_VOICE_PACKS) {
    resetMocks();
    isProValue = false;
    const { status, body } = await postProfile(baseBody({ selected_voice_pack: pack }));
    assert.strictEqual(status, 403, `pack ${pack} should be 403 for non-Pro`);
    assert.strictEqual(body.error, 'Voice packs are reserved for Pro members');
    assert.strictEqual(savedFields, null, `pack ${pack} must not persist for non-Pro`);
  }
});

test('persists a valid voice pack for a Pro user', async () => {
  resetMocks();
  isProValue = true;
  const pack = cosm.PREMIUM_VOICE_PACKS[0];
  const { status, body } = await postProfile(baseBody({ selected_voice_pack: pack }));
  assert.strictEqual(status, 200);
  assert.strictEqual(body.ok, true);
  assert.ok(savedFields, 'setPlayerProfileCustomization must be called');
  assert.strictEqual(savedFields.selected_voice_pack, pack);
});

test('null clears the selected voice pack column', async () => {
  resetMocks();
  isProValue = true;
  const { status } = await postProfile(baseBody({ selected_voice_pack: null }));
  assert.strictEqual(status, 200);
  assert.ok(savedFields);
  assert.strictEqual(savedFields.selected_voice_pack, null);
});

test('empty string clears the selected voice pack column (normalised to null)', async () => {
  resetMocks();
  isProValue = true;
  const { status } = await postProfile(baseBody({ selected_voice_pack: '' }));
  assert.strictEqual(status, 200);
  assert.ok(savedFields);
  assert.strictEqual(savedFields.selected_voice_pack, null,
    'empty string should be normalised to null before persistence');
});

test('omitting the field entirely is treated as null/clear', async () => {
  resetMocks();
  isProValue = false; // a non-Pro user not touching the field must succeed.
  const { status } = await postProfile(baseBody());
  assert.strictEqual(status, 200);
  assert.ok(savedFields);
  assert.strictEqual(savedFields.selected_voice_pack, null);
});
