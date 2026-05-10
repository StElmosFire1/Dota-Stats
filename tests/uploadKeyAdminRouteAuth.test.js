// Task #275 — auth-only sweep across every upload/admin-key-gated route
// mounted in src/web/server.js.
//
// This test is the lower-privilege twin of tests/superuserAdminRouteAuth.js
// (Task #267). The companion middleware `authMiddleware` (the
// upload/admin-key gate) protects a separate, lower-privilege set of
// routes (replay upload, season/tournament admin, patch-notes, etc.)
// and has the same elevation-of-privilege failure shape: a refactor
// could silently drop the gate from a route and the deploy gates would
// stay green.
//
// What this test does:
//   1. Boot src/web/server.js with the shared harness so createApiRouter()
//      is available without touching Postgres / Stripe / Discord / Steam.
//   2. Compare the live router stack against the EXPECTED_UPLOAD_KEY_ROUTES
//      manifest below. The two sets must match exactly:
//        - Routes that LOST `authMiddleware` since the manifest was
//          checked in disappear from the live set → the diff trips and
//          the test fails deterministically (not just when the floor
//          count drops).
//        - Routes that GAINED `authMiddleware` (new admin routes added
//          without updating the manifest) appear in the live set but
//          not in the manifest → the diff also trips, forcing the
//          author to consciously add them to the manifest.
//   3. For every (method, path) in the manifest, locate the layer
//      whose stack actually contains `authMiddleware` (some paths are
//      registered twice — see PATCH_NOTES_DUPLICATE_NOTE below — so
//      finding the right layer matters) and assert TWO shapes:
//        a. Anonymous caller (no session, no header)               → 403
//        b. Caller presenting a wrong x-upload-key header value    → 403
//      The middleware itself does not split 401/403 the way
//      requireSuperuser does — both shapes go to a single 403
//      "Invalid upload key" branch — so we assert 403 in both cases
//      to lock in the documented behavior.
//
// Floor assertion: a separate assert keeps the live count above a
// hard floor so a bulk-removal of the gate from many routes at once
// cannot pass even if the manifest is "helpfully" pruned in the same
// commit. The floor is intentionally below the current count so the
// list can shrink legitimately without touching this constant; the
// real regression signal is the manifest diff.
//
// PATCH_NOTES_DUPLICATE_NOTE: src/web/server.js currently registers
// `POST /patch-notes` and `PUT /patch-notes/:id` twice — once with
// `requireSuperuser` (the canonical, superuser-gated layer covered by
// tests/superuserAdminRouteAuth.test.js) and once with
// `authMiddleware` (a duplicate, lower-privilege layer that is
// effectively shadowed at runtime because the superuser layer is
// registered first). Both layers exist in the router stack, so this
// test still walks and probes the authMiddleware layer to keep the
// auth-only sweep complete. If the duplicate is ever removed, drop
// those two entries from EXPECTED_UPLOAD_KEY_ROUTES — the diff will
// tell you exactly which ones to remove.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  _stubServerDeps,
  _invokeHandler,
  _withUnreffedIntervals,
  _loadServerFresh,
} = require('./fixtures/serverHarness');

// Explicit manifest of every authMiddleware-gated (method, path) pair
// on the api router. Keep this list in sync with `authMiddleware`
// mounts in src/web/server.js. The test below diffs the live router
// stack against this manifest so adding/removing a gate without
// updating this list fails the test deterministically — that is the
// core regression signal.
const EXPECTED_UPLOAD_KEY_ROUTES = [
  ['post',   '/matches/:matchId/notes'],
  ['delete', '/notes/:noteId'],
  ['delete', '/matches/:matchId'],
  ['get',    '/admin/heroes/tier-overrides'],
  ['post',   '/admin/heroes/tier-overrides'],
  ['delete', '/admin/heroes/tier-overrides/:heroId'],
  ['post',   '/seasons'],
  ['put',    '/seasons/:id/activate'],
  ['put',    '/seasons/none/activate'],
  ['put',    '/seasons/:id/buyin-amount'],
  ['put',    '/seasons/:id/end-conditions'],
  ['post',   '/seasons/:id/payouts'],
  ['delete', '/seasons/:id/payouts/:payoutId'],
  ['put',    '/seasons/:id/payouts/:payoutId/winner'],
  ['put',    '/matches/:matchId/meta'],
  ['post',   '/matches/:matchId/clear-hash'],
  ['put',    '/matches/:matchId/position'],
  ['post',   '/upload/init'],
  ['post',   '/upload/chunk/:jobId'],
  ['post',   '/upload/complete/:jobId'],
  ['post',   '/generate-recap'],
  ['post',   '/tournaments'],
  ['patch',  '/tournaments/:id/status'],
  ['delete', '/tournaments/:id'],
  ['post',   '/tournaments/:id/participants'],
  ['delete', '/tournaments/:id/participants/:accountId'],
  ['post',   '/tournaments/:id/generate'],
  ['post',   '/tournament-matches/:matchId/winner'],
  ['delete', '/tournament-matches/:matchId/winner'],
  ['post',   '/tournament-matches/:matchId/link'],
  ['post',   '/tournaments/:id/reseed'],
  ['get',    '/admin/duplicate-matches'],
  // Duplicate registrations — see PATCH_NOTES_DUPLICATE_NOTE above.
  ['post',   '/patch-notes'],
  ['put',    '/patch-notes/:id'],
];

// Hard floor on the live route count. Set well below the current
// length of EXPECTED_UPLOAD_KEY_ROUTES so legitimate route removals
// don't trip the floor — its job is to catch a bulk-removal of the
// gate, not normal churn. If this is ever hit, do NOT just lower the
// floor: confirm whether the gate was intentionally dropped from
// many routes at once.
const UPLOAD_KEY_ROUTE_FLOOR = 25;

// Routes intentionally excluded from the per-route 403 probe sweep.
// Keep this empty unless a route legitimately cannot be exercised by
// the generic prober (e.g. a synchronous middleware that throws
// before authMiddleware runs). Format: ['post', '/some/route'].
const PROBE_ALLOWLIST = [];

function _key(method, path) { return `${method.toUpperCase()} ${path}`; }

function _hasAuthMiddleware(layer) {
  return layer.route && layer.route.stack.some(
    (sub) => sub.handle && sub.handle.name === 'authMiddleware'
  );
}

function _collectLiveUploadKeyLayers(router) {
  // Returns [{method, path, route}] entries — one per matching layer,
  // so duplicate registrations are surfaced rather than silently
  // collapsed by the diff.
  const out = [];
  for (const layer of router.stack) {
    if (!_hasAuthMiddleware(layer)) continue;
    for (const method of Object.keys(layer.route.methods)) {
      out.push({ method, path: layer.route.path, route: layer.route });
    }
  }
  return out;
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

function _withUploadKey(uploadKey, fn) {
  return async (...args) => {
    const prev = process.env.UPLOAD_KEY;
    process.env.UPLOAD_KEY = uploadKey;
    try { return await fn(...args); }
    finally {
      if (prev === undefined) delete process.env.UPLOAD_KEY;
      else process.env.UPLOAD_KEY = prev;
    }
  };
}

test('upload-key admin routes: live set matches the expected manifest exactly', _withUnreffedIntervals(async () => {
  _stubServerDeps();
  const { createApiRouter } = _loadServerFresh();
  const router = createApiRouter({}, null);

  const liveEntries = _collectLiveUploadKeyLayers(router);
  const liveKeys = liveEntries.map((e) => _key(e.method, e.path)).sort();
  const expectedKeys = EXPECTED_UPLOAD_KEY_ROUTES.map(([m, p]) => _key(m, p)).sort();

  // Floor check: catches a bulk-removal of the gate from many routes
  // at once, even if someone "helpfully" pruned the manifest in the
  // same commit. Counts duplicate registrations because each is a
  // separate router-stack layer that loses the gate independently.
  assert.ok(
    liveEntries.length >= UPLOAD_KEY_ROUTE_FLOOR,
    `Only ${liveEntries.length} authMiddleware-gated route layers found ` +
    `(floor: ${UPLOAD_KEY_ROUTE_FLOOR}). A bulk gate-removal is suspected — ` +
    `confirm intent before lowering the floor.`
  );

  // Routes the manifest claims exist but the live router doesn't
  // gate with authMiddleware anymore. THIS is the canonical signal
  // that a refactor silently dropped the auth gate from a route.
  const missingFromLive = expectedKeys.filter((k) => !liveKeys.includes(k));
  // Routes the live router gates with authMiddleware but the
  // manifest doesn't list. New admin routes need to be added to the
  // manifest so the auth-only sweep covers them.
  const missingFromManifest = liveKeys.filter((k) => !expectedKeys.includes(k));

  assert.deepEqual(missingFromLive, [],
    `Routes lost their authMiddleware gate (or were removed entirely). ` +
    `If intentional, delete them from EXPECTED_UPLOAD_KEY_ROUTES. Otherwise restore the gate:\n  ` +
    missingFromLive.join('\n  '));
  assert.deepEqual(missingFromManifest, [],
    `New authMiddleware-gated routes mounted but not added to EXPECTED_UPLOAD_KEY_ROUTES. ` +
    `Add them so the auth-only sweep covers them:\n  ` +
    missingFromManifest.join('\n  '));
}));

test('upload-key admin routes: every gated route rejects unauthorized callers (403/403)', _withUnreffedIntervals(_withUploadKey('test-upload-key', async () => {
  _stubServerDeps();
  const { createApiRouter } = _loadServerFresh();
  const router = createApiRouter({}, null);

  const liveEntries = _collectLiveUploadKeyLayers(router);
  const probeList = liveEntries.filter(
    (e) => !PROBE_ALLOWLIST.some(([am, ap]) => am === e.method && ap === e.path)
  );

  for (const entry of probeList) {
    const label = _key(entry.method, entry.path);

    // (a) Anonymous: no session at all, no header → 403.
    // authMiddleware does not split 401/403; the absent-credential
    // branch and the wrong-credential branch both return 403
    // "Invalid upload key". We assert 403 to lock in that contract.
    const anon = await _probe(entry.route, {}, {});
    assert.equal(anon.status, 403,
      `${label}: anonymous caller must be rejected with 403 (got ${anon.status})`);

    // (b) Caller presents an explicit wrong header value → 403.
    const wrong = await _probe(entry.route, { 'x-upload-key': 'definitely-wrong' }, {});
    assert.equal(wrong.status, 403,
      `${label}: wrong x-upload-key must be rejected with 403 (got ${wrong.status})`);

    // (c) Same wrong-credential shape via the alternate header
    // (`x-superuser-key`) — authMiddleware accepts either header,
    // so a wrong value via either route must reject identically.
    const wrongAlt = await _probe(entry.route, { 'x-superuser-key': 'definitely-wrong' }, {});
    assert.equal(wrongAlt.status, 403,
      `${label}: wrong x-superuser-key must be rejected with 403 (got ${wrongAlt.status})`);
  }
})));
