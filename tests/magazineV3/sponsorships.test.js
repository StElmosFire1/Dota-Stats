'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDb } = require('../../src/monetization/magazineV3/sponsorships');
const { makePool } = require('./_helpers');

test('sponsorships.createSponsorshipPending: defaults slot_type and writes pending_payment', async () => {
  let sql, params;
  const pool = makePool([
    { match: 'INSERT INTO org_sponsorships',
      respond: (p, s) => { sql = s; params = p; return [{ id: 1, status: 'pending_payment' }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const r = await db.createSponsorshipPending({
    sponsorAccountId: 1, targetAccountId: 2,
    headline: 'Hi', stripeSessionId: 'cs_x',
  });
  assert.equal(r.status, 'pending_payment');
  // [sponsor, target, slot_type, headline, body_md, image_url, link_url, session]
  assert.deepEqual(params, [1, 2, 'profile_chip', 'Hi', null, null, null, 'cs_x']);
  assert.match(sql, /'pending_payment'/);
});

test('sponsorships.createSponsorshipPending: passes through optional fields', async () => {
  let params;
  const pool = makePool([
    { match: 'INSERT INTO org_sponsorships',
      respond: (p) => { params = p; return [{ id: 1 }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  await db.createSponsorshipPending({
    sponsorAccountId: 1, targetAccountId: 2, slotType: 'banner',
    headline: 'Hi', bodyMd: '**body**', imageUrl: 'https://i', linkUrl: 'https://l',
    stripeSessionId: 'cs',
  });
  assert.equal(params[2], 'banner');
  assert.equal(params[4], '**body**');
  assert.equal(params[5], 'https://i');
  assert.equal(params[6], 'https://l');
});

test('sponsorships.markSponsorshipPaid: pending_payment -> pending_moderation status logic', async () => {
  let sql, params;
  const pool = makePool([
    { match: 'UPDATE org_sponsorships',
      respond: (p, s) => { sql = s; params = p; return [{ id: 1, status: 'pending_moderation' }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const r = await db.markSponsorshipPaid('cs_x', 'sub_y');
  assert.equal(r.status, 'pending_moderation');
  assert.deepEqual(params, ['cs_x', 'sub_y']);
  // Status only flips when the row is currently pending_payment.
  assert.match(sql, /CASE WHEN status = 'pending_payment' THEN 'pending_moderation' ELSE status END/);
});

test('sponsorships.markSponsorshipPaid: returns null when no row matches', async () => {
  const pool = makePool([
    { match: 'UPDATE org_sponsorships', respond: () => [] },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  assert.equal(await db.markSponsorshipPaid('cs_missing', null), null);
});

test('sponsorships.moderateSponsorship: approve -> pending_acceptance, reject -> rejected', async () => {
  let sql, params;
  const pool = makePool([
    { match: 'UPDATE org_sponsorships',
      respond: (p, s) => { sql = s; params = p; return [{ id: p[0], status: p[1] }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const a = await db.moderateSponsorship(7, { approve: true, moderatorAccountId: 99, notes: 'ok' });
  assert.equal(a.status, 'pending_acceptance');
  assert.deepEqual(params, [7, 'pending_acceptance', 99, 'ok']);
  const r = await db.moderateSponsorship(8, { approve: false, moderatorAccountId: 99 });
  assert.equal(r.status, 'rejected');
  assert.equal(params[3], null, 'missing notes -> null');
  assert.match(sql, /SET status = \$2/);
});

test('sponsorships.acceptSponsorship: target-account binding + pending_acceptance gate', async () => {
  let sql, params;
  const pool = makePool([
    { match: 'UPDATE org_sponsorships',
      respond: (p, s) => { sql = s; params = p; return [{ id: p[0], status: 'active' }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const r = await db.acceptSponsorship(5, 42);
  assert.equal(r.status, 'active');
  assert.deepEqual(params, [5, 42]);
  assert.match(sql, /WHERE id = \$1 AND target_account_id = \$2 AND status = 'pending_acceptance'/);
  assert.match(sql, /30 days/, 'default 30-day expiry');
});

test('sponsorships.acceptSponsorship: returns null when target mismatch', async () => {
  const pool = makePool([
    { match: 'UPDATE org_sponsorships', respond: () => [] },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  assert.equal(await db.acceptSponsorship(1, 999), null);
});

test('sponsorships.declineSponsorship: only declines pending or active rows for the target', async () => {
  let sql, params;
  const pool = makePool([
    { match: 'UPDATE org_sponsorships',
      respond: (p, s) => { sql = s; params = p; return [{ id: 1, status: 'declined' }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const r = await db.declineSponsorship(1, 7);
  assert.equal(r.status, 'declined');
  assert.deepEqual(params, [1, 7]);
  assert.match(sql, /status IN \('pending_acceptance','active'\)/);
});

test('sponsorships.getActiveSponsorshipsForTarget: returns [] for missing accountId', async () => {
  const pool = makePool([], { strict: true });
  const db = createDb({ getPool: () => pool });
  assert.deepEqual(await db.getActiveSponsorshipsForTarget(0), []);
  assert.equal(pool.calls.length, 0);
});

test('sponsorships.getActiveSponsorshipsForTarget: SQL filters status=active and expiry', async () => {
  let sql;
  const pool = makePool([
    { match: 'FROM org_sponsorships',
      respond: (_p, s) => { sql = s; return [{ id: 1 }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const out = await db.getActiveSponsorshipsForTarget(7);
  assert.equal(out.length, 1);
  assert.match(sql, /status = 'active'/);
  assert.match(sql, /expires_at IS NULL OR expires_at > NOW\(\)/);
});

test('sponsorships.isApprovedOrgSponsor: rowCount >0 -> true, else false', async () => {
  const yes = createDb({ getPool: () => makePool([
    { match: 'FROM org_sponsors', respond: () => ({ rows: [{ '?column?': 1 }], rowCount: 1 }) },
  ], { strict: true }) });
  const no = createDb({ getPool: () => makePool([
    { match: 'FROM org_sponsors', respond: () => ({ rows: [], rowCount: 0 }) },
  ], { strict: true }) });
  assert.equal(await yes.isApprovedOrgSponsor(1), true);
  assert.equal(await no.isApprovedOrgSponsor(1), false);
});

test('sponsorships.isApprovedOrgSponsor: short-circuits without accountId', async () => {
  const pool = makePool([], { strict: true });
  const db = createDb({ getPool: () => pool });
  assert.equal(await db.isApprovedOrgSponsor(0), false);
  assert.equal(pool.calls.length, 0);
});

test('sponsorships.createOrgSponsorApplication: forwards 5 params in order', async () => {
  let params;
  const pool = makePool([
    { match: 'INSERT INTO org_sponsors',
      respond: (p) => { params = p; return [{ id: 1, status: 'pending_review' }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  await db.createOrgSponsorApplication({
    ownerAccountId: 1, orgName: 'Acme',
    website: 'https://acme', contactEmail: 'x@y.z', description: 'we sell',
  });
  assert.deepEqual(params, [1, 'Acme', 'https://acme', 'x@y.z', 'we sell']);
});

test('sponsorships.moderateOrgSponsor: approve -> approved, reject -> rejected', async () => {
  let params;
  const pool = makePool([
    { match: 'UPDATE org_sponsors',
      respond: (p) => { params = p; return [{ id: 1, status: p[1] }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const a = await db.moderateOrgSponsor(5, { approve: true, moderatorAccountId: 9, notes: 'ok' });
  assert.equal(a.status, 'approved');
  assert.deepEqual(params, [5, 'approved', 9, 'ok']);
  const r = await db.moderateOrgSponsor(6, { approve: false, moderatorAccountId: 9 });
  assert.equal(r.status, 'rejected');
});
