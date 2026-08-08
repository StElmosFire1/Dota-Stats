// Task #899 — regression coverage for the Pro-only CSV match-history export
// (Task #14). Two failure shapes are guarded here:
//
//   1. Server side: GET /players/:id/matches/export.csv is mounted with
//      requirePro('csv_export'). A refactor that drops the gate (or breaks
//      the handler) would silently expose the export to free users or break
//      the download for Pro members. We boot src/web/server.js with the
//      shared harness (no Postgres/Stripe/Discord/Steam) and drive the full
//      route stack — middleware included — asserting:
//        - anon caller            → 402 paywall (feature: csv_export)
//        - signed-in free user    → 402 paywall
//        - Pro member (own id)    → 200 with a well-formed CSV (header + rows)
//        - Pro member (other id)  → 403 (own-history-only rule)
//        - superuser session      → 200 CSV without Pro membership
//
//   2. Frontend side: web/src/pages/PlayerProfile.jsx must keep the UI gate —
//      the live "Download CSV" button only behind `viewerIsPro`, and the
//      signed-in non-Pro owner sees the "Pro only" hint linking to /pro.
//      There is no React DOM test rig in this repo, so this is a source-level
//      tripwire in the style of scripts/check-community-paywall-source.js:
//      it fails if the gate expression or the hint disappears.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  _stubServerDeps,
  _invokeHandler,
  _withUnreffedIntervals,
  _loadServerFresh,
} = require('./fixtures/serverHarness');

const ROUTE_PATH = '/players/:id/matches/export.csv';

function _findRoute(router, method, routePath) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path === routePath && layer.route.methods[method]) {
      return layer.route;
    }
  }
  return null;
}

// Feature flag store: pro_tier ON so requirePro actually gates (the harness
// proxy would otherwise return null → gate off → everything passes).
const FLAGS = { pro_tier: { key: 'pro_tier', state: 'on' } };

const MATCH_ROWS = [
  {
    match_id: 9001, date: '2026-08-01T10:00:00Z', duration: 2400,
    radiant_win: true, player_slot: 2, hero: 'juggernaut',
    kills: 10, deaths: 2, assists: 8, gpm: 620, xpm: 700,
    last_hits: 250, denies: 12, hero_damage: 30000, tower_damage: 5000,
    hero_healing: 0, net_worth: 25000, level: 25,
  },
  {
    // Value containing a comma exercises the CSV escaping path.
    match_id: 9002, date: '2026-08-02T10:00:00Z', duration: 1800,
    radiant_win: false, player_slot: 130, hero: 'io, the wisp',
    kills: 1, deaths: 5, assists: 20, gpm: 300, xpm: 350,
    last_hits: 40, denies: 2, hero_damage: 8000, tower_damage: 100,
    hero_healing: 12000, net_worth: 9000, level: 18,
  },
];

function _boot({ proAccountIds = [] } = {}) {
  _stubServerDeps({
    getFeatureFlag: async (key) => FLAGS[key] || null,
    isProMember: async (accountId) => proAccountIds.map(String).includes(String(accountId)),
    getMatchHistory: async () => MATCH_ROWS,
  });
  const { createApiRouter } = _loadServerFresh();
  const router = createApiRouter({}, null);
  const route = _findRoute(router, 'get', ROUTE_PATH);
  assert.ok(route, `route GET ${ROUTE_PATH} must exist on the api router`);
  // The requirePro('csv_export') middleware must still be mounted ahead of
  // the handler — a stack of length 1 means the gate was dropped.
  assert.ok(route.stack.length >= 2,
    'export.csv route must have the requirePro middleware in its stack');
  return route;
}

function _req({ accountId, isSuperuser, paramsId } = {}) {
  return {
    method: 'GET',
    headers: {},
    params: { id: paramsId != null ? String(paramsId) : (accountId != null ? String(accountId) : '111') },
    query: {},
    session: accountId != null || isSuperuser
      ? { accountId: accountId != null ? String(accountId) : undefined, isSuperuser: Boolean(isSuperuser) }
      : undefined,
  };
}

const EXPECTED_HEADER = [
  'match_id', 'date', 'duration_seconds', 'won', 'hero', 'kills', 'deaths', 'assists',
  'gpm', 'xpm', 'last_hits', 'denies', 'hero_damage', 'tower_damage', 'hero_healing',
  'net_worth', 'level',
].join(',');

function _assertWellFormedCsv(body) {
  assert.equal(typeof body, 'string', 'CSV response should be a string body');
  const lines = body.split('\n');
  assert.equal(lines[0], EXPECTED_HEADER, 'CSV header row must list all columns');
  assert.equal(lines.length, 1 + MATCH_ROWS.length, 'one CSV row per match');
  // Row 1: win derived from player_slot < 128 && radiant_win.
  const r1 = lines[1].split(',');
  assert.equal(r1[0], '9001');
  assert.equal(r1[3], 'true', 'radiant player on radiant win → won=true');
  // Row 2: comma-containing hero name must be quoted (well-formed escaping).
  assert.match(lines[2], /"io, the wisp"/, 'comma values must be CSV-quoted');
  assert.match(lines[2], /^9002,/);
}

test('export.csv → 402 paywall for anonymous callers', _withUnreffedIntervals(async () => {
  const route = _boot();
  const { status, body } = await _invokeHandler(route, _req({}));
  assert.equal(status, 402);
  assert.equal(body.paywall, true);
  assert.equal(body.feature, 'csv_export');
  assert.equal(body.signed_in, false);
}));

test('export.csv → 402 paywall for signed-in free (non-Pro) users', _withUnreffedIntervals(async () => {
  const route = _boot({ proAccountIds: [] });
  const { status, body } = await _invokeHandler(route, _req({ accountId: 222 }));
  assert.equal(status, 402);
  assert.equal(body.paywall, true);
  assert.equal(body.feature, 'csv_export');
  assert.equal(body.signed_in, true);
}));

test('export.csv → well-formed CSV for a Pro member exporting their own history', _withUnreffedIntervals(async () => {
  const route = _boot({ proAccountIds: [333] });
  const { status, body } = await _invokeHandler(route, _req({ accountId: 333 }));
  assert.equal(status, 200);
  _assertWellFormedCsv(body);
}));

test('export.csv → 403 when a Pro member exports someone else\'s history', _withUnreffedIntervals(async () => {
  const route = _boot({ proAccountIds: [444] });
  const { status, body } = await _invokeHandler(route, _req({ accountId: 444, paramsId: 555 }));
  assert.equal(status, 403);
  assert.match(body.error, /own match history/i);
}));

test('export.csv → CSV for a superuser session without Pro membership', _withUnreffedIntervals(async () => {
  const route = _boot({ proAccountIds: [] });
  const { status, body } = await _invokeHandler(route, _req({ accountId: 666, isSuperuser: true }));
  assert.equal(status, 200);
  _assertWellFormedCsv(body);
}));

// ── Frontend gate tripwire (source-level) ───────────────────────────────────

test('PlayerProfile keeps the CSV button UI-gated on viewerIsPro with a Pro-only hint', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'web', 'src', 'pages', 'PlayerProfile.jsx'), 'utf8');

  // The viewerIsPro derivation must still come from useProStatus (+ superuser).
  assert.match(src, /useProStatus/, 'PlayerProfile must use useProStatus');
  assert.match(src, /const viewerIsPro = .*is_pro/,
    'viewerIsPro must derive from proStatus.is_pro');

  // The live Download CSV button must sit inside the viewerIsPro branch:
  // between `viewerIsPro ? (` and the matching `) : ` there must be the
  // fetch of export.csv, and the non-Pro branch must render the Pro-only hint.
  const gateIdx = src.indexOf('{viewerIsPro ? (');
  assert.ok(gateIdx !== -1, 'CSV button must be wrapped in a viewerIsPro ternary');
  const after = src.slice(gateIdx);
  const elseIdx = after.indexOf(') : isOwnProfile ? (');
  assert.ok(elseIdx !== -1, 'non-Pro owners must get the fallback branch');
  const proBranch = after.slice(0, elseIdx);
  assert.match(proBranch, /matches\/export\.csv/,
    'live Download CSV fetch must be inside the viewerIsPro branch');
  assert.match(proBranch, /Download CSV/);
  const nullIdx = after.indexOf(') : null}');
  assert.ok(nullIdx > elseIdx, 'non-owner non-Pro viewers must see nothing');
  const hintBranch = after.slice(elseIdx, nullIdx);
  assert.match(hintBranch, /Pro only/,
    'signed-in non-Pro owner must see the "Pro only" hint');
  assert.match(hintBranch, /to="\/pro"/, 'Pro-only hint must link to /pro');
  // The live fetch must NOT appear in the hint branch.
  assert.doesNotMatch(hintBranch, /export\.csv/,
    'the hint branch must not contain a live export fetch');
});
