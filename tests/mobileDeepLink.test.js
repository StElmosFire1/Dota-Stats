// Task #461 — unit coverage for the mobile deep-link router helpers
// extracted from mobile/app/_layout.tsx into mobile/lib/deepLink.js.
//
// These are the routing decisions that turn an `oceinhouse://` deep link
// or an Expo push `data.url` payload into an Expo Router navigation. A
// refactor of the action-link shape (Task #414) or the push payload shape
// could silently break the mobile happy path; this locks the contract.

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseDeepLink, resolvePushRoute } = require('../mobile/lib/deepLink');

// expo-linking's Linking.parse turns `oceinhouse://?t=abc` into
// { path: null, queryParams: { t: 'abc' } } — mirror that shape here so
// the helper is exercised exactly as it is in _layout.tsx.

test('parseDeepLink: Steam OpenID hand-off (?t=token) → auth', () => {
  const r = parseDeepLink({ path: null, queryParams: { t: 'tok123' } });
  assert.deepEqual(r, { kind: 'auth', token: 'tok123' });
});

test('parseDeepLink: legacy ?token=… alias also yields auth', () => {
  const r = parseDeepLink({ path: null, queryParams: { token: 'tok456' } });
  assert.deepEqual(r, { kind: 'auth', token: 'tok456' });
});

test('parseDeepLink: action link with slot query param routes verbatim', () => {
  // oceinhouse:///action/ready-check/123?slot=2 parses with
  // path = 'action/ready-check/123'.
  const r = parseDeepLink({
    path: 'action/ready-check/123',
    queryParams: { slot: '2' },
  });
  assert.equal(r.kind, 'action');
  assert.equal(r.route, '/action/ready-check/123?slot=2');
});

test('parseDeepLink: mvp-vote action link with no query params', () => {
  const r = parseDeepLink({
    path: 'action/mvp-vote/987',
    queryParams: {},
  });
  assert.deepEqual(r, { kind: 'action', route: '/action/mvp-vote/987' });
});

test('parseDeepLink: query values are URI-encoded', () => {
  const r = parseDeepLink({
    path: 'action/book-coach/5',
    queryParams: { note: 'hi there', slot: '3' },
  });
  assert.equal(r.kind, 'action');
  assert.equal(r.route, '/action/book-coach/5?note=hi%20there&slot=3');
});

test('parseDeepLink: null/empty query values do not throw', () => {
  const r = parseDeepLink({
    path: 'action/scrim/77',
    queryParams: { slot: null },
  });
  assert.equal(r.kind, 'action');
  assert.equal(r.route, '/action/scrim/77?slot=');
});

test('parseDeepLink: non-action path with no token → none', () => {
  assert.deepEqual(parseDeepLink({ path: 'leaderboard', queryParams: {} }), { kind: 'none' });
});

test('parseDeepLink: token wins even when an action path is present', () => {
  const r = parseDeepLink({ path: 'action/ready-check/1', queryParams: { t: 'tok' } });
  assert.deepEqual(r, { kind: 'auth', token: 'tok' });
});

test('parseDeepLink: empty/garbage input → none', () => {
  assert.deepEqual(parseDeepLink({}), { kind: 'none' });
  assert.deepEqual(parseDeepLink({ path: null, queryParams: null }), { kind: 'none' });
});

test('resolvePushRoute: /action/<kind>/<id> push payload routes', () => {
  assert.equal(
    resolvePushRoute({ url: '/action/booking-reminder/42' }),
    '/action/booking-reminder/42'
  );
});

test('resolvePushRoute: generic in-app absolute path routes', () => {
  assert.equal(resolvePushRoute({ url: '/match/100' }), '/match/100');
});

test('resolvePushRoute: missing/relative/non-string url → null', () => {
  assert.equal(resolvePushRoute({}), null);
  assert.equal(resolvePushRoute(null), null);
  assert.equal(resolvePushRoute({ url: 'match/100' }), null);
  assert.equal(resolvePushRoute({ url: 123 }), null);
});
