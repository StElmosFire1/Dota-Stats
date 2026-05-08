'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDb } = require('../../src/monetization/magazineV3/verifiedBadge');
const { makePool } = require('./_helpers');

test('verifiedBadge._generateChallengeCode: OI-prefixed 16 hex chars', () => {
  const db = createDb({ getPool: () => makePool([]) });
  for (let i = 0; i < 50; i++) {
    const code = db._generateChallengeCode();
    assert.match(code, /^OI-[0-9A-F]{16}$/);
  }
  // Statistically distinct.
  const set = new Set(Array.from({ length: 100 }, () => db._generateChallengeCode()));
  assert.equal(set.size, 100);
});

test('verifiedBadge.createVerificationChallenge: rejects bad provider', async () => {
  const db = createDb({ getPool: () => makePool([], { strict: true }) });
  await assert.rejects(
    () => db.createVerificationChallenge({
      accountId: 1, provider: 'bogus', handle: 'h', proofUrl: 'https://example.com',
    }),
    /Bad provider/,
  );
});

test('verifiedBadge.createVerificationChallenge: accepts steam (special-cased)', async () => {
  const pool = makePool([
    { match: 'INSERT INTO verified_badge_challenges', respond: (p) => [{ id: 1, provider: p[1] }] },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const r = await db.createVerificationChallenge({
    accountId: 1, provider: 'steam', handle: 'h', proofUrl: 'https://steamcommunity.com/id/x',
  });
  assert.equal(r.provider, 'steam');
});

test('verifiedBadge.createVerificationChallenge: rejects non-http proofUrl', async () => {
  const db = createDb({ getPool: () => makePool([], { strict: true }) });
  await assert.rejects(
    () => db.createVerificationChallenge({
      accountId: 1, provider: 'twitter', handle: 'h', proofUrl: 'javascript:alert(1)',
    }),
    /must be http/,
  );
});

test('verifiedBadge.createVerificationChallenge: rejects bad handle', async () => {
  const db = createDb({ getPool: () => makePool([], { strict: true }) });
  await assert.rejects(
    () => db.createVerificationChallenge({
      accountId: 1, provider: 'twitter', handle: '', proofUrl: 'https://x.com/x',
    }),
    /Bad handle/,
  );
  await assert.rejects(
    () => db.createVerificationChallenge({
      accountId: 1, provider: 'twitter', handle: 'a'.repeat(200), proofUrl: 'https://x.com/x',
    }),
    /Bad handle/,
  );
});

test('verifiedBadge.createVerificationChallenge: persists generated code in INSERT', async () => {
  let captured;
  const pool = makePool([
    { match: 'INSERT INTO verified_badge_challenges',
      respond: (p) => { captured = p; return [{ id: 1, challenge_code: p[4] }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const r = await db.createVerificationChallenge({
    accountId: 7, provider: 'twitch', handle: 'me', proofUrl: 'https://twitch.tv/me',
  });
  assert.match(r.challenge_code, /^OI-[0-9A-F]{16}$/);
  assert.deepEqual(captured.slice(0, 4), [7, 'twitch', 'me', 'https://twitch.tv/me']);
});

test('verifiedBadge.completeVerificationChallenge: returns null when no row updated', async () => {
  const pool = makePool([
    { match: 'UPDATE verified_badge_challenges', respond: () => [] },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  assert.equal(await db.completeVerificationChallenge(123), null);
});

test('verifiedBadge.completeVerificationChallenge: upserts verified_badges as code_challenge', async () => {
  let badgeUpsertSql, badgeUpsertParams;
  const pool = makePool([
    { match: 'UPDATE verified_badge_challenges',
      respond: () => [{ id: 1, account_id: 9, provider: 'twitter', handle: 'me' }] },
    { match: 'INSERT INTO verified_badges',
      respond: (p, sql) => { badgeUpsertSql = sql; badgeUpsertParams = p; return []; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const r = await db.completeVerificationChallenge(1);
  assert.equal(r.account_id, 9);
  assert.deepEqual(badgeUpsertParams, [9, 'twitter', 'me']);
  assert.match(badgeUpsertSql, /'code_challenge'/);
  assert.match(badgeUpsertSql, /'verified'/);
  assert.match(badgeUpsertSql, /180 days/);
});

test('verifiedBadge.getVerifiedBadges: short-circuits when no accountId', async () => {
  const pool = makePool([], { strict: true });
  const db = createDb({ getPool: () => pool });
  assert.deepEqual(await db.getVerifiedBadges(0), []);
  assert.equal(pool.calls.length, 0);
});

test('verifiedBadge.getVerifiedBadges: SQL filters status=verified AND revoked_at IS NULL', async () => {
  // Round-6 hardening regression — both filters must be present.
  let captured;
  const pool = makePool([
    { match: 'FROM verified_badges', respond: (_p, sql) => { captured = sql; return []; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  await db.getVerifiedBadges(1);
  assert.match(captured, /status = 'verified'/);
  assert.match(captured, /revoked_at IS NULL/);
  assert.match(captured, /expires_at IS NULL OR expires_at > NOW\(\)/);
});

test('verifiedBadge.createPendingVerificationRequest: writes pending status with revoked_at=NOW()', async () => {
  let sql;
  const pool = makePool([
    { match: 'INSERT INTO verified_badges',
      respond: (_p, s) => { sql = s; return [{ id: 1, status: 'pending' }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const r = await db.createPendingVerificationRequest({
    accountId: 1, provider: 'twitter', handle: 'h', oneOffPerkId: 99,
  });
  assert.equal(r.status, 'pending');
  assert.match(sql, /'pending'/);
  assert.match(sql, /'paid'/);
  assert.match(sql, /NOW\(\)/);
});

test('verifiedBadge.approveVerification: only matches status=pending and 180-day expiry', async () => {
  let sql, params;
  const pool = makePool([
    { match: 'UPDATE verified_badges',
      respond: (p, s) => { sql = s; params = p; return [{ id: 1, status: 'verified' }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const r = await db.approveVerification(1, 42);
  assert.equal(r.status, 'verified');
  assert.deepEqual(params, [1, 42]);
  assert.match(sql, /WHERE id = \$1 AND status = 'pending'/);
  assert.match(sql, /'verified'/);
  assert.match(sql, /180 days/);
});

test('verifiedBadge.approveVerification: returns null when no pending row matches', async () => {
  const pool = makePool([
    { match: 'UPDATE verified_badges', respond: () => [] },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  assert.equal(await db.approveVerification(1, 42), null);
});

test('verifiedBadge.rejectVerification: sets status=rejected and revokes', async () => {
  let sql;
  const pool = makePool([
    { match: 'UPDATE verified_badges',
      respond: (_p, s) => { sql = s; return [{ status: 'rejected' }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const r = await db.rejectVerification(1, 42, 'spam');
  assert.equal(r.status, 'rejected');
  assert.match(sql, /'rejected'/);
  assert.match(sql, /revoked_at = NOW\(\)/);
});

test('verifiedBadge.expireStaleVerifiedBadges: returns flipped rows', async () => {
  let sql;
  const pool = makePool([
    { match: 'UPDATE verified_badges',
      respond: (_p, s) => { sql = s; return [{ id: 1 }, { id: 2 }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const out = await db.expireStaleVerifiedBadges();
  assert.equal(out.length, 2);
  assert.match(sql, /SET status = 'pending'/);
  assert.match(sql, /expires_at < NOW\(\)/);
});

test('verifiedBadge.upsertVerifiedBadge: forwards 6 documented params in order', async () => {
  let captured;
  const pool = makePool([
    { match: 'INSERT INTO verified_badges',
      respond: (p) => { captured = p; return [{ id: 1 }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  await db.upsertVerifiedBadge({
    accountId: 1, provider: 'twitter', handle: 'h',
    source: 'oauth', oneOffPerkId: 99, expiresAt: '2030-01-01',
  });
  assert.deepEqual(captured, [1, 'twitter', 'h', 'oauth', 99, '2030-01-01']);
});

test('verifiedBadge.listPendingVerifications: status=pending only', async () => {
  let sql;
  const pool = makePool([
    { match: 'FROM verified_badges',
      respond: (_p, s) => { sql = s; return [{ id: 1 }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const out = await db.listPendingVerifications();
  assert.equal(out.length, 1);
  assert.match(sql, /WHERE status = 'pending'/);
});
