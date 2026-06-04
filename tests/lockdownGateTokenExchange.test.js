// Regression coverage for the FULL_SITE_LOCKDOWN gate chicken-and-egg loop.
//
// Background: after /auth/steam/return the browser lands on
// `/?auth=success&t=<token>` with an EMPTY session (the return handler issues a
// single-use token and deliberately does not set the session on the 302). When
// the lockdown gate is on, that top-level navigation is served the static gate
// page instead of the SPA — so the SPA's own /api/auth/complete call never runs,
// req.session.accountId is never set, isAllowlistedSteamSuperuser is always
// false, and the owner bounces back to the gate forever.
//
// The fix makes the gate page itself exchange the token via /api/auth/complete
// (which is allow-listed in LOCKDOWN_ALLOWED_PATHS) and then reload `/`. This
// test boots the REAL app with the gate forced on and asserts over HTTP that:
//   1. a document navigation is served the gate page, AND that page carries the
//      token-exchange bootstrap (calls /api/auth/complete, reloads on success);
//   2. /api/auth/complete is actually reachable THROUGH the lockdown (not 401-
//      gated) — i.e. the endpoint the gate script depends on is allow-listed.

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

function _withLockdownForced(fn) {
  return async (...args) => {
    const prev = process.env.FULL_SITE_LOCKDOWN;
    process.env.FULL_SITE_LOCKDOWN = '1';
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
  return { status: res.status, contentType: res.headers.get('content-type') || '', body: text };
}

test('lockdown gate page bootstraps the Steam token exchange (no chicken-and-egg loop)',
  _withUnreffedIntervals(_withSessionSecret(_withLockdownForced(async () => {
    await withRunningApp(async (base) => {
      // 1. A top-level document navigation while the gate is on returns the gate
      //    page — and that page must carry the token-exchange bootstrap so the
      //    owner can actually get past the gate after Steam sign-in.
      const nav = await get(base, '/?auth=success&t=deadbeef', {
        Accept: 'text/html,application/xhtml+xml',
        'Sec-Fetch-Dest': 'document',
      });
      assert.equal(nav.status, 200, 'document navigation is served the gate page');
      assert.match(nav.body, /Private preview/, 'serves the lockdown gate page');
      assert.match(nav.body, /\/api\/auth\/complete/, 'gate page exchanges the single-use token');
      assert.match(nav.body, /<script nonce="[^"]+">/, 'gate bootstrap script carries a CSP nonce (so it runs under the policy)');
      assert.match(nav.body, /auth.{0,8}success/, 'gate script only fires on the auth=success return');
      assert.match(nav.body, /location\.replace/, 'gate script reloads the SPA on success');

      // 2. The endpoint the gate script calls must be reachable THROUGH the
      //    lockdown (allow-listed), otherwise the exchange would itself be
      //    gated. With no/invalid token it answers 400/401 — crucially NOT the
      //    blanket 401-empty the gate hands unauth API calls.
      const complete = await get(base, '/api/auth/complete', { Accept: 'application/json' });
      assert.ok(
        complete.status === 400 || complete.status === 401,
        `/api/auth/complete is reachable through lockdown (got ${complete.status})`
      );
      assert.match(complete.body, /token/i, '/api/auth/complete ran its own handler (token error), not the gate');
    });
  }))));
