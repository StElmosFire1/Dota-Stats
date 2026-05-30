// Task #566 — HTTP-level integration test for brand-asset hotlink protection.
//
// tests/assetHotlink.test.js exercises the middleware FUNCTION and the report
// builder directly with req/res doubles. That proves the decision logic is
// correct, but it does NOT prove the middleware is actually wired into the
// Express app — mounted (via app.use) BEFORE the express.static handler in
// src/web/server.js. A refactor of the static-serving block could silently
// drop or reorder the mount and every unit test would still pass green.
//
// This test boots the REAL app from createServer() (with the heavy
// transitive deps stubbed via the shared harness), listens on an ephemeral
// port, and makes genuine HTTP requests so the full middleware chain runs:
//   - GET /oa-logo.png with an off-domain Referer            → 403
//   - GET /oa-logo.png with no Referer                       → served (200, not 403)
//   - GET /oa-logo.png with a same-origin Referer            → served (not 403)
//   - GET /badges/* with an off-domain Referer               → 403
//   - GET a generic bundled asset (/assets/*.js) off-domain  → served (not 403)
//   - GET /api/admin/asset-hotlink-report without superuser  → 401
//
// The 200 "served" assertions depend on web/dist existing with the built
// assets. On a fresh checkout where web/dist is absent the static handler is
// never mounted, so those cases would 404 instead of 200 — the test guards
// for that and asserts "not 403" (the hotlink-specific signal) which holds
// either way, while still asserting an exact 200 when the file is present.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  _stubServerDeps,
  _loadServerFresh,
  _withUnreffedIntervals,
  _withSuperuserPassword,
} = require('./fixtures/serverHarness');

const STATIC_DIR = path.join(__dirname, '../web/dist');
const HAS_DIST = fs.existsSync(path.join(STATIC_DIR, 'oa-logo.png'));

// Pick a real bundled JS asset out of web/dist/assets so the generic-asset
// pass-through case hits an actual file (→ 200) rather than the SPA fallback.
function _anyBundledJs() {
  try {
    const f = fs.readdirSync(path.join(STATIC_DIR, 'assets')).find(n => n.endsWith('.js'));
    return f ? `/assets/${f}` : null;
  } catch (_) {
    return null;
  }
}

function _withSessionSecret(fn) {
  return async (...args) => {
    const prev = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
    try { return await fn(...args); }
    finally {
      if (prev === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = prev;
    }
  };
}

// Boot the real app, run `body(base)` against it over HTTP, then tear down.
async function withRunningApp(body) {
  _stubServerDeps();
  const { createServer } = _loadServerFresh();
  const app = createServer({});
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await body(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(base, p, headers) {
  const res = await fetch(base + p, { headers: headers || {}, redirect: 'manual' });
  const text = await res.text();
  return { status: res.status, contentType: res.headers.get('content-type') || '', body: text };
}

test('hotlink protection over HTTP: end-to-end through the real middleware chain',
  _withUnreffedIntervals(_withSessionSecret(_withSuperuserPassword('test-superuser-pw', async () => {
    await withRunningApp(async (base) => {
      // 1. Off-domain Referer → blocked with a real 403.
      const offDomain = await get(base, '/oa-logo.png', { Referer: 'https://clone.example/home' });
      assert.equal(offDomain.status, 403, 'off-domain logo must be blocked with 403');
      assert.match(offDomain.body, /not permitted/i, '403 body explains the block');

      // 2. No Referer (direct load / most unfurlers) → served, never 403.
      const noReferer = await get(base, '/oa-logo.png', {});
      assert.notEqual(noReferer.status, 403, 'no-referer logo must NOT be blocked');
      if (HAS_DIST) {
        assert.equal(noReferer.status, 200, 'no-referer logo is served from web/dist');
        assert.match(noReferer.contentType, /image\/png/, 'served as an image');
      }

      // 3. Same-origin Referer (host matches the request host) → served.
      const host = new URL(base).host;
      const sameOrigin = await get(base, '/oa-logo.png', { Referer: `${base}/leaderboard`, Host: host });
      assert.notEqual(sameOrigin.status, 403, 'same-origin logo must NOT be blocked');
      if (HAS_DIST) assert.equal(sameOrigin.status, 200, 'same-origin logo is served');

      // 4. A gated subdirectory (badges) off-domain → blocked too, proving the
      //    gate isn't limited to the single /oa-logo.png exact path.
      const badgeOff = await get(base, '/badges/tier-8-king.png', { Referer: 'https://clone.example/x' });
      assert.equal(badgeOff.status, 403, 'off-domain badge must be blocked with 403');

      // 5. A generic bundled asset off-domain → served (NOT gated). This is the
      //    case that proves the middleware sits before express.static and only
      //    gates distinctive brand assets, not the whole static tree.
      const jsPath = _anyBundledJs();
      if (jsPath) {
        const genericOff = await get(base, jsPath, { Referer: 'https://clone.example/x' });
        assert.notEqual(genericOff.status, 403, 'generic bundled JS must NOT be blocked off-domain');
        assert.equal(genericOff.status, 200, 'generic bundled JS is served off-domain');
      }

      // 6. The superuser report route rejects an unauthenticated caller. Proves
      //    the report endpoint is mounted AND gated over real HTTP.
      const report = await get(base, '/api/admin/asset-hotlink-report', {});
      assert.equal(report.status, 401, 'asset-hotlink-report rejects anonymous callers with 401');
    });
  }))));
