// Task #916 — coin packs and gifted coins revoke (debit) on refund like the
// other Stripe purchases. Locks in the two new legs of the payment-intent
// backfill sweep (src/payments/backfillPaymentIntents.js): completed
// coin_pack_purchases rows and completed gift_purchases(coins) rows whose
// stored checkout session resolves to a payment intent get stamped; sessions
// with no intent get the 'none' sentinel; transient Stripe errors leave the
// row for the next run; dry-run writes nothing.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

function stubModule(specifier, exports, fromPath = __filename) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

function load({ coinPacks = [], giftCoins = [], sessions = {} } = {}) {
  const packWrites = [];
  const giftWrites = [];
  const dbStub = {
    async listFramePurchasesMissingPaymentIntent() { return []; },
    async listFounderRingEntitlementsMissingPaymentIntent() { return []; },
    async listSeasonPassPurchasesMissingPaymentIntent() { return []; },
    async listCoinPackPurchasesMissingPaymentIntent() { return coinPacks; },
    async listGiftCoinPurchasesMissingPaymentIntent() { return giftCoins; },
    async setCoinPackPurchasePaymentIntent(id, intent) { packWrites.push([id, intent]); return { id }; },
    async setGiftPurchasePaymentIntent(id, intent) { giftWrites.push([id, intent]); return { id }; },
    async setFramePurchasePaymentIntent() { throw new Error('unexpected'); },
    async setEntitlementPaymentIntent() { throw new Error('unexpected'); },
    async setSeasonPassPurchasePaymentIntent() { throw new Error('unexpected'); },
  };
  stubModule('../src/db', dbStub);
  const modPath = require.resolve('../src/payments/backfillPaymentIntents.js');
  delete require.cache[modPath];
  const { backfillStoredPaymentIntents } = require(modPath);
  const stripe = {
    checkout: {
      sessions: {
        async retrieve(id) {
          const s = sessions[id];
          if (s instanceof Error) throw s;
          if (s === undefined) { const e = new Error('missing'); e.code = 'resource_missing'; throw e; }
          return s;
        },
      },
    },
  };
  return { backfillStoredPaymentIntents, stripe, packWrites, giftWrites };
}

test('coin pack and coin gift rows are stamped with resolved payment intents', async () => {
  const { backfillStoredPaymentIntents, stripe, packWrites, giftWrites } = load({
    coinPacks: [{ id: 1, account_id: 10, pack_id: 'starter', coins: 500, stripe_session_id: 'cs_pack' }],
    giftCoins: [{ id: 7, recipient_account_id: 11, stripe_session_id: 'cs_gift' }],
    sessions: {
      cs_pack: { payment_intent: 'pi_pack' },
      cs_gift: { payment_intent: { id: 'pi_gift' } },
    },
  });
  const s = await backfillStoredPaymentIntents({ delayMs: 0, stripe });
  assert.equal(s.coinPacksScanned, 1);
  assert.equal(s.coinPacksFilled, 1);
  assert.equal(s.giftCoinsScanned, 1);
  assert.equal(s.giftCoinsFilled, 1);
  assert.equal(s.errors, 0);
  assert.deepEqual(packWrites, [[1, 'pi_pack']]);
  assert.deepEqual(giftWrites, [[7, 'pi_gift']]);
});

test('missing session stamps the none sentinel; transient error retries later', async () => {
  const transient = new Error('rate limited'); transient.statusCode = 429;
  const { backfillStoredPaymentIntents, stripe, packWrites } = load({
    coinPacks: [
      { id: 2, account_id: 10, pack_id: 'whale', coins: 7500, stripe_session_id: 'cs_gone' },
      { id: 3, account_id: 12, pack_id: 'starter', coins: 500, stripe_session_id: 'cs_flaky' },
    ],
    sessions: { cs_flaky: transient },
  });
  const s = await backfillStoredPaymentIntents({ delayMs: 0, stripe });
  assert.equal(s.coinPacksNoIntent, 1);
  assert.equal(s.errors, 1);
  assert.deepEqual(packWrites, [[2, 'none']]); // flaky row left NULL for next run
});

test('dry-run resolves but writes nothing', async () => {
  const { backfillStoredPaymentIntents, stripe, packWrites, giftWrites } = load({
    coinPacks: [{ id: 4, account_id: 10, pack_id: 'starter', coins: 500, stripe_session_id: 'cs_pack' }],
    giftCoins: [{ id: 8, recipient_account_id: 11, stripe_session_id: 'cs_gift' }],
    sessions: { cs_pack: { payment_intent: 'pi_a' }, cs_gift: { payment_intent: 'pi_b' } },
  });
  const s = await backfillStoredPaymentIntents({ delayMs: 0, dryRun: true, stripe });
  assert.equal(s.coinPacksScanned, 1);
  assert.equal(s.giftCoinsScanned, 1);
  assert.deepEqual(packWrites, []);
  assert.deepEqual(giftWrites, []);
});
