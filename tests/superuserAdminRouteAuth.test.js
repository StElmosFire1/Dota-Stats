// Task #267 — auth-only sweep across every superuser admin route mounted
// in src/web/server.js.
//
// Task #257 locked in 401/403/200 coverage for the three Founders Pass
// admin routes. The same elevation-of-privilege failure shape — a refactor
// silently dropping `requireSuperuser` — applies equally to every other
// admin/superuser route on the API. Without coverage any of them could
// quietly lose its auth gate and the deploy gates would still pass green.
//
// What this test does:
//   1. Boot src/web/server.js with the shared harness so createApiRouter()
//      is available without touching Postgres / Stripe / Discord / Steam.
//   2. Compare the live router stack against the EXPECTED_SUPERUSER_ROUTES
//      manifest below. The two sets must match exactly:
//        - Routes that LOST `requireSuperuser` since the manifest was
//          checked in disappear from the live set → the diff trips and
//          the test fails deterministically (not just when the floor
//          count drops).
//        - Routes that GAINED `requireSuperuser` (new admin routes added
//          without updating the manifest) appear in the live set but not
//          in the manifest → the diff also trips, forcing the author to
//          consciously add them to the manifest.
//   3. For every (method, path) in the manifest assert THREE shapes via
//      the three branches in requireSuperuser:
//        a. Anonymous caller (no session, no header)               → 401
//        b. Signed-in non-superuser (session.accountId set, no
//           isSuperuser flag, no header)                            → 401
//        c. Caller presenting a wrong x-superuser-key header value  → 403
//
// Allow-list (DO NOT EXPAND without a comment explaining why):
//   None. Every superuser-gated route is in scope. The Founders Pass
//   admin routes (GET/POST/DELETE /admin/founders-ring) ALSO have
//   per-route happy-path coverage in tests/foundersRingCheckoutWebhook.test.js
//   — that complements, rather than replaces, this auth-only sweep.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  _stubServerDeps,
  _invokeHandler,
  _withUnreffedIntervals,
  _loadServerFresh,
  _withSuperuserPassword,
} = require('./fixtures/serverHarness');

// Explicit manifest of every superuser-gated (method, path) pair on the
// api router. Keep this list in sync with `requireSuperuser` mounts in
// src/web/server.js. The test below diffs the live router stack against
// this manifest so adding/removing a gate without updating this list
// fails the test deterministically — that is the core regression signal.
const EXPECTED_SUPERUSER_ROUTES = [
  ['put',    '/matches/:matchId/player-stats'],
  ['put',    '/matches/:matchId/match-details'],
  ['put',    '/matches/:matchId/draft'],
  ['post',   '/nicknames/:accountId'],
  ['post',   '/players/:accountId/discord'],
  ['get',    '/admin/discord-id-collisions'],
  ['post',   '/admin/discord-id-collisions/resolve'],
  ['post',   '/admin/discord-id-collisions/enforce-index'],
  ['post',   '/schedule'],
  ['delete', '/schedule/:id'],
  ['post',   '/admin/matches/:matchId/set-replay-path'],
  ['get',    '/admin/matches/replay-status'],
  ['get',    '/replays/stored'],
  ['post',   '/replays/:matchId/extend'],
  ['put',    '/seasons/:id/archive'],
  ['post',   '/seasons/:id/close'],
  ['post',   '/seasons/:id/announce'],
  ['delete', '/seasons/:id'],
  ['put',    '/matches/:matchId/winner'],
  ['get',    '/admin/steam/status'],
  ['post',   '/admin/steam/lobby/create'],
  ['post',   '/admin/steam/lobby/join'],
  ['post',   '/admin/steam/lobby/end'],
  ['post',   '/admin/steam/lobby/invite'],
  ['post',   '/admin/steam/lobby/start'],
  ['post',   '/admin/steam/friends/add-all'],
  ['post',   '/admin/recalculate-ratings'],
  ['post',   '/admin/reparse-replay/:matchId'],
  ['post',   '/admin/backup-db'],
  ['get',    '/admin/list-backups'],
  ['post',   '/admin/restore-backup'],
  ['delete', '/admin/delete-backup/:backup'],
  ['post',   '/admin/fix-nickname-account-ids'],
  ['post',   '/admin/reparse-all-replays'],
  ['get',    '/admin/reparse-all-status'],
  ['post',   '/admin/replays/set-all-permanent'],
  ['get',    '/admin/error-log'],
  ['delete', '/admin/error-log'],
  ['get',    '/admin/overview'],
  ['post',   '/admin/matches/manual'],
  ['post',   '/replay-inspect'],
  ['post',   '/admin/recompute-achievements'],
  ['post',   '/seasons/:id/tiers/ensure'],
  ['patch',  '/seasons/:id/tiers/:tierNumber'],
  ['post',   '/seasons/:id/tiers/place-all'],
  ['post',   '/seasons/:id/tiers/override'],
  ['post',   '/weekend-tournaments'],
  ['patch',  '/weekend-tournaments/:id'],
  ['post',   '/weekend-tournaments/:id/announce'],
  ['get',    '/admin/settings'],
  ['get',    '/admin/discord-autojoin-status'],
  ['get',    '/admin/discord-autojoin-history'],
  ['get',    '/admin/discord-autojoin-failures'],
  ['post',   '/admin/discord-autojoin-failures/clear'],
  ['get',    '/admin/stripe-status'],
  ['get',    '/admin/feature-flags'],
  ['post',   '/admin/feature-flags'],
  ['post',   '/admin/launch-season-10'],
  ['post',   '/admin/settings'],
  ['get',    '/admin/unregistered-players'],
  ['post',   '/admin/test-discord-notify'],
  ['post',   '/admin/test-dm'],
  ['post',   '/admin/test-rsvp-dm'],
  ['post',   '/admin/matches/:matchId/trigger-dms'],
  ['post',   '/patch-notes'],
  ['put',    '/patch-notes/:id'],
  ['delete', '/patch-notes/:id'],
  ['post',   '/ranks/sync'],
  ['post',   '/ranks/manual'],
  ['delete', '/ranks/:accountId'],
  ['get',    '/admin/signups'],
  ['patch',  '/admin/signups/:id'],
  ['patch',  '/inhouse/:id/config'],
  ['post',   '/inhouse'],
  ['post',   '/inhouse/:id/start-accept-phase'],
  ['post',   '/inhouse/:id/select-captains'],
  ['post',   '/inhouse/:id/server'],
  ['post',   '/admin/inhouse/:id/seed-bots'],
  ['post',   '/admin/inhouse/:id/clear-bots'],
  ['post',   '/admin/inhouse/:id/auto-draft'],
  ['post',   '/admin/inhouse/diag-provision'],
  ['post',   '/admin/inhouse/diag-cleanup/:id'],
  ['post',   '/admin/sync-community-nicknames'],
  ['post',   '/inhouse/:id/cancel'],
  ['post',   '/inhouse/:id/complete'],
  ['get',    '/dedicated-server/status'],
  ['post',   '/dedicated-server/fetch-replay'],
  ['post',   '/admin/season-pass/recompute'],
  ['post',   '/tournaments/:id/prize-split'],
  ['get',    '/admin/spotlight'],
  ['post',   '/admin/spotlight'],
  ['patch',  '/admin/spotlight/:id'],
  ['delete', '/admin/spotlight/:id'],
  ['get',    '/admin/gifts'],
  ['get',    '/admin/founders-ring-refunds'],
  ['post',   '/admin/founders-ring-refunds/:id/retry'],
  ['get',    '/admin/founders-ring'],
  ['post',   '/admin/founders-ring'],
  ['delete', '/admin/founders-ring/:accountId'],
  ['get',    '/admin/coaching/dashboard'],
  ['post',   '/admin/coaching/sanction'],
  ['post',   '/admin/coaching/dispute/:id/resolve'],
];

// Routes intentionally excluded from the per-route 401/403 probe sweep.
// Keep this empty unless a route legitimately cannot be exercised by the
// generic prober (e.g. a synchronous middleware that throws before
// requireSuperuser runs). Format: ['post', '/some/route'].
const PROBE_ALLOWLIST = [];

function _key(method, path) { return `${method.toUpperCase()} ${path}`; }

function _collectLiveSuperuserRoutes(router) {
  const out = [];
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const guarded = layer.route.stack.some(
      (sub) => sub.handle && sub.handle.name === 'requireSuperuser'
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

async function _probe(route, headers, session) {
  const req = {
    session: session || {},
    body: {},
    params: {},
    query: {},
    headers: headers || {},
    method: 'GET',
    url: route.path,
    get(name) { return (this.headers && this.headers[String(name).toLowerCase()]) || undefined; },
  };
  return _invokeHandler(route, req);
}

test('superuser admin routes: live set matches the expected manifest exactly', _withUnreffedIntervals(async () => {
  _stubServerDeps();
  const { createApiRouter } = _loadServerFresh();
  const router = createApiRouter({}, null);

  const live = new Set(_collectLiveSuperuserRoutes(router).map(([m, p]) => _key(m, p)));
  const expected = new Set(EXPECTED_SUPERUSER_ROUTES.map(([m, p]) => _key(m, p)));

  // Routes the manifest claims exist but the live router doesn't gate
  // with requireSuperuser anymore. THIS is the canonical signal that a
  // refactor silently dropped the auth gate from a route.
  const missingFromLive = [...expected].filter((k) => !live.has(k));
  // Routes the live router gates with requireSuperuser but the manifest
  // doesn't list. New admin routes need to be added to the manifest so
  // the auth-only sweep covers them.
  const missingFromManifest = [...live].filter((k) => !expected.has(k));

  assert.deepEqual(missingFromLive, [],
    `Routes lost their requireSuperuser gate (or were removed entirely). ` +
    `If intentional, delete them from EXPECTED_SUPERUSER_ROUTES. Otherwise restore the gate:\n  ` +
    missingFromLive.join('\n  '));
  assert.deepEqual(missingFromManifest, [],
    `New superuser-gated routes mounted but not added to EXPECTED_SUPERUSER_ROUTES. ` +
    `Add them so the auth-only sweep covers them:\n  ` +
    missingFromManifest.join('\n  '));
}));

test('superuser admin routes: every gated route rejects unauthorized callers (401/401/403)', _withUnreffedIntervals(_withSuperuserPassword('test-superuser-pw', async () => {
  _stubServerDeps();
  const { createApiRouter } = _loadServerFresh();
  const router = createApiRouter({}, null);

  const probeList = EXPECTED_SUPERUSER_ROUTES.filter(
    ([m, p]) => !PROBE_ALLOWLIST.some(([am, ap]) => am === m && ap === p)
  );

  for (const [method, path] of probeList) {
    const route = _findRoute(router, method, path);
    const label = _key(method, path);

    // (a) Anonymous: no session at all, no header → 401.
    const anon = await _probe(route, {}, {});
    assert.equal(anon.status, 401,
      `${label}: anonymous caller must be rejected with 401 (got ${anon.status})`);

    // (b) Signed-in non-superuser: session has accountId but no
    // isSuperuser flag, no header → 401 (still treated as no creds).
    const user = await _probe(route, {}, { accountId: 12345 });
    assert.equal(user.status, 401,
      `${label}: signed-in non-superuser must be rejected with 401 (got ${user.status})`);

    // (c) Caller presents an explicit wrong header value → 403.
    const wrong = await _probe(route, { 'x-superuser-key': 'definitely-wrong' }, {});
    assert.equal(wrong.status, 403,
      `${label}: wrong x-superuser-key must be rejected with 403 (got ${wrong.status})`);
  }
})));
