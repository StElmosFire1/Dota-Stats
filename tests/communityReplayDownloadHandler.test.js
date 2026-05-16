// Task #304 — route test for the community-edition public replay-download
// endpoint (`_ceReplayDownloadHandler`, mounted at both
// `/replays/:matchId/download` and `/matches/:matchId/replay`).
//
// Task #303 stripped the Pro-paywall gate from this handler — the community
// edition is paywall-free by policy (see community-edition/SETUP.md). The
// remaining branching logic (missing DB row → 404, missing file on disk →
// 404, happy-path stream with Content-Disposition + Content-Type) had no
// automated coverage, so a future refactor could silently break legitimate
// downloads, or — worse — silently re-add an auth check that locks out
// community users. This test pins the four shapes:
//
//   1. DB returns no row                          → 404
//   2. DB returns a row but file doesn't exist    → 404
//   3. Happy path                                 → 200 + correct headers,
//                                                   file contents streamed
//   4. No auth/role middleware on the route       → anonymous callers are
//                                                   served (explicit policy)
//
// The handler is a local `const` inside createApiRouter(), so we reach it
// the same way tests/superuserAdminRouteAuth.test.js does: boot the server
// module with the heavy transitive deps stubbed and the `db` module
// replaced via require.cache, build the router, then pull the route layer
// out of router.stack and invoke its handle() directly.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const SERVER_PATH = require.resolve('../community-edition/src/web/server');
const DB_PATH = require.resolve('../community-edition/src/db');

function stubModule(specifier, exports) {
  const filename = Module.createRequire(SERVER_PATH).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}

function stubCommunityDeps(dbOverrides) {
  stubModule('../replay/replayParser', { getReplayParser: () => ({ parserReady: false }) });
  stubModule('../stats/statsService',  { getStatsService: () => ({}) });
  stubModule('../discord/bot',         { getDiscordBot: () => ({ isInLeagueGuild: async () => ({ inGuild: null }) }) });

  const baseDb = {
    getPool: () => ({ query: async () => ({ rows: [] }) }),
    expireOldReplayFiles: async () => [],
  };
  const merged = { ...baseDb, ...dbOverrides };
  const proxied = new Proxy(merged, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return async () => null;
    },
  });
  delete require.cache[DB_PATH];
  require.cache[DB_PATH] = { id: DB_PATH, filename: DB_PATH, loaded: true, exports: proxied };
}

function loadServerFresh() {
  delete require.cache[SERVER_PATH];
  // The server module schedules a couple of long-running setInterval()s at
  // module load. unref() them so `node --test` doesn't hang after the run.
  const origSetInterval = global.setInterval;
  global.setInterval = (...args) => {
    const id = origSetInterval(...args);
    if (id && typeof id.unref === 'function') id.unref();
    return id;
  };
  try {
    return require('../community-edition/src/web/server');
  } finally {
    global.setInterval = origSetInterval;
  }
}

function findReplayLayers(router) {
  // Both /replays/:matchId/download and /matches/:matchId/replay map to the
  // same handler; we collect both so the test asserts the shape on both
  // mount points.
  return router.stack.filter((layer) => {
    if (!layer.route) return false;
    const p = layer.route.path;
    return p === '/replays/:matchId/download' || p === '/matches/:matchId/replay';
  });
}

function findApiRouter(app) {
  // Express 5: the app exposes its router as `app.router` (no leading
  // underscore). The /api mount is a `router`-named layer whose inner
  // .handle is itself a router with .stack of routes. There's only one
  // such layer in createServer(); pick the one whose inner stack has a
  // /health route (the unambiguous fingerprint of the api router).
  const r = app.router || app._router;
  for (const layer of r.stack) {
    if (layer.name !== 'router' || !layer.handle || !layer.handle.stack) continue;
    const hasHealth = layer.handle.stack.some(s => s.route && s.route.path === '/health');
    if (hasHealth) return layer.handle;
  }
  throw new Error('api router not found on createServer() app — express layout changed?');
}

function makeRes() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  const piped = [];
  const res = {
    statusCode,
    status(code) { statusCode = code; res.statusCode = code; return res; },
    json(obj) { body = obj; return res; },
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    getHeader(name) { return headers[name.toLowerCase()]; },
    on() { return res; },
    once() { return res; },
    emit() { return res; },
    end() {},
    write() {},
  };
  Object.defineProperty(res, 'headers', { get: () => headers });
  Object.defineProperty(res, '_body', { get: () => body });
  Object.defineProperty(res, '_status', { get: () => statusCode });
  Object.defineProperty(res, '_piped', { get: () => piped });
  return res;
}

async function invokeRouteHandler(layer, req) {
  // The replay-download route has exactly one handler (no middlewares); we
  // call it directly and await any returned promise.
  const stack = layer.route.stack;
  assert.equal(stack.length, 1,
    `Expected exactly one handler on ${layer.route.path} (no auth/role middlewares). ` +
    `Found ${stack.length}: ${stack.map(s => s.name || '<anon>').join(', ')}. ` +
    `If you intentionally added middleware, update this assertion AND the project policy ` +
    `that the community replay download is anonymous-accessible.`);
  const res = makeRes();
  let nextErr = null;
  await new Promise((resolve, reject) => {
    try {
      const ret = stack[0].handle(req, res, (err) => { nextErr = err || null; resolve(); });
      // The handler kicks off fs.createReadStream(...).pipe(res) on the
      // happy path. Wait briefly so the stream emits 'end' before we
      // assert on captured chunks.
      if (ret && typeof ret.then === 'function') {
        ret.then(() => setTimeout(resolve, 30), reject);
      } else {
        setTimeout(resolve, 30);
      }
    } catch (err) { reject(err); }
  });
  if (nextErr) throw nextErr;
  return res;
}

test('community replay-download handler', async (t) => {
  await t.test('returns 404 when DB has no row for the match', async () => {
    stubCommunityDeps({
      getReplayFilePath: async () => null,
    });
    const { createServer: _ } = loadServerFresh();
    // createApiRouter is not exported; round-trip through createServer →
    // the router is wired under /api. Simpler: call the createApiRouter
    // function via the module's internal — but it's not exported either.
    // Instead, we mount createServer() and pluck the route off its app.
    // Both shapes test the same handler reference, so we just look up the
    // route on the express app's _router stack.
    const { createServer } = require('../community-edition/src/web/server');
    const app = createServer({ startedAt: new Date().toISOString() });
    const apiRouter = findApiRouter(app);
    const layers = findReplayLayers(apiRouter);
    assert.equal(layers.length, 2,
      'Expected both /replays/:matchId/download and /matches/:matchId/replay to be mounted');

    for (const layer of layers) {
      const res = await invokeRouteHandler(layer, { params: { matchId: '12345' } });
      assert.equal(res._status, 404, `${layer.route.path} should 404 when DB returns null`);
      assert.match(res._body.error, /No replay file stored/i);
    }
  });

  await t.test('returns 404 when DB has a row but the file is missing on disk', async () => {
    const ghostPath = path.join(os.tmpdir(), `ce-replay-ghost-${Date.now()}.dem`);
    // Sanity: make sure the path really does not exist.
    if (fs.existsSync(ghostPath)) fs.unlinkSync(ghostPath);

    stubCommunityDeps({
      getReplayFilePath: async () => ({ replay_file_path: ghostPath }),
    });
    const { createServer } = loadServerFresh();
    const app = createServer({ startedAt: new Date().toISOString() });
    const layers = findReplayLayers(findApiRouter(app));

    for (const layer of layers) {
      const res = await invokeRouteHandler(layer, { params: { matchId: '12345' } });
      assert.equal(res._status, 404, `${layer.route.path} should 404 when file is gone from disk`);
      assert.match(res._body.error, /deleted|expired/i);
    }
  });

  await t.test('happy path streams the file with attachment headers', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-replay-happy-'));
    const replayPath = path.join(tmpDir, 'match_12345.dem');
    const payload = Buffer.from('FAKE-DEM-CONTENT-' + 'x'.repeat(64));
    fs.writeFileSync(replayPath, payload);

    stubCommunityDeps({
      getReplayFilePath: async (matchId) => {
        assert.equal(matchId, '12345', 'handler should pass req.params.matchId straight to db.getReplayFilePath');
        return { replay_file_path: replayPath };
      },
    });
    const { createServer } = loadServerFresh();
    const app = createServer({ startedAt: new Date().toISOString() });
    const layers = findReplayLayers(findApiRouter(app));

    for (const layer of layers) {
      // Use a real Writable-ish res so .pipe() can flow into us.
      const { Writable } = require('stream');
      const chunks = [];
      const writable = new Writable({
        write(chunk, _enc, cb) { chunks.push(Buffer.from(chunk)); cb(); },
      });
      // Mix express response methods onto the writable.
      const headers = {};
      let statusCode = 200;
      writable.status = (code) => { statusCode = code; writable.statusCode = code; return writable; };
      writable.json = (obj) => { writable._body = obj; return writable; };
      writable.setHeader = (k, v) => { headers[k.toLowerCase()] = v; };
      writable.getHeader = (k) => headers[k.toLowerCase()];

      await new Promise((resolve, reject) => {
        writable.on('finish', resolve);
        writable.on('error', reject);
        try {
          const ret = layer.route.stack[0].handle({ params: { matchId: '12345' } }, writable, (err) => {
            if (err) reject(err); else resolve();
          });
          if (ret && typeof ret.then === 'function') ret.catch(reject);
        } catch (err) { reject(err); }
      });

      assert.equal(statusCode, 200, `${layer.route.path} should leave default 200 status on happy path`);
      assert.equal(headers['content-type'], 'application/octet-stream',
        `${layer.route.path} should set Content-Type: application/octet-stream`);
      assert.equal(headers['content-disposition'], `attachment; filename="match_12345.dem"`,
        `${layer.route.path} should set Content-Disposition with the basename of the stored file`);
      assert.deepEqual(Buffer.concat(chunks), payload,
        `${layer.route.path} should stream the exact bytes of the stored .dem file`);
    }

    // Cleanup.
    try { fs.unlinkSync(replayPath); } catch (_) {}
    try { fs.rmdirSync(tmpDir); } catch (_) {}
  });

  await t.test('no auth/role middleware is registered on either mount — anonymous callers are served', async () => {
    // This is the explicit community-edition policy (community-edition/SETUP.md:
    // paywall-free) and the regression Task #303 was about. We re-assert it
    // structurally: the route layer has exactly one handler with NO middleware
    // chain in front of it. invokeRouteHandler() above also asserts stack.length
    // === 1, but we pin it here separately and explicitly so the failure message
    // is unambiguous if someone slips in `requirePro`, `authMiddleware`, or any
    // similar gate.
    stubCommunityDeps({ getReplayFilePath: async () => null });
    const { createServer } = loadServerFresh();
    const app = createServer({ startedAt: new Date().toISOString() });
    const layers = findReplayLayers(findApiRouter(app));

    for (const layer of layers) {
      const handlerNames = layer.route.stack.map(s => s.name || '<anon>');
      assert.equal(layer.route.stack.length, 1,
        `${layer.route.path} must have NO auth/role middleware in front of the handler ` +
        `(community edition is paywall-free by policy — see community-edition/SETUP.md). ` +
        `Current chain: [${handlerNames.join(', ')}]`);
      // Belt-and-braces: explicitly reject the names we've seen leak in
      // before / would leak in if a refactor went wrong.
      for (const name of handlerNames) {
        assert.ok(!/requirePro|requireProMember|paywall|authMiddleware|requireSuperuser|requireAuth/i.test(name),
          `${layer.route.path} must not have a "${name}" middleware. ` +
          `Community edition is paywall-free; see community-edition/SETUP.md.`);
      }
    }
  });
});
