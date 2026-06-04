// Regression coverage for the stale-app-shell caching bug.
//
// Background: `app.use(express.static(staticPath))` serves index.html for `/`
// (express.static's default `index: 'index.html'` behaviour) with ordinary
// cacheable validators (ETag/Last-Modified, no `no-store`). That let the
// browser / an upstream CDN pin a STALE app shell after a deploy — the shell
// references hashed JS/CSS chunks that no longer exist, so the user is stuck on
// an old build until a manual hard-refresh. The visible symptom was the
// Superuser Access modal never clearing because the cached bundle's session
// probe was out of step with the live server.
//
// The fix mounts express.static with `{ index: false }` so EVERY document
// request — including `/` — falls through to the explicit SPA handler that sets
// `Cache-Control: no-store, must-revalidate`. This test boots the REAL app
// (lockdown OFF) and asserts over HTTP that the HTML shell is served no-store
// at both `/` and a deep SPA route.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  _stubServerDeps,
  _loadServerFresh,
  _withUnreffedIntervals,
} = require('./fixtures/serverHarness');

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

function _withLockdownOff(fn) {
  return async (...args) => {
    const prev = process.env.FULL_SITE_LOCKDOWN;
    delete process.env.FULL_SITE_LOCKDOWN;
    try { return await fn(...args); }
    finally {
      if (prev === undefined) delete process.env.FULL_SITE_LOCKDOWN;
      else process.env.FULL_SITE_LOCKDOWN = prev;
    }
  };
}

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
  return {
    status: res.status,
    cacheControl: res.headers.get('cache-control') || '',
    body: text,
  };
}

test('SPA HTML shell is served no-store at the root and on deep routes (no stale-build pin)',
  _withUnreffedIntervals(_withSessionSecret(_withLockdownOff(async () => {
    await withRunningApp(async (base) => {
      const docHeaders = {
        Accept: 'text/html,application/xhtml+xml',
        'Sec-Fetch-Dest': 'document',
      };

      // The bootstrap shell at `/` must NOT be cacheable — this is the exact
      // request express.static used to answer with cacheable headers.
      const root = await get(base, '/', docHeaders);
      assert.equal(root.status, 200, 'root serves the SPA shell');
      assert.match(
        root.cacheControl, /no-store/,
        'root index.html must be no-store so a deploy is never pinned to a stale shell'
      );

      // A deep client-side route (handled by the SPA fallback) must also be
      // no-store — guards against a regression that only fixes `/`.
      const deep = await get(base, '/admin', docHeaders);
      assert.equal(deep.status, 200, 'deep SPA route serves the shell');
      assert.match(deep.cacheControl, /no-store/, 'deep SPA route shell is no-store');

      // The flip side of the fix: hashed JS/CSS bundles MUST still be served
      // by express.static (cacheable), not swept up into no-store. Guards
      // against an overcorrection that would de-cache every bundle. We pull a
      // real asset path out of the shell so this never hardcodes a hash.
      const assetRef = (root.body.match(/\/assets\/[^"']+\.(?:js|css)/) || [])[0];
      assert.ok(assetRef, 'index.html references a hashed asset to probe');
      const asset = await get(base, assetRef, {});
      assert.equal(asset.status, 200, 'hashed asset is served');
      assert.doesNotMatch(
        asset.cacheControl, /no-store/,
        'hashed bundles must stay cacheable (only the HTML shell is no-store)'
      );
    });
  }))));
