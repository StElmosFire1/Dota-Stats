// Task #461 — coverage for the two mobile-companion write endpoints added
// in Task #414:
//   POST /api/matches/:matchId/mvp-vote
//   POST /api/bookings/:id/reminder-ack
//
// These are the server side of the mobile one-tap push actions. A refactor
// of session auth, the coaching feature gate, or the match/booking data
// shapes could silently break the mobile happy path and we'd only learn
// from user reports. The harness stubs db / Stripe / Discord so no real
// infrastructure is touched.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  _stubServerDeps,
  _invokeHandler,
  _withUnreffedIntervals,
  _loadServerFresh,
} = require('./fixtures/serverHarness');

function _findRoute(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method]) {
      return layer.route;
    }
  }
  throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
}

function _makeReq({ session, params, body }) {
  return {
    session: session || {},
    params: params || {},
    body: body || {},
    query: {},
    headers: {},
    method: 'POST',
    get(name) { return (this.headers && this.headers[String(name).toLowerCase()]) || undefined; },
  };
}

// Build a router with custom db overrides for each scenario.
function bootRouter(dbOverrides) {
  _stubServerDeps(dbOverrides);
  const { createApiRouter } = _loadServerFresh();
  return createApiRouter({}, null);
}

const NOW = Date.now();
// A match that ended an hour ago — well inside the 24h voting window.
function recentMatch(players) {
  const startSec = Math.floor((NOW - 90 * 60 * 1000) / 1000); // started 90m ago
  return { match_id: 555, start_time: startSec, duration: 30 * 60, players };
}

// ===========================================================================
// MVP vote
// ===========================================================================

test('mvp-vote: 401 when not signed in', _withUnreffedIntervals(async () => {
  const router = bootRouter({});
  const route = _findRoute(router, 'post', '/matches/:matchId/mvp-vote');
  const res = await _invokeHandler(route, _makeReq({
    params: { matchId: '555' }, body: { rated_account_id: '2' },
  }));
  assert.equal(res.status, 401);
}));

test('mvp-vote: 400 on invalid match id', _withUnreffedIntervals(async () => {
  const router = bootRouter({});
  const route = _findRoute(router, 'post', '/matches/:matchId/mvp-vote');
  const res = await _invokeHandler(route, _makeReq({
    session: { accountId: '1' }, params: { matchId: 'nope' }, body: { rated_account_id: '2' },
  }));
  assert.equal(res.status, 400);
}));

test('mvp-vote: 400 when rated_account_id missing', _withUnreffedIntervals(async () => {
  const router = bootRouter({});
  const route = _findRoute(router, 'post', '/matches/:matchId/mvp-vote');
  const res = await _invokeHandler(route, _makeReq({
    session: { accountId: '1' }, params: { matchId: '555' }, body: {},
  }));
  assert.equal(res.status, 400);
}));

test('mvp-vote: 400 when voting for yourself', _withUnreffedIntervals(async () => {
  const router = bootRouter({});
  const route = _findRoute(router, 'post', '/matches/:matchId/mvp-vote');
  const res = await _invokeHandler(route, _makeReq({
    session: { accountId: '1' }, params: { matchId: '555' }, body: { rated_account_id: '1' },
  }));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /yourself/i);
}));

test('mvp-vote: 404 when match not found', _withUnreffedIntervals(async () => {
  const router = bootRouter({ getMatch: async () => null });
  const route = _findRoute(router, 'post', '/matches/:matchId/mvp-vote');
  const res = await _invokeHandler(route, _makeReq({
    session: { accountId: '1' }, params: { matchId: '555' }, body: { rated_account_id: '2' },
  }));
  assert.equal(res.status, 404);
}));

test('mvp-vote: 400 when the 24h voting window has closed', _withUnreffedIntervals(async () => {
  const oldStart = Math.floor((NOW - 26 * 60 * 60 * 1000) / 1000); // 26h ago
  const router = bootRouter({
    getMatch: async () => ({
      match_id: 555, start_time: oldStart, duration: 30 * 60,
      players: [
        { account_id: '1', team: 0 },
        { account_id: '2', team: 0 },
      ],
    }),
  });
  const route = _findRoute(router, 'post', '/matches/:matchId/mvp-vote');
  const res = await _invokeHandler(route, _makeReq({
    session: { accountId: '1' }, params: { matchId: '555' }, body: { rated_account_id: '2' },
  }));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /window/i);
}));

test('mvp-vote: 403 when the voter did not play in the match', _withUnreffedIntervals(async () => {
  const router = bootRouter({
    getMatch: async () => recentMatch([
      { account_id: '7', team: 0 },
      { account_id: '2', team: 0 },
    ]),
  });
  const route = _findRoute(router, 'post', '/matches/:matchId/mvp-vote');
  const res = await _invokeHandler(route, _makeReq({
    session: { accountId: '1' }, params: { matchId: '555' }, body: { rated_account_id: '2' },
  }));
  assert.equal(res.status, 403);
}));

test('mvp-vote: 400 when the candidate did not play in the match', _withUnreffedIntervals(async () => {
  const router = bootRouter({
    getMatch: async () => recentMatch([
      { account_id: '1', team: 0 },
    ]),
  });
  const route = _findRoute(router, 'post', '/matches/:matchId/mvp-vote');
  const res = await _invokeHandler(route, _makeReq({
    session: { accountId: '1' }, params: { matchId: '555' }, body: { rated_account_id: '2' },
  }));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /did not play/i);
}));

test('mvp-vote: 400 when candidate is on the enemy team (same-team rule)', _withUnreffedIntervals(async () => {
  const router = bootRouter({
    getMatch: async () => recentMatch([
      { account_id: '1', team: 0 },
      { account_id: '2', team: 1 }, // enemy team
    ]),
  });
  const route = _findRoute(router, 'post', '/matches/:matchId/mvp-vote');
  const res = await _invokeHandler(route, _makeReq({
    session: { accountId: '1' }, params: { matchId: '555' }, body: { rated_account_id: '2' },
  }));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /teammates only/i);
}));

test('mvp-vote: 200 happy path saves the MVP vote', _withUnreffedIntervals(async () => {
  const saveCalls = [];
  const router = bootRouter({
    getMatch: async () => recentMatch([
      { account_id: '1', team: 0 },
      { account_id: '2', team: 0 },
    ]),
    saveMatchRating: async (...args) => { saveCalls.push(args); },
  });
  const route = _findRoute(router, 'post', '/matches/:matchId/mvp-vote');
  const res = await _invokeHandler(route, _makeReq({
    session: { accountId: '1' }, params: { matchId: '555' }, body: { rated_account_id: '2' },
  }));
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.match_id, 555);
  assert.equal(res.body.rated_account_id, '2');
  // saveMatchRating(matchId, rater, rated, attitude, isMvpVote)
  assert.equal(saveCalls.length, 1);
  assert.deepEqual(saveCalls[0], [555, '1', '2', null, true]);
}));

test('mvp-vote: re-voting is idempotent at the route level (delegates to db ON CONFLICT)', _withUnreffedIntervals(async () => {
  let calls = 0;
  const router = bootRouter({
    getMatch: async () => recentMatch([
      { account_id: '1', team: 0 },
      { account_id: '2', team: 0 },
      { account_id: '3', team: 0 },
    ]),
    saveMatchRating: async () => { calls += 1; },
  });
  const route = _findRoute(router, 'post', '/matches/:matchId/mvp-vote');
  const req1 = _makeReq({ session: { accountId: '1' }, params: { matchId: '555' }, body: { rated_account_id: '2' } });
  const res1 = await _invokeHandler(route, req1);
  // Same voter changes their mind to player 3 — still a 200, db upsert
  // collapses the duplicate (rater,match) pair.
  const route2 = _findRoute(router, 'post', '/matches/:matchId/mvp-vote');
  const req2 = _makeReq({ session: { accountId: '1' }, params: { matchId: '555' }, body: { rated_account_id: '3' } });
  const res2 = await _invokeHandler(route2, req2);
  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);
  assert.equal(calls, 2);
}));

// ===========================================================================
// Booking reminder ack
// ===========================================================================

const COACHING_ON = { getFeatureFlag: async () => ({ state: 'on' }) };

test('reminder-ack: 404 when coaching marketplace is disabled', _withUnreffedIntervals(async () => {
  const router = bootRouter({ getFeatureFlag: async () => ({ state: 'off' }) });
  const route = _findRoute(router, 'post', '/bookings/:id/reminder-ack');
  const res = await _invokeHandler(route, _makeReq({
    session: { accountId: '1' }, params: { id: '10' },
  }));
  assert.equal(res.status, 404);
}));

test('reminder-ack: 401 when not signed in', _withUnreffedIntervals(async () => {
  const router = bootRouter({ ...COACHING_ON });
  const route = _findRoute(router, 'post', '/bookings/:id/reminder-ack');
  const res = await _invokeHandler(route, _makeReq({ params: { id: '10' } }));
  assert.equal(res.status, 401);
}));

test('reminder-ack: 400 on invalid booking id', _withUnreffedIntervals(async () => {
  const router = bootRouter({ ...COACHING_ON });
  const route = _findRoute(router, 'post', '/bookings/:id/reminder-ack');
  const res = await _invokeHandler(route, _makeReq({
    session: { accountId: '1' }, params: { id: 'abc' },
  }));
  assert.equal(res.status, 400);
}));

test('reminder-ack: 404 when booking is not the student\'s or not ackable', _withUnreffedIntervals(async () => {
  // db.ackBookingReminder returns null when the WHERE clause (student match
  // + status='paid') misses — the route maps that to 404.
  const router = bootRouter({ ...COACHING_ON, ackBookingReminder: async () => null });
  const route = _findRoute(router, 'post', '/bookings/:id/reminder-ack');
  const res = await _invokeHandler(route, _makeReq({
    session: { accountId: '1' }, params: { id: '10' },
  }));
  assert.equal(res.status, 404);
}));

test('reminder-ack: 200 happy path acks the reminder for the student', _withUnreffedIntervals(async () => {
  const ackCalls = [];
  const booking = { id: 10, student_account_id: '1', status: 'paid', reminder_acked_at: '2026-05-29T00:00:00Z' };
  const router = bootRouter({
    ...COACHING_ON,
    ackBookingReminder: async (id, student) => { ackCalls.push([id, student]); return booking; },
  });
  const route = _findRoute(router, 'post', '/bookings/:id/reminder-ack');
  const res = await _invokeHandler(route, _makeReq({
    session: { accountId: '1' }, params: { id: '10' },
  }));
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(res.body.booking, booking);
  // Route binds the ack to the *session* account, never a client-supplied id.
  assert.deepEqual(ackCalls, [[10, '1']]);
}));

test('reminder-ack: is idempotent — repeated acks keep returning 200 with COALESCE-stable timestamp', _withUnreffedIntervals(async () => {
  // Mirror the db COALESCE(reminder_acked_at, NOW()) — the first ack stamps
  // a time, subsequent acks return the same row unchanged.
  const stamped = { id: 10, student_account_id: '1', status: 'paid', reminder_acked_at: '2026-05-29T01:23:45Z' };
  const router = bootRouter({ ...COACHING_ON, ackBookingReminder: async () => stamped });
  const route1 = _findRoute(router, 'post', '/bookings/:id/reminder-ack');
  const res1 = await _invokeHandler(route1, _makeReq({ session: { accountId: '1' }, params: { id: '10' } }));
  const route2 = _findRoute(router, 'post', '/bookings/:id/reminder-ack');
  const res2 = await _invokeHandler(route2, _makeReq({ session: { accountId: '1' }, params: { id: '10' } }));
  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);
  assert.equal(res1.body.booking.reminder_acked_at, res2.body.booking.reminder_acked_at);
}));
