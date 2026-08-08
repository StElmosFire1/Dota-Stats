// Task #915 — refunding a gifted season pass claws back the 500 XP gift bonus.
//
// Exercises the REAL db helpers (markSeasonPassRefundedByIntent and
// reconcileRefundedSeasonPasses) against a stubbed `pg` Pool implementing a
// tiny in-memory model of the two tables, so we can assert semantics rather
// than just SQL strings:
//   - the status flip and the gift XP DELETE are ONE atomic statement (a
//     failure leaves the row active, so Stripe retries the whole thing —
//     no state where the pass is refunded but the XP survived)
//   - webhook retries are idempotent
//   - self-purchased passes never touch the XP ledger
//   - the reconciliation repair pass removes lingering gift XP from passes
//     that are already refunded (crash/pre-fix rows)

const test = require('node:test');
const assert = require('node:assert/strict');

// ── in-memory model ────────────────────────────────────────────────────────
const state = {
  passes: [],   // season_pass_purchases rows
  xp: [],       // season_pass_xp_events rows
  gifts: [],    // gift_purchases rows
  refundedIntents: new Set(),
  failAtomicFlip: false,
};

function _clawbackFor(flipped) {
  let n = 0;
  for (const f of flipped) {
    if (!f.gift_stripe_session_id) continue;
    const src = 'gift_' + String(f.gift_stripe_session_id).slice(-8);
    const before = state.xp.length;
    state.xp = state.xp.filter(e => !(
      e.account_id === f.account_id && e.season_number === f.season_number &&
      e.match_id == null && e.source === src
    ));
    n += before - state.xp.length;
  }
  return n;
}

class FakePool {
  async query(sql, params) {
    sql = String(sql);
    // Atomic flip + clawback CTE (webhook path, param = payment intent)
    if (sql.includes('WITH flipped AS') && sql.includes('stripe_payment_intent = $1')) {
      if (state.failAtomicFlip) throw new Error('db down');
      const flipped = state.passes.filter(r => r.stripe_payment_intent === params[0] && r.status === 'active');
      flipped.forEach(r => { r.status = 'refunded'; });
      _clawbackFor(flipped);
      return { rows: flipped.map(r => ({ ...r })), rowCount: flipped.length };
    }
    // Atomic flip + clawback CTE (reconciliation path, joins refunded intents)
    if (sql.includes('WITH flipped AS') && sql.includes('stripe_refunded_intents')) {
      const flipped = state.passes.filter(r => state.refundedIntents.has(r.stripe_payment_intent) && r.status === 'active');
      flipped.forEach(r => { r.status = 'refunded'; });
      _clawbackFor(flipped);
      return { rows: flipped.map(r => ({ ...r })), rowCount: flipped.length };
    }
    // Reconciliation repair pass: lingering XP on already-refunded gift passes
    if (sql.includes('DELETE FROM season_pass_xp_events') && sql.includes("spp.status = 'refunded'")) {
      const refundedGifts = state.passes.filter(r => r.status === 'refunded' && r.gift_stripe_session_id);
      const removedRows = [];
      for (const f of refundedGifts) {
        const src = 'gift_' + String(f.gift_stripe_session_id).slice(-8);
        state.xp = state.xp.filter(e => {
          const match = e.account_id === f.account_id && e.season_number === f.season_number &&
            e.match_id == null && e.source === src;
          if (match) removedRows.push({ account_id: e.account_id, season_number: e.season_number });
          return !match;
        });
      }
      return { rows: removedRows, rowCount: removedRows.length };
    }
    if (sql.includes('UPDATE gift_purchases')) {
      const g = state.gifts.find(g => g.stripe_session_id === params[0] && g.status === 'completed');
      if (g) g.status = 'refunded';
      return { rows: [], rowCount: g ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  }
}

const pgPath = require.resolve('pg');
delete require.cache[pgPath];
require.cache[pgPath] = { id: pgPath, filename: pgPath, loaded: true, exports: { Pool: FakePool } };
delete require.cache[require.resolve('../src/db/index.js')];
const db = require('../src/db/index.js');

function seedGiftPass() {
  state.passes = [{
    account_id: '222', season_number: 12, stripe_session_id: null,
    gift_stripe_session_id: 'cs_test_gift_abcdefgh', source: 'gift',
    status: 'active', stripe_payment_intent: 'pi_gift_1',
  }];
  state.xp = [{ account_id: '222', season_number: 12, match_id: null, source: 'gift_abcdefgh', xp_delta: 500 }];
  state.gifts = [{ stripe_session_id: 'cs_test_gift_abcdefgh', status: 'completed' }];
  state.refundedIntents = new Set();
  state.failAtomicFlip = false;
}

test('refund of a gifted pass atomically revokes the pass AND removes the gift XP', async () => {
  seedGiftPass();
  const flipped = await db.markSeasonPassRefundedByIntent('pi_gift_1');
  assert.equal(flipped.length, 1);
  assert.equal(state.passes[0].status, 'refunded');
  assert.equal(state.xp.length, 0, 'gift XP event must be deleted');
  assert.equal(state.gifts[0].status, 'refunded');
});

test('webhook retry is a no-op', async () => {
  seedGiftPass();
  await db.markSeasonPassRefundedByIntent('pi_gift_1');
  const again = await db.markSeasonPassRefundedByIntent('pi_gift_1');
  assert.equal(again.length, 0);
  assert.equal(state.xp.length, 0);
});

test('self-purchase refund leaves unrelated XP untouched', async () => {
  seedGiftPass();
  state.passes[0].gift_stripe_session_id = null;
  state.passes[0].stripe_session_id = 'cs_self_1';
  state.passes[0].source = 'purchase';
  // player has some non-gift XP
  state.xp = [{ account_id: '222', season_number: 12, match_id: 'm1', source: 'win', xp_delta: 100 }];
  const flipped = await db.markSeasonPassRefundedByIntent('pi_gift_1');
  assert.equal(flipped.length, 1);
  assert.equal(state.xp.length, 1, 'non-gift XP must survive');
});

test('flip failure keeps the pass active — nothing half-done, Stripe retries succeed', async () => {
  seedGiftPass();
  state.failAtomicFlip = true;
  await assert.rejects(() => db.markSeasonPassRefundedByIntent('pi_gift_1'));
  assert.equal(state.passes[0].status, 'active', 'atomic statement failed → no partial flip');
  assert.equal(state.xp.length, 1, 'XP untouched on failure');
  // retry after recovery
  state.failAtomicFlip = false;
  const flipped = await db.markSeasonPassRefundedByIntent('pi_gift_1');
  assert.equal(flipped.length, 1);
  assert.equal(state.xp.length, 0, 'retry claws back the XP');
});

test('reconciliation flips missed passes and claws back XP atomically', async () => {
  seedGiftPass();
  state.refundedIntents.add('pi_gift_1');
  const flipped = await db.reconcileRefundedSeasonPasses();
  assert.equal(flipped.length, 1);
  assert.equal(state.passes[0].status, 'refunded');
  assert.equal(state.xp.length, 0);
});

test('reconciliation repair pass removes lingering XP on already-refunded gifted passes', async () => {
  seedGiftPass();
  // Simulate a pre-fix refund: pass already refunded but XP survived.
  state.passes[0].status = 'refunded';
  const flipped = await db.reconcileRefundedSeasonPasses();
  assert.equal(flipped.length, 0, 'nothing newly flipped');
  assert.equal(state.xp.length, 0, 'lingering gift XP repaired');
});
