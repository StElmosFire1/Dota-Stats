// Task #501 — Smurf detector fingerprint overlap round-trip.
//
// Proves the three pieces wired up by Task #431 actually connect:
//   1. middleware (`stampSession`) writes sess.ip / sess.ua on authenticated
//      sessions, and is a no-op for anonymous ones.
//   2. `_buildSessionFingerprintIndex` reads those keys back off user_sessions.
//   3. `_fingerprintSignal` (via `scoreAccount`) finds the overlap and
//      contributes points, naming the partner — and returns 0 when there's
//      no overlap.
//
// A regression in any of the three would silently flip the signal back to
// "no data" without anyone noticing.

const test = require('node:test');
const assert = require('node:assert/strict');

const smurf = require('../src/smurf/smurfScorer');
const { stampSession, computePrints } = require('../src/web/sessionFingerprint');

// A pool stub that returns canned rows for the queries scoreAccount fires.
// Only the fingerprint path needs real data here; every other signal is
// driven to its "no data" branch so the fingerprint contribution is the
// only thing under test.
function makePool({ sessionRows = [], sharedRows = null } = {}) {
  return {
    async query(sql) {
      if (/FROM user_sessions/.test(sql)) {
        return { rows: sessionRows };
      }
      if (/WITH me AS/.test(sql)) {
        // _sharedLobbySignal — return a total below MIN_MATCHES so it
        // degrades to "no data" (contribution 0).
        return { rows: sharedRows || [{ total: 0, top_shared: 0, top_partner: null }] };
      }
      if (/FROM player_stats\s+WHERE account_id = \$1 AND hero_id > 0/.test(sql)) {
        // _heroPoolSignal — no rows → total 0 → "no data".
        return { rows: [] };
      }
      if (/AVG\(perf\)/.test(sql)) {
        // _perfOutlierSignal early-games query — null avg → "no data".
        return { rows: [{ avg_perf: null, n: 0 }] };
      }
      if (/FROM ratings r WHERE r\.player_id = \$1/.test(sql)) {
        // _ageVsMmrSignal — not rated → "no data".
        return { rows: [{ mmr: null, games: 0 }] };
      }
      if (/SELECT mmr::float AS mmr FROM ratings/.test(sql)) {
        return { rows: [{ mmr: null }] };
      }
      return { rows: [] };
    },
  };
}

// Build a user_sessions row shaped like connect-pg-simple stores it.
function sessionRow(accountId, ip, ua) {
  return { sess: { accountId, ip, ua } };
}

test('fingerprint signal: overlapping hashed IPs across two accounts contribute >0 and name the partner', async () => {
  const SHARED_IP = 'iphash-shared-aaaa';
  const pool = makePool({
    sessionRows: [
      sessionRow('111', SHARED_IP, 'uahash-1111'),
      sessionRow('222', SHARED_IP, 'uahash-2222'),
    ],
  });

  const idx = await smurf._buildSessionFingerprintIndex(pool);
  assert.ok(idx.get('111')?.has(`ip:${SHARED_IP}`), 'index has account 111 ip print');
  assert.ok(idx.get('222')?.has(`ip:${SHARED_IP}`), 'index has account 222 ip print');

  const { signals } = await smurf.scoreAccount(pool, '111', { sessionFingerprintIndex: idx });
  const fp = signals.fingerprint;

  assert.ok(fp.contribution > 0, 'fingerprint signal contributes points');
  assert.equal(fp.weight, smurf.SIGNAL_WEIGHTS.fingerprint);
  assert.match(fp.detail, /222/, 'detail names the overlapping partner account');
  assert.ok(Array.isArray(fp.partners), 'partners array present');
  assert.equal(fp.partners[0].accountId, '222');
  assert.equal(fp.partners[0].hits, 1);
});

test('fingerprint signal: no overlap returns 0 contribution with the "no overlapping fingerprints" detail', async () => {
  const pool = makePool({
    sessionRows: [
      sessionRow('111', 'iphash-alpha', 'uahash-1111'),
      sessionRow('222', 'iphash-beta', 'uahash-2222'),
    ],
  });

  const idx = await smurf._buildSessionFingerprintIndex(pool);
  const { signals } = await smurf.scoreAccount(pool, '111', { sessionFingerprintIndex: idx });
  const fp = signals.fingerprint;

  assert.equal(fp.contribution, 0, 'no overlap → 0 contribution');
  assert.equal(fp.value, 0);
  assert.equal(fp.detail, 'no overlapping fingerprints');
  assert.deepEqual(fp.partners, []);
});

test('fingerprint signal: empty index degrades to "no fingerprint data available"', async () => {
  const pool = makePool({ sessionRows: [] });
  const idx = await smurf._buildSessionFingerprintIndex(pool);
  assert.equal(idx.size, 0);

  const { signals } = await smurf.scoreAccount(pool, '111', { sessionFingerprintIndex: idx });
  assert.equal(signals.fingerprint.contribution, 0);
  assert.equal(signals.fingerprint.detail, 'no fingerprint data available');
});

test('stampSession: no-op for anonymous sessions, writes for authenticated ones', () => {
  const baseReq = {
    ip: '203.0.113.7',
    headers: { 'user-agent': 'Mozilla/5.0 (Test Runner)' },
    connection: {},
  };

  // Anonymous — no accountId on the session.
  const anonReq = { ...baseReq, session: {} };
  assert.equal(stampSession(anonReq), false, 'anonymous session not stamped');
  assert.equal(anonReq.session.ip, undefined);
  assert.equal(anonReq.session.ua, undefined);

  // Authenticated — accountId present.
  const authReq = { ...baseReq, session: { accountId: '111' } };
  const changed = stampSession(authReq);
  assert.equal(changed, true, 'authenticated session stamped');

  const expected = computePrints(authReq);
  assert.equal(authReq.session.ip, expected.ip, 'hashed ip written');
  assert.equal(authReq.session.ua, expected.ua, 'hashed ua written');
  assert.ok(authReq.session.fpStampedAt > 0, 'stamp timestamp recorded');

  // Hashes are truncated to 16 hex chars and not the raw values.
  assert.match(authReq.session.ip, /^[0-9a-f]{16}$/);
  assert.notEqual(authReq.session.ip, baseReq.ip);
});

test('stampSession: re-stamp is a no-op within the refresh window when prints are unchanged', () => {
  const req = {
    ip: '203.0.113.7',
    headers: { 'user-agent': 'Mozilla/5.0 (Test Runner)' },
    connection: {},
    session: { accountId: '111' },
  };
  assert.equal(stampSession(req), true, 'first stamp writes');
  const firstStampedAt = req.session.fpStampedAt;
  assert.equal(stampSession(req), false, 'second stamp within window is a no-op');
  assert.equal(req.session.fpStampedAt, firstStampedAt, 'timestamp unchanged');
});

// End-to-end: drive the actual middleware writer into a synthetic
// user_sessions store, then read it back through the index and prove the
// overlap math fires. This is the round-trip Task #501 cares about.
test('round-trip: middleware-written prints overlap through the scorer', async () => {
  // Two accounts signing in from the same machine (same ip + ua).
  const sharedReqShape = {
    ip: '198.51.100.42',
    headers: { 'user-agent': 'Mozilla/5.0 (Shared Machine)' },
    connection: {},
  };
  const reqA = { ...sharedReqShape, session: { accountId: '777' } };
  const reqB = { ...sharedReqShape, session: { accountId: '888' } };

  stampSession(reqA);
  stampSession(reqB);

  // Persist the stamped sessions exactly as connect-pg-simple would.
  const sessionRows = [
    { sess: reqA.session },
    { sess: reqB.session },
  ];
  const pool = makePool({ sessionRows });

  const idx = await smurf._buildSessionFingerprintIndex(pool);
  const { signals } = await smurf.scoreAccount(pool, '777', { sessionFingerprintIndex: idx });
  const fp = signals.fingerprint;

  assert.ok(fp.contribution > 0, 'middleware-written prints overlap and contribute');
  assert.match(fp.detail, /888/, 'partner named from middleware-written session');
  // Both ip and ua match → 2 overlapping prints.
  assert.equal(fp.partners[0].hits, 2);
});
