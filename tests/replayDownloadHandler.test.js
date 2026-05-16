// Task #309 — route test for the full-edition replay-download endpoint
// (`_replayDownloadHandler` in src/web/server.js, mounted at both
// `/replays/:matchId/download` and `/matches/:matchId/replay`).
//
// Task #304 pinned the equivalent community-edition handler. The full
// edition's handler has its own branching logic (DB lookup, file-on-disk
// check, the Pro-paywall gate the community edition deliberately does NOT
// have, plus a Pro-only daily quota check). None of it had route-level
// coverage, so a silent refactor — e.g. dropping the Pro gate, or
// breaking the happy-path stream — would not trip a test.
//
// This test pins four shapes:
//   1. DB returns no row + no remote replay  → 404
//   2. DB row points at a missing file + no remote replay  → 404
//   3. Non-Pro signed-in caller  → 402 paywall shape
//   4. Pro caller happy path  → 200, Content-Disposition + Content-Type
//      headers, and the exact bytes of the stored .dem are streamed
//
// Mirrors the harness pattern used by tests/superuserAdminRouteAuth.test.js
// (Task #267) and tests/communityReplayDownloadHandler.test.js (Task #304).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  stubModule,
  _stubServerDeps,
  _withUnreffedIntervals,
  _loadServerFresh,
} = require('./fixtures/serverHarness');

function findReplayLayers(router) {
  return router.stack.filter((layer) => {
    if (!layer.route) return false;
    const p = layer.route.path;
    return p === '/replays/:matchId/download' || p === '/matches/:matchId/replay';
  });
}

function makeJsonRes() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  const res = {
    headersSent: false,
    statusCode,
    status(code) { statusCode = code; res.statusCode = code; return res; },
    json(obj) { body = obj; res.headersSent = true; return res; },
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    getHeader(name) { return headers[name.toLowerCase()]; },
    set() { return res; },
    send(obj) { body = obj; res.headersSent = true; return res; },
    on() { return res; },
    once() { return res; },
    emit() { return res; },
    end() { res.headersSent = true; },
    write() {},
  };
  Object.defineProperty(res, '_body', { get: () => body });
  Object.defineProperty(res, '_status', { get: () => statusCode });
  Object.defineProperty(res, '_headers', { get: () => headers });
  return res;
}

async function invokeReplayHandler(layer, req) {
  // The full-edition route mounts the handler directly (no preceding
  // middleware on the route's own stack — the Pro/auth check is inline
  // inside the handler). Invoke the single layer and wait briefly so any
  // backgrounded .catch chain has a chance to settle.
  const stack = layer.route.stack;
  assert.equal(stack.length, 1,
    `Expected exactly one handler on ${layer.route.path} ` +
    `(the inline Pro/auth gate is part of the handler body, not a middleware). ` +
    `Found ${stack.length}: ${stack.map(s => s.name || '<anon>').join(', ')}.`);
  const res = makeJsonRes();
  await new Promise((resolve, reject) => {
    try {
      const ret = stack[0].handle(req, res, (err) => { if (err) reject(err); else resolve(); });
      if (ret && typeof ret.then === 'function') {
        ret.then(() => setTimeout(resolve, 20), reject);
      } else {
        setTimeout(resolve, 20);
      }
    } catch (err) { reject(err); }
  });
  return res;
}

function buildRouter(dbOverrides) {
  // Re-stub magazineV3 with a non-zero daily limit so the inline Pro
  // quota check does not falsely 429 a Pro caller in the happy path.
  // (The default harness stub sets REPLAY_RATE_LIMIT_PER_DAY: 0.)
  _stubServerDeps(dbOverrides);
  stubModule('../../src/monetization/magazineV3', {
    mountMagazineV3Routes: () => {},
    handleStripeWebhookPurpose: async () => null,
    startWeeklyReportWorker: () => {},
    REPLAY_RATE_LIMIT_PER_DAY: 100,
  });
  const { createApiRouter } = _loadServerFresh();
  return createApiRouter({}, null);
}

test('full-edition replay-download handler', async (t) => {
  await t.test('returns 404 when DB has no row and no remote replay', _withUnreffedIntervals(async () => {
    const router = buildRouter({
      isProMember: async () => true,           // skip paywall to exercise the 404 branch
      getReplayFilePath: async () => null,
      getReplayPath: async () => null,
      magV3: {
        countReplayDownloadsLast24h: async () => 0,
        logReplayDownload: async () => {},
      },
    });
    const layers = findReplayLayers(router);
    assert.equal(layers.length, 2,
      'Expected both /replays/:matchId/download and /matches/:matchId/replay to be mounted');

    for (const layer of layers) {
      const res = await invokeReplayHandler(layer, {
        params: { matchId: '12345' },
        headers: {},
        session: { accountId: 999 },
      });
      assert.equal(res._status, 404,
        `${layer.route.path} should 404 when DB returns null and no remote archive row exists`);
      assert.match(res._body.error, /No replay stored/i,
        `${layer.route.path} should surface a "No replay stored" message`);
    }
  }));

  await t.test('returns 404 when DB row points at a missing file and no remote replay', _withUnreffedIntervals(async () => {
    const ghostPath = path.join(os.tmpdir(), `full-replay-ghost-${Date.now()}.dem`);
    if (fs.existsSync(ghostPath)) fs.unlinkSync(ghostPath);

    const router = buildRouter({
      isProMember: async () => true,
      getReplayFilePath: async () => ({ replay_file_path: ghostPath }),
      getReplayPath: async () => null,
      magV3: {
        countReplayDownloadsLast24h: async () => 0,
        logReplayDownload: async () => {},
      },
    });
    const layers = findReplayLayers(router);

    for (const layer of layers) {
      const res = await invokeReplayHandler(layer, {
        params: { matchId: '12345' },
        headers: {},
        session: { accountId: 999 },
      });
      assert.equal(res._status, 404,
        `${layer.route.path} should 404 when local file is missing on disk and no remote replay is recorded`);
      assert.match(res._body.error, /No replay stored/i,
        `${layer.route.path} should surface a "No replay stored" message after fall-through`);
    }
  }));

  await t.test('non-Pro signed-in caller is rejected with 402 paywall', _withUnreffedIntervals(async () => {
    const router = buildRouter({
      isProMember: async () => false,
      // Even if a row exists, the paywall must fire before any DB lookup
      // for the actual file path. Stub it anyway as a tripwire — if the
      // handler ever queries it for a non-Pro caller, the paywall has
      // been silently dropped.
      getReplayFilePath: async () => {
        throw new Error(
          'paywall regression: getReplayFilePath() must NOT be called for a non-Pro caller — ' +
          'the 402 gate is supposed to short-circuit before any file lookup'
        );
      },
      getReplayPath: async () => {
        throw new Error(
          'paywall regression: getReplayPath() must NOT be called for a non-Pro caller'
        );
      },
    });
    const layers = findReplayLayers(router);

    for (const layer of layers) {
      const res = await invokeReplayHandler(layer, {
        params: { matchId: '12345' },
        headers: {},
        session: { accountId: 777 },
      });
      assert.equal(res._status, 402,
        `${layer.route.path} should return 402 for a non-Pro signed-in caller`);
      assert.equal(res._body.paywall, true,
        `${layer.route.path} should set paywall: true in the 402 body`);
      assert.equal(res._body.feature, 'replay_download',
        `${layer.route.path} should identify the gated feature as "replay_download"`);
      assert.equal(res._body.signed_in, true,
        `${layer.route.path} should report signed_in: true when the caller has an account session`);
    }
  }));

  await t.test('Pro caller happy path streams the file with attachment headers', _withUnreffedIntervals(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'full-replay-happy-'));
    const replayPath = path.join(tmpDir, 'match_12345.dem');
    const payload = Buffer.from('FAKE-FULL-EDITION-DEM-' + 'y'.repeat(64));
    fs.writeFileSync(replayPath, payload);

    const logCalls = [];
    const router = buildRouter({
      isProMember: async () => true,
      getReplayFilePath: async (matchId) => {
        assert.equal(matchId, '12345',
          'handler should pass req.params.matchId straight to db.getReplayFilePath');
        return { replay_file_path: replayPath };
      },
      getReplayPath: async () => null,
      magV3: {
        countReplayDownloadsLast24h: async () => 0,
        logReplayDownload: async (...args) => { logCalls.push(args); },
      },
    });
    const layers = findReplayLayers(router);

    for (const layer of layers) {
      const { Writable } = require('stream');
      const chunks = [];
      const writable = new Writable({
        write(chunk, _enc, cb) { chunks.push(Buffer.from(chunk)); cb(); },
      });
      const headers = {};
      let statusCode = 200;
      writable.statusCode = statusCode;
      writable.status = (code) => { statusCode = code; writable.statusCode = code; return writable; };
      writable.json = (obj) => { writable._body = obj; return writable; };
      writable.setHeader = (k, v) => { headers[k.toLowerCase()] = v; };
      writable.getHeader = (k) => headers[k.toLowerCase()];
      writable.headersSent = false;

      await new Promise((resolve, reject) => {
        writable.on('finish', resolve);
        writable.on('error', reject);
        try {
          const ret = layer.route.stack[0].handle(
            {
              params: { matchId: '12345' },
              headers: {},
              session: { accountId: 555 },
            },
            writable,
            (err) => { if (err) reject(err); else resolve(); }
          );
          if (ret && typeof ret.then === 'function') ret.catch(reject);
        } catch (err) { reject(err); }
      });

      assert.equal(statusCode, 200,
        `${layer.route.path} should leave default 200 status on happy path`);
      assert.equal(headers['content-type'], 'application/octet-stream',
        `${layer.route.path} should set Content-Type: application/octet-stream`);
      assert.equal(headers['content-disposition'], `attachment; filename="match_12345.dem"`,
        `${layer.route.path} should set Content-Disposition with the basename of the stored file`);
      assert.deepEqual(Buffer.concat(chunks), payload,
        `${layer.route.path} should stream the exact bytes of the stored .dem file`);
    }

    // Pro callers get their downloads logged for the daily-quota counter.
    // We expect at least one log per mounted route (two total). Don't
    // pin the exact count — backgrounded .catch() chains can race — but
    // assert the function was reached for the Pro happy path.
    assert.ok(logCalls.length >= 1,
      'magV3.logReplayDownload should be called for Pro callers on the happy path');

    try { fs.unlinkSync(replayPath); } catch (_) {}
    try { fs.rmdirSync(tmpDir); } catch (_) {}
  }));
});
