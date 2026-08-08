// Task #900 — manifest-style paywall sweep across every requirePro-gated
// route mounted in src/web/server.js.
//
// tests/csvExportProGate.test.js gives the CSV export deep per-route
// coverage, but there are ~12 other requirePro mounts (hero matchups,
// synergy, head-to-head, benchmarks, skill builds, performance trend,
// etc.). A refactor could silently drop requirePro from any of them and
// no test would notice — exposing paid features to free users.
//
// Modeled on tests/superuserAdminRouteAuth.test.js:
//   1. Boot src/web/server.js with the shared harness (no Postgres /
//      Stripe / Discord / Steam).
//   2. Diff the live router stack (routes whose stack contains the
//      `_requirePro` middleware) against the EXPECTED_PRO_ROUTES manifest.
//      Exact set equality both ways:
//        - A route that LOST its requirePro gate disappears from the live
//          set → the diff trips deterministically.
//        - A new requirePro route added without updating the manifest
//          appears only in the live set → the diff also trips, forcing a
//          conscious manifest update.
//   3. For every (method, path, featureKey) in the manifest, with the
//      pro_tier flag ON, probe the full route stack and assert:
//        a. Anonymous caller           → 402, paywall:true,
//           feature === featureKey, signed_in:false
//        b. Signed-in free (non-Pro)   → 402, paywall:true,
//           feature === featureKey, signed_in:true
//      The feature-key assertion means a gate that keeps requirePro but
//      swaps to the wrong feature key also fails.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  _stubServerDeps,
  _invokeHandler,
  _withUnreffedIntervals,
  _loadServerFresh,
} = require('./fixtures/serverHarness');

// Explicit manifest of every requirePro-gated (method, path, featureKey)
// triple on the api router. Keep in sync with `requirePro(` mounts in
// src/web/server.js — the sweep below diffs the live router stack against
// this list, so adding or removing a gate without updating it fails
// deterministically.
const EXPECTED_PRO_ROUTES = [
  ['get', '/social-graph',                        'player_network'],
  ['get', '/player-connections/:accountId',       'player_network'],
  ['get', '/hero-matchups',                       'hero_matchups'],
  ['get', '/heroes/:heroId/skill-builds',         'skill_builds'],
  ['get', '/synergy',                             'synergy_matrix'],
  ['get', '/synergy/heatmap',                     'synergy_heatmap'],
  ['get', '/enemy-synergy/heatmap',               'synergy_heatmap'],
  ['get', '/head-to-head',                        'head_to_head'],
  ['get', '/h2h/:a/:b',                           'head_to_head'],
  ['get', '/compare',                             'compare_players'],
  ['get', '/player/:id/match-stats-history',      'performance_trend'],
  ['get', '/benchmarks',                          'player_benchmarks'],
  ['get', '/heroes/meta-v2',                      'hero_meta_v2'],
  ['get', '/players/:id/matches/export.csv',      'csv_export'],
];

// Routes intentionally excluded from the per-route 402 probe sweep. Keep
// empty unless a route legitimately cannot be exercised by the generic
// prober. Format: ['get', '/some/route'].
const PROBE_ALLOWLIST = [];

// pro_tier ON so requirePro actually gates (the harness proxy would
// otherwise return null → flag off → gate passes everyone through).
const FLAGS = { pro_tier: { key: 'pro_tier', state: 'on' } };

function _key(method, path) { return `${method.toUpperCase()} ${path}`; }

function _collectLiveProRoutes(router) {
  const out = [];
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const guarded = layer.route.stack.some(
      (sub) => sub.handle && sub.handle.name === '_requirePro'
    );
    if (!guarded) continue;
    for (const method of Object.keys(layer.route.methods)) {
      out.push([method, layer.route.path]);
    }
  }
  return out;
}

function _findRoute(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method]) {
      return layer.route;
    }
  }
  throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
}

function _boot() {
  _stubServerDeps({
    getFeatureFlag: async (key) => FLAGS[key] || null,
    isProMember: async () => false,
  });
  const { createApiRouter } = _loadServerFresh();
  return createApiRouter({}, null);
}

async function _probe(route, session) {
  const req = {
    session,
    body: {},
    params: {},
    query: {},
    headers: {},
    method: 'GET',
    url: route.path,
    get(name) { return (this.headers && this.headers[String(name).toLowerCase()]) || undefined; },
  };
  return _invokeHandler(route, req);
}

test('pro routes: live requirePro set matches the expected manifest exactly', _withUnreffedIntervals(async () => {
  const router = _boot();

  const live = new Set(_collectLiveProRoutes(router).map(([m, p]) => _key(m, p)));
  const expected = new Set(EXPECTED_PRO_ROUTES.map(([m, p]) => _key(m, p)));

  const missingFromLive = [...expected].filter((k) => !live.has(k));
  const missingFromManifest = [...live].filter((k) => !expected.has(k));

  assert.deepEqual(missingFromLive, [],
    `Routes lost their requirePro gate (or were removed entirely). ` +
    `If intentional, delete them from EXPECTED_PRO_ROUTES. Otherwise restore the gate:\n  ` +
    missingFromLive.join('\n  '));
  assert.deepEqual(missingFromManifest, [],
    `New requirePro-gated routes mounted but not added to EXPECTED_PRO_ROUTES. ` +
    `Add them (with their feature key) so the paywall sweep covers them:\n  ` +
    missingFromManifest.join('\n  '));
}));

test('pro routes: anon and free users get 402 paywall with the right feature key', _withUnreffedIntervals(async () => {
  const router = _boot();

  const probeList = EXPECTED_PRO_ROUTES.filter(
    ([m, p]) => !PROBE_ALLOWLIST.some(([am, ap]) => am === m && ap === p)
  );

  for (const [method, path, featureKey] of probeList) {
    const route = _findRoute(router, method, path);
    const label = _key(method, path);

    // (a) Anonymous: no session → 402 paywall, signed_in:false.
    const anon = await _probe(route, undefined);
    assert.equal(anon.status, 402,
      `${label}: anonymous caller must hit the paywall with 402 (got ${anon.status})`);
    assert.equal(anon.body.paywall, true, `${label}: anon body must set paywall:true`);
    assert.equal(anon.body.feature, featureKey,
      `${label}: anon paywall must report feature "${featureKey}" (got "${anon.body.feature}")`);
    assert.equal(anon.body.signed_in, false, `${label}: anon must report signed_in:false`);

    // (b) Signed-in free (non-Pro) user → 402 paywall, signed_in:true.
    const free = await _probe(route, { accountId: '12345' });
    assert.equal(free.status, 402,
      `${label}: signed-in free user must hit the paywall with 402 (got ${free.status})`);
    assert.equal(free.body.paywall, true, `${label}: free-user body must set paywall:true`);
    assert.equal(free.body.feature, featureKey,
      `${label}: free-user paywall must report feature "${featureKey}" (got "${free.body.feature}")`);
    assert.equal(free.body.signed_in, true, `${label}: free user must report signed_in:true`);
  }
}));
