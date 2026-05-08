'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDb } = require('../../src/monetization/magazineV3/oneOffPerks');
const { makePool } = require('./_helpers');

test('oneOffPerks.grantOneOffPerk: required-arg validation', async () => {
  const db = createDb({ getPool: () => makePool([]) });
  await assert.rejects(() => db.grantOneOffPerk({ perkKey: 'x' }), /accountId required/);
  await assert.rejects(() => db.grantOneOffPerk({ accountId: 1 }), /perkKey required/);
});

test('oneOffPerks.grantOneOffPerk: fresh insert when no pending row exists', async () => {
  const pool = makePool([
    { match: 'SELECT * FROM user_one_off_perks WHERE stripe_session_id', respond: () => [] },
    { match: 'INSERT INTO user_one_off_perks', respond: (p) => [{ id: 1, account_id: p[0], perk_key: p[1], source: p[2] }] },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const row = await db.grantOneOffPerk({
    accountId: 7, perkKey: 'cosmetic:foo', source: 'stripe',
    stripeSessionId: 'cs_new', stripePaymentIntent: 'pi_x',
    amountCents: 500, currency: 'aud', metadata: { a: 1 },
  });
  assert.equal(row.id, 1);
  // Verify the insert got the full 9-arg row in the documented order.
  const insert = pool.calls.find(c => c.sql.startsWith('INSERT'));
  assert.deepEqual(insert.params.slice(0, 8),
    [7, 'cosmetic:foo', 'stripe', 'cs_new', 'pi_x', 500, 'aud', null]);
  // metadata must be JSON-stringified.
  assert.equal(insert.params[8], JSON.stringify({ a: 1 }));
});

test('oneOffPerks.grantOneOffPerk: returns existing active row without re-inserting', async () => {
  const existing = { id: 99, account_id: 1, perk_key: 'k', revoked_at: null };
  const pool = makePool([
    { match: 'SELECT * FROM user_one_off_perks WHERE stripe_session_id', respond: () => [existing] },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const out = await db.grantOneOffPerk({
    accountId: 1, perkKey: 'k', stripeSessionId: 'cs_dupe',
  });
  assert.equal(out, existing);
  // No INSERT/UPDATE call — idempotent.
  assert.ok(!pool.calls.find(c => /INSERT|UPDATE/i.test(c.sql.slice(0, 10))));
});

test('oneOffPerks.grantOneOffPerk: activates pending row via UPDATE not INSERT', async () => {
  const pending = { id: 17, revoked_at: new Date('2020-01-01') };
  const pool = makePool([
    { match: 'SELECT * FROM user_one_off_perks WHERE stripe_session_id', respond: () => [pending] },
    { match: 'UPDATE user_one_off_perks', respond: (p) => [{ id: p[0], source: p[1], revoked_at: null }] },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const out = await db.grantOneOffPerk({
    accountId: 1, perkKey: 'k', stripeSessionId: 'cs_act',
    source: 'stripe', stripePaymentIntent: 'pi_act',
    amountCents: 700, currency: 'aud',
  });
  assert.equal(out.id, 17);
  assert.equal(out.revoked_at, null);
  const upd = pool.calls.find(c => c.sql.startsWith('UPDATE'));
  // [id, source, paymentIntent, amount, currency, expiresAt, metadata]
  assert.deepEqual(upd.params, [17, 'stripe', 'pi_act', 700, 'aud', null, null]);
});

test('oneOffPerks.hasOneOffPerk: short-circuits on missing args', async () => {
  const pool = makePool([], { strict: true });
  const db = createDb({ getPool: () => pool });
  assert.equal(await db.hasOneOffPerk(0, 'k'), false);
  assert.equal(await db.hasOneOffPerk(1, ''), false);
  assert.equal(pool.calls.length, 0);
});

test('oneOffPerks.hasOneOffPerk: SQL filters revoked + expiry', async () => {
  let captured;
  const pool = makePool([
    { match: 'SELECT 1 FROM user_one_off_perks', respond: (_p, sql) => { captured = sql; return [{ '?column?': 1 }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  assert.equal(await db.hasOneOffPerk(1, 'k'), true);
  assert.match(captured, /revoked_at IS NULL/);
  assert.match(captured, /expires_at IS NULL OR expires_at > NOW\(\)/);
});

test('oneOffPerks.listOneOffPerks: filters by revoked and orders by granted_at DESC', async () => {
  let captured;
  const pool = makePool([
    { match: 'FROM user_one_off_perks', respond: (_p, sql) => { captured = sql; return [{ id: 1 }, { id: 2 }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const out = await db.listOneOffPerks(7);
  assert.equal(out.length, 2);
  assert.match(captured, /revoked_at IS NULL/);
  assert.match(captured, /ORDER BY granted_at DESC/);
});

test('oneOffPerks.listOneOffPerks: returns [] for missing accountId', async () => {
  const pool = makePool([], { strict: true });
  const db = createDb({ getPool: () => pool });
  assert.deepEqual(await db.listOneOffPerks(0), []);
  assert.equal(pool.calls.length, 0);
});

test('oneOffPerks.createOneOffPerkPending: required-arg validation', async () => {
  const db = createDb({ getPool: () => makePool([]) });
  await assert.rejects(() => db.createOneOffPerkPending({ perkKey: 'k', stripeSessionId: 's' }),
    /accountId required/);
  await assert.rejects(() => db.createOneOffPerkPending({ accountId: 1, stripeSessionId: 's' }),
    /perkKey required/);
  await assert.rejects(() => db.createOneOffPerkPending({ accountId: 1, perkKey: 'k' }),
    /stripeSessionId required/);
});

test('oneOffPerks.createOneOffPerkPending: returns existing row instead of inserting twice', async () => {
  const existing = { id: 5 };
  const pool = makePool([
    { match: 'SELECT * FROM user_one_off_perks WHERE stripe_session_id', respond: () => [existing] },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const out = await db.createOneOffPerkPending({
    accountId: 1, perkKey: 'k', stripeSessionId: 'cs_dupe',
  });
  assert.equal(out, existing);
  assert.equal(pool.calls.length, 1);
});

test('oneOffPerks.createOneOffPerkPending: writes stripe_pending status and revoked_at=NOW()', async () => {
  let insertSql;
  const pool = makePool([
    { match: 'SELECT * FROM user_one_off_perks WHERE stripe_session_id', respond: () => [] },
    { match: 'INSERT INTO user_one_off_perks',
      respond: (_p, sql) => { insertSql = sql; return [{ id: 1 }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  await db.createOneOffPerkPending({
    accountId: 1, perkKey: 'k', stripeSessionId: 'cs', amountCents: 500, currency: 'aud',
  });
  assert.match(insertSql, /'stripe_pending'/);
  assert.match(insertSql, /NOW\(\)/);
});
