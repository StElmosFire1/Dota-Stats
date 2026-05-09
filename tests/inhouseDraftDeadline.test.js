// Task #180 — unit tests for the per-pick deadline / auto-pick logic added
// in Task #172.
//
// Covers two surfaces:
//
//   1) src/inhouse/autoStartTicker.js — the deadline-expiry sweep that
//      auto-picks the highest-MMR remaining player onto the team whose
//      turn it is in DRAFT_PICK_SEQUENCE.
//        • _scoreInhousePlayer prefers TS MMR for veterans and falls back
//          through leaderboard rank, rank tier, and the unranked floor.
//        • Sequence-team math is correct for every pickIdx 0..7.
//        • Auto-pick fires the same /draft-pick handler the captains hit
//          (proves the Task #168 auto-provision trigger still runs on the
//          8th pick because that side-effect lives inside /draft-pick).
//        • The ticker skips when SUPERUSER_PASSWORD is missing (since the
//          internal POST has no other way to authenticate).
//        • A stale deadline on an already-complete draft is cleared
//          rather than re-fired.
//
//   2) src/web/server.js /api/inhouse/:id/draft-pick + /draft-status —
//      the handlers that reset the per-pick deadline on every successful
//      pick, clear it when the draft completes, and surface
//      pickDeadlineAt + pickSeconds to the frontend.

const test  = require('node:test');
const assert = require('node:assert/strict');

// Required before requiring autoStartTicker — the ticker reads
// process.env.SUPERUSER_PASSWORD when the per-pick deadline expires, and
// the "skipped when missing" test deletes/restores it explicitly.
if (!process.env.SUPERUSER_PASSWORD) process.env.SUPERUSER_PASSWORD = 'test-superuser-key';

// ---------------------------------------------------------------------------
// Heavy-stub loader for src/web/server.js. We replace top-level requires
// (db, replay parser, stats service, groq, discord bot, web-push,
// connect-pg-simple) with no-op stand-ins, and we override global
// setInterval for the duration of the require so the two top-level reaping
// timers don't keep node:test's event loop alive.
// ---------------------------------------------------------------------------

function _stub(specifier, exports) {
  const resolved = require.resolve(specifier);
  delete require.cache[resolved];
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

let _serverApp = null;
let _serverDb  = null;
let _serverProvisioner = null;

function _loadServer({ db, provisioner }) {
  _serverDb = db;
  _serverProvisioner = provisioner;

  // Wipe anything that might have been cached from a prior load so this
  // call gets a fresh server bound to the new stubs.
  for (const id of Object.keys(require.cache)) {
    if (id.includes('/src/web/server.js') || id.includes('/src/inhouse/serverProvisioner')) {
      delete require.cache[id];
    }
  }

  _stub('../src/db', db);
  _stub('../src/replay/replayParser', { getReplayParser: () => ({ parserReady: false }) });
  _stub('../src/stats/statsService',  { getStatsService:  () => ({}) });
  _stub('../src/services/groqService', {
    generateChatResponse: async () => '', generateWeeklyRecapBlurb: async () => '',
  });
  _stub('../src/discord/bot', { getDiscordBot: () => ({
    isInLeagueGuild: async () => ({ inGuild: null, configured: false }),
    _notifyChannel: () => {},
  }) });
  // Force MemoryStore fallback so we don't try to hit the (stubbed) DB at
  // session-store init time.
  try {
    _stub('connect-pg-simple', () => function PgSession() { throw new Error('test stub: no pg session store'); });
  } catch {}
  // Stub serverProvisioner so /draft-pick's lazy require resolves to our
  // capture instead of the real module.
  const provPath = require.resolve('../src/inhouse/serverProvisioner');
  require.cache[provPath] = { id: provPath, filename: provPath, loaded: true, exports: provisioner };

  // Silence the two top-level setIntervals in src/web/server.js so the
  // test process can exit cleanly when node:test finishes.
  const _origSetInterval = global.setInterval;
  global.setInterval = () => ({ unref() {}, ref() {}, refresh() {} });
  let server;
  try {
    process.env.SUPERUSER_PASSWORD = process.env.SUPERUSER_PASSWORD || 'test-superuser-key';
    server = require('../src/web/server');
  } finally {
    global.setInterval = _origSetInterval;
  }

  // Build a tiny Express app and mount only the API router so the route
  // handlers under test run with the same code path production uses.
  const express = require('express');
  const app = express();
  app.use(express.json());
  // Inject a synthetic session per-request from req.headers['x-test-session'].
  app.use((req, _res, next) => {
    const hdr = req.headers['x-test-session'];
    if (hdr) {
      try { req.session = JSON.parse(hdr); } catch { req.session = {}; }
    } else {
      req.session = {};
    }
    next();
  });
  const router = server.createApiRouter({}, app);
  app.use('/api', router);
  _serverApp = app;
  return _serverApp;
}

// Helper: drive a request through the mounted express app via a real
// (ephemeral) HTTP listener so body-parser, Express's middleware chain,
// and the actual request/response stream semantics match production.
async function _request(app, method, url, { body, headers } = {}) {
  const http = require('http');
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    const opts = {
      method, hostname: '127.0.0.1', port, path: url,
      headers: { ...(headers || {}) },
    };
    let payload;
    if (body !== undefined) {
      payload = Buffer.from(JSON.stringify(body));
      opts.headers['content-type']   = 'application/json';
      opts.headers['content-length'] = String(payload.length);
    }
    return await new Promise((resolve, reject) => {
      const req = http.request(opts, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed;
          try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed });
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  } finally {
    await new Promise(r => server.close(r));
  }
}

// ---------------------------------------------------------------------------
// Stubs for the autoStartTicker tests.
// ---------------------------------------------------------------------------

function _makeTickerDb({ session, players }) {
  const updates = [];
  const fetched = { sessionPlayers: 0 };
  return {
    state: { session, players, updates, fetched },
    getPool: () => ({
      query: async (sql) => {
        const t = String(sql);
        if (t.includes("status = 'open'"))      return { rows: [] };
        if (t.includes("status = 'accepting'")) return { rows: [] };
        if (t.includes("status IN ('drafting','server_failed')")) return { rows: [session] };
        return { rows: [] };
      },
    }),
    pruneStaleInhousePlayers: async () => [],
    listInhousePlayerSessionTokens: async () => [],
    getInhouseSessionPlayers: async () => { fetched.sessionPlayers++; return players; },
    updateInhouseSession: async (id, fields) => { updates.push({ id, ...fields }); Object.assign(session, fields); return session; },
    dropInhousePlayerSeat: async () => {},
    resolveWinningCaptainMode: () => 'highest_rank',
  };
}

function _loadTicker(stubs) {
  const tickerPath = require.resolve('../src/inhouse/autoStartTicker.js');
  delete require.cache[tickerPath];
  // Stub the lazy-required serverProvisioner the recovery sweep uses so it
  // never reaches into the real module.
  const provPath = require.resolve('../src/inhouse/serverProvisioner');
  require.cache[provPath] = { id: provPath, filename: provPath, loaded: true,
    exports: stubs.provisioner || { provisionInhouseServer: async () => ({ ok: true, skipped: 'noop' }), isDraftComplete: () => false } };
  return require(tickerPath);
}

// The ticker uses dynamic `import('node-fetch')`, which bypasses
// require.cache, so we can't stub it the easy way. Spin up a tiny local
// HTTP capture server on a random port and have the ticker call into it
// via the basePort arg. Tests pass back the captured request objects.
function _startCaptureServer(captureCalls) {
  const http = require('http');
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body;
        try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
        captureCalls.push({ url: req.url, method: req.method, headers: req.headers, body });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ===========================================================================
// SCORING — _scoreInhousePlayer is module-private; we exercise it indirectly
// by feeding the ticker a roster and asserting which player it picked. The
// expected order is TS-MMR for ≥20-game veterans, then leaderboard rank,
// then rank tier, then the unranked floor.
// ===========================================================================

test('ticker auto-pick: scoring picks the highest-MMR remaining player (TS-MMR for veterans)', async (t) => {
  // 8 non-captain seats already drafted? No — we want pickIdx 0 (T1's
  // first pick), so two captains assigned + 0 non-captain picks placed.
  const session = {
    id: 11, status: 'drafting',
    captain1_account_id: 1, captain2_account_id: 2,
    draft_pick_deadline_at: new Date(Date.now() - 1000), // expired
    draft_pick_seconds: 30,
    match_password: null,
  };
  // Three undrafted candidates with mixed signals. p3 has 50 games + 28 TS
  // MMR ⇒ 2800 pts; p4 has 50 games + 30 TS MMR ⇒ 3000 pts; p5 has 50 +
  // 25 ⇒ 2500. Highest = p4.
  const players = [
    { account_id: 1, team: 1, status: 'drafted', trueskill_mmr: 30, games_played: 50 },
    { account_id: 2, team: 2, status: 'drafted', trueskill_mmr: 30, games_played: 50 },
    { account_id: 3, team: 0, status: 'registered', trueskill_mmr: 28, games_played: 50 },
    { account_id: 4, team: 0, status: 'registered', trueskill_mmr: 30, games_played: 50 },
    { account_id: 5, team: 0, status: 'registered', trueskill_mmr: 25, games_played: 50 },
  ];
  const calls = [];
  const { server, port } = await _startCaptureServer(calls);
  try {
    const ticker = _loadTicker({});
    const db = _makeTickerDb({ session, players });
    await ticker._tick(db, port);
    const draftPickCall = calls.find(c => c.url.includes('/draft-pick'));
    assert.ok(draftPickCall, 'ticker should POST to /draft-pick');
    assert.equal(draftPickCall.body.accountId, 4, 'should pick the highest-TS-MMR candidate');
    assert.equal(draftPickCall.body.team, 1, 'pickIdx 0 → team 1');
    assert.equal(draftPickCall.body.pickSource, 'auto_deadline');
    assert.equal(draftPickCall.headers['x-superuser-key'], 'test-superuser-key');
  } finally { server.close(); }
});

test('ticker auto-pick: rank-tier fallback is preferred over the unranked floor', async () => {
  const session = {
    id: 12, status: 'drafting',
    captain1_account_id: 1, captain2_account_id: 2,
    draft_pick_deadline_at: new Date(Date.now() - 1000),
    draft_pick_seconds: 30,
    match_password: null,
  };
  // p3 unranked w/ low TS games (floor: 5*100 - 1000 = -500).
  // p4 has dota_rank_tier 55 ⇒ 5000. p5 has rank_tier 41 ⇒ 3200.
  const players = [
    { account_id: 1, team: 1, status: 'drafted' },
    { account_id: 2, team: 2, status: 'drafted' },
    { account_id: 3, team: 0, status: 'registered', trueskill_mmr: 5, games_played: 0 },
    { account_id: 4, team: 0, status: 'registered', dota_rank_tier: 55 },
    { account_id: 5, team: 0, status: 'registered', dota_rank_tier: 41 },
  ];
  const calls = [];
  const { server, port } = await _startCaptureServer(calls);
  try {
    const ticker = _loadTicker({});
    const db = _makeTickerDb({ session, players });
    await ticker._tick(db, port);
    const draftPickCall = calls.find(c => c.url.includes('/draft-pick'));
    assert.ok(draftPickCall);
    assert.equal(draftPickCall.body.accountId, 4, 'rank tier 55 outscores rank tier 41 and the unranked floor');
  } finally { server.close(); }
});

// ===========================================================================
// SEQUENCE-TEAM MATH — DRAFT_PICK_SEQUENCE = [1,2,2,1,1,2,2,1].
// We feed the ticker an already-partially-drafted roster for each pickIdx
// 0..7 and assert it picks onto the right team.
// ===========================================================================

// Task #192 — pull the canonical sequence from the shared module so this
// test fails if the production order ever changes, instead of asserting
// against a stale local copy.
const { DRAFT_PICK_SEQUENCE: _PICK_TEAM_BY_IDX } = require('../src/inhouse/draftSequence');
for (let pickIdx = 0; pickIdx < 8; pickIdx++) {
  test(`ticker auto-pick: pickIdx=${pickIdx} → team ${_PICK_TEAM_BY_IDX[pickIdx]}`, async () => {
    const session = {
      id: 100 + pickIdx, status: 'drafting',
      captain1_account_id: 1, captain2_account_id: 2,
      draft_pick_deadline_at: new Date(Date.now() - 1000),
      draft_pick_seconds: 30,
      match_password: null,
    };
    // Build a roster where exactly `pickIdx` non-captain seats are drafted
    // already (alternating teams 1/2/1/2 — actual team doesn't matter for
    // counting), plus enough undrafted candidates for the next pick.
    const players = [
      { account_id: 1, team: 1, status: 'drafted' },
      { account_id: 2, team: 2, status: 'drafted' },
    ];
    for (let i = 0; i < pickIdx; i++) {
      players.push({ account_id: 100 + i, team: (i % 2) + 1, status: 'drafted', pick_order: i + 1 });
    }
    // One undrafted candidate so the pick has somewhere to go.
    players.push({ account_id: 999, team: 0, status: 'registered', trueskill_mmr: 30, games_played: 50 });

    const calls = [];
    const { server, port } = await _startCaptureServer(calls);
    try {
      const ticker = _loadTicker({});
      const db = _makeTickerDb({ session, players });
      await ticker._tick(db, port);
      const draftPickCall = calls.find(c => c.url.includes('/draft-pick'));
      assert.ok(draftPickCall, `expected a draft-pick POST for pickIdx=${pickIdx}`);
      assert.equal(draftPickCall.body.team, _PICK_TEAM_BY_IDX[pickIdx],
        `pickIdx=${pickIdx} must pick onto team ${_PICK_TEAM_BY_IDX[pickIdx]}`);
      assert.equal(draftPickCall.body.accountId, 999);
    } finally { server.close(); }
  });
}

// ===========================================================================
// TICKER GUARDS — no superuser key, deadline not expired, draft complete.
// ===========================================================================

test('ticker auto-pick: skipped when SUPERUSER_PASSWORD is missing', async () => {
  const saved = process.env.SUPERUSER_PASSWORD;
  delete process.env.SUPERUSER_PASSWORD;
  try {
    const session = {
      id: 13, status: 'drafting',
      captain1_account_id: 1, captain2_account_id: 2,
      draft_pick_deadline_at: new Date(Date.now() - 1000),
      draft_pick_seconds: 30,
      match_password: null,
    };
    const players = [
      { account_id: 1, team: 1, status: 'drafted' },
      { account_id: 2, team: 2, status: 'drafted' },
      { account_id: 3, team: 0, status: 'registered', trueskill_mmr: 30, games_played: 50 },
    ];
    const calls = [];
    const { server, port } = await _startCaptureServer(calls);
    try {
      const ticker = _loadTicker({});
      const db = _makeTickerDb({ session, players });
      await ticker._tick(db, port);
      assert.ok(!calls.some(c => c.url.includes('/draft-pick')),
        'ticker must NOT POST to /draft-pick when SUPERUSER_PASSWORD is missing');
    } finally { server.close(); }
  } finally {
    if (saved) process.env.SUPERUSER_PASSWORD = saved;
  }
});

test('ticker auto-pick: clears stale deadline on already-complete draft (no fetch)', async () => {
  const session = {
    id: 14, status: 'drafting',
    captain1_account_id: 1, captain2_account_id: 2,
    draft_pick_deadline_at: new Date(Date.now() - 1000),
    draft_pick_seconds: 30,
    match_password: null,
  };
  // 8 non-captain picks already placed → draft complete, but deadline left
  // dangling. Sweep should null it out.
  const players = [
    { account_id: 1, team: 1, status: 'drafted' },
    { account_id: 2, team: 2, status: 'drafted' },
  ];
  for (let i = 0; i < 8; i++) {
    players.push({ account_id: 100 + i, team: (i % 2) + 1, status: 'drafted', pick_order: i + 1 });
  }
  const calls = [];
  const { server, port } = await _startCaptureServer(calls);
  try {
    const ticker = _loadTicker({});
    const db = _makeTickerDb({ session, players });
    await ticker._tick(db, port);
    assert.ok(!calls.some(c => c.url.includes('/draft-pick')),
      'no auto-pick once the draft is complete');
    assert.ok(db.state.updates.some(u => u.draft_pick_deadline_at === null),
      'stale deadline should be cleared');
  } finally { server.close(); }
});

test('ticker auto-pick: does NOT fire while the deadline is still in the future', async () => {
  const session = {
    id: 15, status: 'drafting',
    captain1_account_id: 1, captain2_account_id: 2,
    draft_pick_deadline_at: new Date(Date.now() + 60_000), // future
    draft_pick_seconds: 30,
    match_password: null,
  };
  const players = [
    { account_id: 1, team: 1, status: 'drafted' },
    { account_id: 2, team: 2, status: 'drafted' },
    { account_id: 3, team: 0, status: 'registered', trueskill_mmr: 30, games_played: 50 },
  ];
  const calls = [];
  const { server, port } = await _startCaptureServer(calls);
  try {
    const ticker = _loadTicker({});
    const db = _makeTickerDb({ session, players });
    await ticker._tick(db, port);
    assert.ok(!calls.some(c => c.url.includes('/draft-pick')),
      'should not auto-pick before the deadline expires');
  } finally { server.close(); }
});

// ===========================================================================
// /draft-status — must surface pickDeadlineAt + pickSeconds.
// ===========================================================================

function _makeServerDb({ session, players }) {
  return {
    getPool: () => ({ query: async () => ({ rows: [], rowCount: 0 }) }),
    getInhouseSession: async () => ({ ...session }),
    getInhouseSessionPlayers: async () => players,
    updateInhouseSession: async (_id, fields) => { Object.assign(session, fields); return { ...session }; },
    // Below are referenced by other (unrelated) routes during router
    // construction; provide harmless no-ops so registration doesn't blow up.
    getDiscordIdByAccountId: async () => null,
    getDiscordAutoJoinFailureForAccount: async () => null,
  };
}

test('/draft-status: returns pickDeadlineAt and pickSeconds from the session row', async () => {
  const deadline = new Date(Date.now() + 30_000);
  const session = {
    id: 21, status: 'drafting',
    captain1_account_id: 1, captain2_account_id: 2,
    draft_pick_deadline_at: deadline,
    draft_pick_seconds: 45,
  };
  const players = [
    { account_id: 1, team: 1 }, { account_id: 2, team: 2 },
    { account_id: 3, team: 1, pick_order: 1 },
  ];
  const db = _makeServerDb({ session, players });
  const provisioner = {
    isDraftComplete: () => false,
    provisionInhouseServer: async () => ({ ok: true, skipped: 'noop' }),
  };
  const app = _loadServer({ db, provisioner });
  const r = await _request(app, 'GET', '/api/inhouse/21/draft-status');
  assert.equal(r.status, 200);
  assert.equal(r.body.pickSeconds, 45);
  assert.equal(new Date(r.body.pickDeadlineAt).getTime(), deadline.getTime());
  assert.equal(r.body.pickIdx, 1);
  assert.equal(r.body.currentPickerTeam, 2, 'pickIdx 1 → team 2');
  assert.equal(r.body.complete, false);
  assert.deepEqual(r.body.sequence, [1, 2, 2, 1, 1, 2, 2, 1]);
});

test('/draft-status: pickSeconds defaults to 30 when the session row has none', async () => {
  const session = {
    id: 22, status: 'drafting',
    captain1_account_id: 1, captain2_account_id: 2,
    draft_pick_deadline_at: null,
    draft_pick_seconds: null,
  };
  const players = [{ account_id: 1, team: 1 }, { account_id: 2, team: 2 }];
  const db = _makeServerDb({ session, players });
  const provisioner = {
    isDraftComplete: () => false,
    provisionInhouseServer: async () => ({ ok: true, skipped: 'noop' }),
  };
  const app = _loadServer({ db, provisioner });
  const r = await _request(app, 'GET', '/api/inhouse/22/draft-status');
  assert.equal(r.status, 200);
  assert.equal(r.body.pickSeconds, 30);
  assert.equal(r.body.pickDeadlineAt, null);
});

// ===========================================================================
// /draft-pick — deadline reset on every pick, cleared on completion, and
// the 8th pick still fires the Task #168 auto-provision.
// ===========================================================================

test('/draft-pick: resets the per-pick deadline after a successful (non-final) pick', async () => {
  // Mid-draft state: 2 captains + 3 non-captain picks already on board, so
  // this pick takes us to pickIdx=4 — still 4 picks from completion.
  const session = {
    id: 31, status: 'drafting',
    captain1_account_id: 1, captain2_account_id: 2,
    draft_pick_seconds: 25,
    draft_pick_deadline_at: new Date(Date.now() - 5_000),
  };
  const players = [
    { account_id: 1, team: 1 }, { account_id: 2, team: 2 },
    { account_id: 3, team: 1, pick_order: 1 },
    { account_id: 4, team: 2, pick_order: 2 },
    { account_id: 5, team: 2, pick_order: 3 },
    // 6 will be the player picked in this request
    { account_id: 6, team: 0, status: 'registered' },
    { account_id: 7, team: 0, status: 'registered' },
  ];
  const updateCalls = [];
  const db = {
    getPool: () => ({
      query: async (sql, params) => {
        const t = String(sql);
        if (t.startsWith('UPDATE inhouse_session_players')) {
          // simulate the atomic conditional pick succeeding
          const target = players.find(p => p.account_id === params[3]);
          if (!target) return { rowCount: 0, rows: [] };
          target.team = params[0]; target.pick_order = params[1]; target.status = 'drafted';
          return { rowCount: 1, rows: [target] };
        }
        return { rowCount: 0, rows: [] };
      },
    }),
    getInhouseSession: async () => ({ ...session }),
    getInhouseSessionPlayers: async () => players,
    updateInhouseSession: async (_id, fields) => { updateCalls.push(fields); Object.assign(session, fields); return { ...session }; },
    getDiscordIdByAccountId: async () => null,
    getDiscordAutoJoinFailureForAccount: async () => null,
  };
  const provisionCalls = [];
  const provisioner = {
    isDraftComplete: (_s, ps) => ps.filter(p => p.status === 'drafted' && p.account_id !== 1 && p.account_id !== 2).length >= 8,
    provisionInhouseServer: async (...args) => { provisionCalls.push(args); return { ok: true, skipped: 'noop' }; },
  };
  const app = _loadServer({ db, provisioner });
  const beforeMs = Date.now();
  const r = await _request(app, 'POST', '/api/inhouse/31/draft-pick', {
    body: { accountId: 6, team: 1, pickOrder: 4 },
    headers: { 'x-superuser-key': 'test-superuser-key' },
  });
  // Yield once so the post-response best-effort deadline write completes.
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  assert.equal(r.status, 200);
  const deadlineUpdate = updateCalls.find(u => 'draft_pick_deadline_at' in u);
  assert.ok(deadlineUpdate, 'a draft_pick_deadline_at update must be issued');
  assert.ok(deadlineUpdate.draft_pick_deadline_at instanceof Date,
    'mid-draft pick should set a fresh Date deadline (not null)');
  const elapsedMs = deadlineUpdate.draft_pick_deadline_at.getTime() - beforeMs;
  // 25s budget ± ~1s of test slop
  assert.ok(elapsedMs >= 24_000 && elapsedMs <= 26_000,
    `expected deadline to be ~25s ahead (got ${elapsedMs}ms ahead)`);
  // No auto-provision on a non-final pick
  assert.equal(provisionCalls.length, 0);
});

test('/draft-pick: clears the deadline AND fires the auto-provision trigger on the 8th (final) pick', async () => {
  // 7 non-captain picks already placed → this request is the 8th and
  // final pick (so isDraftComplete becomes true after the UPDATE).
  const session = {
    id: 32, status: 'drafting',
    captain1_account_id: 1, captain2_account_id: 2,
    draft_pick_seconds: 30,
    draft_pick_deadline_at: new Date(Date.now() + 10_000),
  };
  const players = [
    { account_id: 1, team: 1 }, { account_id: 2, team: 2 },
  ];
  for (let i = 0; i < 7; i++) {
    players.push({ account_id: 10 + i, team: (i % 2) + 1, pick_order: i + 1, status: 'drafted' });
  }
  // The 10th candidate (8th non-captain pick).
  players.push({ account_id: 99, team: 0, status: 'registered' });

  const updateCalls = [];
  const db = {
    getPool: () => ({
      query: async (sql, params) => {
        const t = String(sql);
        if (t.startsWith('UPDATE inhouse_session_players')) {
          const target = players.find(p => p.account_id === params[3]);
          if (!target) return { rowCount: 0, rows: [] };
          target.team = params[0]; target.pick_order = params[1]; target.status = 'drafted';
          return { rowCount: 1, rows: [target] };
        }
        return { rowCount: 0, rows: [] };
      },
    }),
    getInhouseSession: async () => ({ ...session }),
    getInhouseSessionPlayers: async () => players,
    updateInhouseSession: async (_id, fields) => { updateCalls.push(fields); Object.assign(session, fields); return { ...session }; },
    getDiscordIdByAccountId: async () => null,
    getDiscordAutoJoinFailureForAccount: async () => null,
  };

  const provisionCalls = [];
  const provisioner = {
    isDraftComplete: (_s, ps) => ps.filter(p => p.status === 'drafted' && p.account_id !== 1 && p.account_id !== 2).length >= 8,
    provisionInhouseServer: async (...args) => { provisionCalls.push(args); return { ok: true }; },
  };
  const app = _loadServer({ db, provisioner });
  const r = await _request(app, 'POST', '/api/inhouse/32/draft-pick', {
    body: { accountId: 99, team: 1, pickOrder: 4 },
    headers: { 'x-superuser-key': 'test-superuser-key' },
  });
  // Allow the post-response best-effort blocks to settle.
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  assert.equal(r.status, 200);
  const deadlineUpdate = updateCalls.find(u => 'draft_pick_deadline_at' in u);
  assert.ok(deadlineUpdate, 'a draft_pick_deadline_at update must be issued');
  assert.equal(deadlineUpdate.draft_pick_deadline_at, null,
    'final pick should clear the deadline (set to null)');
  assert.equal(provisionCalls.length, 1,
    'final pick must fire the Task #168 auto-provision trigger exactly once');
  assert.equal(provisionCalls[0][1].trigger, 'auto_draft_complete');
});
