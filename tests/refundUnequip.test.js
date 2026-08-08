// Task #910 — equip-then-refund: revoking a Stripe-bought frame or founder
// ring must also clear the equipped slot when the player no longer owns the
// cosmetic, and must LEAVE it equipped when it's still owned via another
// source (coin purchase, second entitlement).
//
// Uses the fake-pg-pool pattern from foundersRingCap.test.js: stub `pg`
// before requiring ../src/db so getPool() binds to an in-memory fixture that
// applies the WHERE semantics of every query the refund helpers issue.

const test = require('node:test');
const assert = require('node:assert/strict');

function makeFakePool(state) {
  // state: {
  //   framePurchases: [{ account_id, frame_id, status, stripe_payment_intent }],
  //   entitlements:   [{ account_id, sku, granted_by, revoked_at, payment_intent }],
  //   coinCosmetics:  [{ account_id, kind, value }],
  //   proAccounts:    Set<accountId>,
  //   profiles:       Map<accountId, { profile_frame, equipped_founder_ring }>,
  // }
  return {
    async query(sqlRaw, params = []) {
      const sql = String(sqlRaw).replace(/\s+/g, ' ').trim();

      // markFramePurchasesRefundedByIntent — flip active rows.
      if (sql.startsWith('UPDATE frame_purchases SET status = \'refunded\'')) {
        const [pi] = params;
        const hit = state.framePurchases.filter(
          r => r.stripe_payment_intent === pi && r.status === 'active');
        for (const r of hit) r.status = 'refunded';
        return { rows: hit.map(r => ({ ...r })), rowCount: hit.length };
      }

      // isProMember
      if (sql.includes('FROM pro_subscriptions')) {
        const [accountId] = params;
        const pro = state.proAccounts.has(accountId);
        return { rows: pro ? [{ '?column?': 1 }] : [], rowCount: pro ? 1 : 0 };
      }

      // hasCoinCosmetic
      if (sql.includes('SELECT 1 FROM coin_owned_cosmetics')) {
        const [accountId, kind, value] = params;
        const hit = state.coinCosmetics.some(
          c => c.account_id === accountId && c.kind === kind && c.value === value);
        return { rows: hit ? [{ '?column?': 1 }] : [], rowCount: hit ? 1 : 0 };
      }

      // hasFrameUnlocked — active frame purchase lookup
      if (sql.includes('SELECT 1 FROM frame_purchases')) {
        const [accountId, frameId] = params;
        const hit = state.framePurchases.some(
          r => r.account_id === accountId && r.frame_id === frameId && r.status === 'active');
        return { rows: hit ? [{ '?column?': 1 }] : [], rowCount: hit ? 1 : 0 };
      }

      // Task #910 unequip — clear the equipped frame if it matches.
      if (sql.startsWith('UPDATE player_profiles SET profile_frame = NULL')) {
        const [accountId, frameId] = params;
        const prof = state.profiles.get(accountId);
        let n = 0;
        if (prof && prof.profile_frame === frameId) { prof.profile_frame = null; n = 1; }
        return { rows: [], rowCount: n };
      }

      // markFounderRingsRefundedByIntent — revoke matching entitlements.
      if (sql.startsWith('UPDATE entitlements SET revoked_at = NOW()')) {
        const [pi] = params;
        const hit = state.entitlements.filter(e =>
          e.payment_intent === pi && e.granted_by === 'stripe' && e.revoked_at == null &&
          (e.sku.startsWith('founder_ring:') || e.sku === 'founders_pass_ring'));
        for (const e of hit) e.revoked_at = '2026-08-08T00:00:00Z';
        return { rows: hit.map(e => ({ ...e })), rowCount: hit.length };
      }

      // listOwnedFounderRings — non-revoked ring entitlements.
      if (sql.startsWith('SELECT sku FROM entitlements')) {
        const [accountId] = params;
        const rows = state.entitlements
          .filter(e => e.account_id === accountId && e.revoked_at == null &&
            (e.sku === 'founders_pass_ring' || e.sku.startsWith('founder_ring:')))
          .map(e => ({ sku: e.sku }));
        return { rows, rowCount: rows.length };
      }

      // listOwnedFounderRings — coin-bought rings.
      if (sql.startsWith('SELECT value FROM coin_owned_cosmetics')) {
        const [accountId] = params;
        const rows = state.coinCosmetics
          .filter(c => c.account_id === accountId && c.kind === 'founder_ring')
          .map(c => ({ value: c.value }));
        return { rows, rowCount: rows.length };
      }

      // Task #910 unequip — clear the equipped ring if it matches.
      if (sql.startsWith('UPDATE player_profiles SET equipped_founder_ring = NULL')) {
        const [accountId, slug] = params;
        const prof = state.profiles.get(accountId);
        let n = 0;
        if (prof && prof.equipped_founder_ring === slug) { prof.equipped_founder_ring = null; n = 1; }
        return { rows: [], rowCount: n };
      }

      throw new Error('unexpected query in fake pool: ' + sql.slice(0, 100));
    },
  };
}

function loadDbWithFakePool(fakePool) {
  delete require.cache[require.resolve('pg')];
  delete require.cache[require.resolve('../src/db')];
  delete require.cache[require.resolve('../src/db/index.js')];
  require.cache[require.resolve('pg')] = {
    id: require.resolve('pg'),
    filename: require.resolve('pg'),
    loaded: true,
    exports: { Pool: function FakePool() { return fakePool; } },
  };
  return require('../src/db');
}

function baseState() {
  return {
    framePurchases: [],
    entitlements: [],
    coinCosmetics: [],
    proAccounts: new Set(),
    profiles: new Map(),
  };
}

test('frame refund clears the equipped frame when no other ownership source remains', async () => {
  const state = baseState();
  state.framePurchases.push({ account_id: 101, frame_id: 'cosmic', status: 'active', stripe_payment_intent: 'pi_frame_1' });
  state.profiles.set(101, { profile_frame: 'cosmic', equipped_founder_ring: null });
  const db = loadDbWithFakePool(makeFakePool(state));

  const refunded = await db.markFramePurchasesRefundedByIntent('pi_frame_1');
  assert.equal(refunded.length, 1);
  assert.equal(state.framePurchases[0].status, 'refunded');
  assert.equal(state.profiles.get(101).profile_frame, null,
    'equipped frame must be cleared after the refund revokes ownership');
});

test('frame refund leaves a DIFFERENT equipped frame untouched', async () => {
  const state = baseState();
  state.framePurchases.push({ account_id: 102, frame_id: 'fire', status: 'active', stripe_payment_intent: 'pi_frame_2' });
  state.profiles.set(102, { profile_frame: 'cosmic', equipped_founder_ring: null });
  const db = loadDbWithFakePool(makeFakePool(state));

  await db.markFramePurchasesRefundedByIntent('pi_frame_2');
  assert.equal(state.profiles.get(102).profile_frame, 'cosmic',
    'a frame other than the refunded one must stay equipped');
});

test('frame refund keeps the frame equipped when still owned via coins', async () => {
  const state = baseState();
  state.framePurchases.push({ account_id: 103, frame_id: 'cosmic', status: 'active', stripe_payment_intent: 'pi_frame_3' });
  state.coinCosmetics.push({ account_id: 103, kind: 'frame', value: 'cosmic' });
  state.profiles.set(103, { profile_frame: 'cosmic', equipped_founder_ring: null });
  const db = loadDbWithFakePool(makeFakePool(state));

  await db.markFramePurchasesRefundedByIntent('pi_frame_3');
  assert.equal(state.framePurchases[0].status, 'refunded');
  assert.equal(state.profiles.get(103).profile_frame, 'cosmic',
    'coin ownership must keep the frame equipped after a Stripe refund');
});

test('ring refund clears the equipped founder ring (per-slug SKU)', async () => {
  const state = baseState();
  state.entitlements.push({ account_id: 201, sku: 'founder_ring:phoenix', granted_by: 'stripe', revoked_at: null, payment_intent: 'pi_ring_1' });
  state.profiles.set(201, { profile_frame: null, equipped_founder_ring: 'phoenix' });
  const db = loadDbWithFakePool(makeFakePool(state));

  const revoked = await db.markFounderRingsRefundedByIntent('pi_ring_1');
  assert.equal(revoked.length, 1);
  assert.equal(state.profiles.get(201).equipped_founder_ring, null,
    'equipped ring must be cleared after the refund revokes the entitlement');
});

test('founders_pass_ring refund clears an equipped "inscribed" ring', async () => {
  const state = baseState();
  state.entitlements.push({ account_id: 202, sku: 'founders_pass_ring', granted_by: 'stripe', revoked_at: null, payment_intent: 'pi_ring_2' });
  state.profiles.set(202, { profile_frame: null, equipped_founder_ring: 'inscribed' });
  const db = loadDbWithFakePool(makeFakePool(state));

  await db.markFounderRingsRefundedByIntent('pi_ring_2');
  assert.equal(state.profiles.get(202).equipped_founder_ring, null,
    'founders_pass_ring maps to the inscribed slug and must unequip it');
});

test('ring refund keeps the ring equipped when still owned via coins', async () => {
  const state = baseState();
  state.entitlements.push({ account_id: 203, sku: 'founder_ring:laurel', granted_by: 'stripe', revoked_at: null, payment_intent: 'pi_ring_3' });
  state.coinCosmetics.push({ account_id: 203, kind: 'founder_ring', value: 'laurel' });
  state.profiles.set(203, { profile_frame: null, equipped_founder_ring: 'laurel' });
  const db = loadDbWithFakePool(makeFakePool(state));

  await db.markFounderRingsRefundedByIntent('pi_ring_3');
  assert.equal(state.entitlements[0].revoked_at != null, true);
  assert.equal(state.profiles.get(203).equipped_founder_ring, 'laurel',
    'coin ownership must keep the ring equipped after a Stripe refund');
});

test('ring refund leaves a DIFFERENT equipped ring untouched', async () => {
  const state = baseState();
  state.entitlements.push({ account_id: 204, sku: 'founder_ring:storm', granted_by: 'stripe', revoked_at: null, payment_intent: 'pi_ring_4' });
  state.profiles.set(204, { profile_frame: null, equipped_founder_ring: 'classic' });
  const db = loadDbWithFakePool(makeFakePool(state));

  await db.markFounderRingsRefundedByIntent('pi_ring_4');
  assert.equal(state.profiles.get(204).equipped_founder_ring, 'classic',
    'a ring other than the refunded one must stay equipped');
});
