// Task #916 — charge.refunded debits credited coins for coin packs and
// gifted coins. Exercises the REAL db helpers
// (markCoinPackPurchasesRefundedByIntent / markGiftCoinsRefundedByIntent /
// reconcileRefundedCoinPurchases) against a stubbed `pg` Pool implementing a
// tiny in-memory model, so we can assert semantics:
//   - the status flip and the coin debit happen in ONE transaction (a
//     failure rolls back both — Stripe retries the whole thing)
//   - the balance MAY GO NEGATIVE (policy: clamping would make refunds free
//     coins); coin_lifetime is reduced by the same amount
//   - webhook retries are idempotent (refunded rows don't match)
//   - gift debits read the granted amount from the recipient's own
//     coin_transactions grant row; a missing grant row still flips the gift
//     but debits nothing
//   - the reconciliation backstop debits rows whose intent is recorded in
//     stripe_refunded_intents

const test = require('node:test');
const assert = require('node:assert/strict');

// ── in-memory model ────────────────────────────────────────────────────────
const state = {
  packs: [],      // coin_pack_purchases rows
  gifts: [],      // gift_purchases rows
  txs: [],        // coin_transactions rows
  profiles: {},   // account_id → { coin_balance, coin_lifetime }
  refundedIntents: new Set(),
  failOnDebit: false,
};

function resetState() {
  state.packs = [];
  state.gifts = [];
  state.txs = [];
  state.profiles = {};
  state.refundedIntents = new Set();
  state.failOnDebit = false;
}

class FakeClient {
  constructor() { this.inTx = false; this.snapshot = null; }
  async query(sql, params) {
    sql = String(sql).replace(/\s+/g, ' ').trim();
    if (sql === 'BEGIN') {
      this.snapshot = JSON.parse(JSON.stringify({ packs: state.packs, gifts: state.gifts, txs: state.txs, profiles: state.profiles }));
      return { rows: [] };
    }
    if (sql === 'COMMIT') { this.snapshot = null; return { rows: [] }; }
    if (sql === 'ROLLBACK') {
      if (this.snapshot) Object.assign(state, this.snapshot);
      this.snapshot = null;
      return { rows: [] };
    }
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.startsWith('SELECT * FROM coin_pack_purchases WHERE stripe_payment_intent')) {
      const rows = state.packs.filter(r => r.stripe_payment_intent === params[0] && r.status === 'completed');
      return { rows: rows.map(r => ({ ...r })) };
    }
    if (sql.startsWith('SELECT * FROM gift_purchases WHERE stripe_payment_intent')) {
      const rows = state.gifts.filter(r => r.stripe_payment_intent === params[0] && r.gift_type === 'coins' && r.status === 'completed');
      return { rows: rows.map(r => ({ ...r })) };
    }
    if (sql.startsWith('SELECT delta FROM coin_transactions')) {
      const reason = ('gift_coins:' + params[1]).slice(0, 64);
      const row = state.txs.find(t => String(t.account_id) === String(params[0]) && t.reason === reason && t.delta > 0);
      return { rows: row ? [{ delta: row.delta }] : [] };
    }
    if (sql.startsWith('INSERT INTO player_profiles')) {
      const id = String(params[0]);
      if (!state.profiles[id]) state.profiles[id] = { coin_balance: 0, coin_lifetime: 0 };
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO coin_transactions')) {
      if (state.failOnDebit) throw new Error('db down');
      state.txs.push({ account_id: params[0], delta: params[1], reason: params[2] });
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE player_profiles SET coin_balance')) {
      const prof = state.profiles[String(params[1])];
      prof.coin_balance -= params[0];
      prof.coin_lifetime -= params[0];
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE coin_pack_purchases SET status = \'refunded\'')) {
      const row = state.packs.find(r => r.id === params[0]);
      if (row) row.status = 'refunded';
      return { rows: row ? [{ ...row }] : [] };
    }
    if (sql.startsWith('UPDATE gift_purchases SET status = \'refunded\'')) {
      const row = state.gifts.find(r => r.id === params[0]);
      if (row) row.status = 'refunded';
      return { rows: row ? [{ ...row }] : [] };
    }
    throw new Error('FakeClient: unhandled SQL: ' + sql.slice(0, 120));
  }
  release() {}
}

class FakePool {
  async connect() { return new FakeClient(); }
  async query(sql, params) {
    sql = String(sql).replace(/\s+/g, ' ').trim();
    if (sql.includes('FROM coin_pack_purchases cpp JOIN stripe_refunded_intents')) {
      const pis = new Set(state.packs
        .filter(r => r.status === 'completed' && state.refundedIntents.has(r.stripe_payment_intent))
        .map(r => r.stripe_payment_intent));
      return { rows: [...pis].map(pi => ({ pi })) };
    }
    if (sql.includes('FROM gift_purchases gp JOIN stripe_refunded_intents')) {
      const pis = new Set(state.gifts
        .filter(r => r.gift_type === 'coins' && r.status === 'completed' && state.refundedIntents.has(r.stripe_payment_intent))
        .map(r => r.stripe_payment_intent));
      return { rows: [...pis].map(pi => ({ pi })) };
    }
    throw new Error('FakePool: unhandled SQL: ' + sql.slice(0, 120));
  }
}

const pgPath = require.resolve('pg');
delete require.cache[pgPath];
require.cache[pgPath] = { id: pgPath, filename: pgPath, loaded: true, exports: { Pool: FakePool } };
delete require.cache[require.resolve('../src/db/index.js')];
const db = require('../src/db/index.js');

test('coin pack refund flips row and debits full amount (balance may go negative)', async () => {
  resetState();
  state.packs = [{ id: 1, account_id: '10', pack_id: 'starter', coins: 500, status: 'completed', stripe_payment_intent: 'pi_pack' }];
  state.profiles['10'] = { coin_balance: 120, coin_lifetime: 900 }; // most coins already spent
  const flipped = await db.markCoinPackPurchasesRefundedByIntent('pi_pack');
  assert.equal(flipped.length, 1);
  assert.equal(state.packs[0].status, 'refunded');
  assert.equal(state.profiles['10'].coin_balance, -380); // negative allowed
  assert.equal(state.profiles['10'].coin_lifetime, 400);
  const debit = state.txs.find(t => t.reason === 'stripe_topup_refund');
  assert.equal(debit.delta, -500);
  // retry is a no-op
  const again = await db.markCoinPackPurchasesRefundedByIntent('pi_pack');
  assert.equal(again.length, 0);
  assert.equal(state.profiles['10'].coin_balance, -380);
});

test('a failed debit rolls back the status flip too', async () => {
  resetState();
  state.packs = [{ id: 1, account_id: '10', pack_id: 'starter', coins: 500, status: 'completed', stripe_payment_intent: 'pi_pack' }];
  state.profiles['10'] = { coin_balance: 500, coin_lifetime: 500 };
  state.failOnDebit = true;
  await assert.rejects(() => db.markCoinPackPurchasesRefundedByIntent('pi_pack'));
  assert.equal(state.packs[0].status, 'completed'); // still matchable on retry
  assert.equal(state.profiles['10'].coin_balance, 500);
});

test('gift coin refund debits the recipient by the granted amount from the ledger', async () => {
  resetState();
  const session = 'cs_test_gift_coins_session';
  state.gifts = [{ id: 5, gift_type: 'coins', gifter_account_id: '9', recipient_account_id: '11', stripe_session_id: session, status: 'completed', stripe_payment_intent: 'pi_gift' }];
  state.txs = [{ account_id: '11', delta: 1200, reason: ('gift_coins:' + session).slice(0, 64) }];
  state.profiles['11'] = { coin_balance: 1300, coin_lifetime: 1300 };
  const flipped = await db.markGiftCoinsRefundedByIntent('pi_gift');
  assert.equal(flipped.length, 1);
  assert.equal(flipped[0].coins_debited, 1200);
  assert.equal(state.gifts[0].status, 'refunded');
  assert.equal(state.profiles['11'].coin_balance, 100);
});

test('gift refund with no grant row still flips the gift but debits nothing', async () => {
  resetState();
  state.gifts = [{ id: 6, gift_type: 'coins', gifter_account_id: '9', recipient_account_id: '12', stripe_session_id: 'cs_never_granted', status: 'completed', stripe_payment_intent: 'pi_gift2' }];
  const flipped = await db.markGiftCoinsRefundedByIntent('pi_gift2');
  assert.equal(flipped.length, 1);
  assert.equal(flipped[0].coins_debited, 0);
  assert.equal(state.gifts[0].status, 'refunded');
  assert.equal(state.txs.length, 0);
});

test("the 'none' backfill sentinel never matches", async () => {
  resetState();
  assert.deepEqual(await db.markCoinPackPurchasesRefundedByIntent('none'), []);
  assert.deepEqual(await db.markGiftCoinsRefundedByIntent(null), []);
});

test('reconciliation backstop debits completed rows with recorded refunded intents', async () => {
  resetState();
  const session = 'cs_recon_gift';
  state.packs = [{ id: 2, account_id: '20', pack_id: 'whale', coins: 7500, status: 'completed', stripe_payment_intent: 'pi_r1' }];
  state.gifts = [{ id: 7, gift_type: 'coins', gifter_account_id: '9', recipient_account_id: '21', stripe_session_id: session, status: 'completed', stripe_payment_intent: 'pi_r2' }];
  state.txs = [{ account_id: '21', delta: 500, reason: ('gift_coins:' + session).slice(0, 64) }];
  state.profiles['20'] = { coin_balance: 7500, coin_lifetime: 7500 };
  state.profiles['21'] = { coin_balance: 500, coin_lifetime: 500 };
  state.refundedIntents = new Set(['pi_r1', 'pi_r2']);
  const r = await db.reconcileRefundedCoinPurchases();
  assert.equal(r.packs.length, 1);
  assert.equal(r.gifts.length, 1);
  assert.equal(state.packs[0].status, 'refunded');
  assert.equal(state.gifts[0].status, 'refunded');
  assert.equal(state.profiles['20'].coin_balance, 0);
  assert.equal(state.profiles['21'].coin_balance, 0);
  // second run is a no-op
  const r2 = await db.reconcileRefundedCoinPurchases();
  assert.equal(r2.packs.length + r2.gifts.length, 0);
});
