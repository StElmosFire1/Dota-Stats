// Task #912 — season passes revoke on refund like frames/rings.
//
// Locks in the new season-pass leg of the payment-intent backfill sweep
// (src/payments/backfillPaymentIntents.js): rows whose stored checkout
// session (self stripe_session_id OR gift_stripe_session_id, pre-coalesced
// by the db helper) resolves to a payment intent get stamped; sessions with
// no intent get the 'none' sentinel; transient Stripe errors leave the row
// for the next run; dry-run writes nothing.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

function stubModule(specifier, exports, fromPath = __filename) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

function load({ passes = [], sessions = {} } = {}) {
  const writes = [];
  const dbStub = {
    async listFramePurchasesMissingPaymentIntent() { return []; },
    async listFounderRingEntitlementsMissingPaymentIntent() { return []; },
    async listSeasonPassPurchasesMissingPaymentIntent() { return passes; },
    async setSeasonPassPurchasePaymentIntent(id, intent) { writes.push([id, intent]); return { id }; },
    async setFramePurchasePaymentIntent() { throw new Error('unexpected'); },
    async setEntitlementPaymentIntent() { throw new Error('unexpected'); },
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
  return { backfillStoredPaymentIntents, stripe, writes };
}

test('season pass rows are stamped with resolved payment intents', async () => {
  const { backfillStoredPaymentIntents, stripe, writes } = load({
    passes: [
      { id: 1, account_id: 10, season_number: 12, stripe_session_id: 'cs_self' },
      { id: 2, account_id: 11, season_number: 12, stripe_session_id: 'cs_gift' },
    ],
    sessions: {
      cs_self: { payment_intent: 'pi_self' },
      cs_gift: { payment_intent: { id: 'pi_gift' } },
    },
  });
  const s = await backfillStoredPaymentIntents({ delayMs: 0, stripe });
  assert.equal(s.passesScanned, 2);
  assert.equal(s.passesFilled, 2);
  assert.equal(s.errors, 0);
  assert.deepEqual(writes, [[1, 'pi_self'], [2, 'pi_gift']]);
});

test('missing session stamps the none sentinel; transient error retries later', async () => {
  const transient = new Error('rate limited'); transient.statusCode = 429;
  const { backfillStoredPaymentIntents, stripe, writes } = load({
    passes: [
      { id: 3, account_id: 12, season_number: 12, stripe_session_id: 'cs_gone' },
      { id: 4, account_id: 13, season_number: 12, stripe_session_id: 'cs_flaky' },
    ],
    sessions: { cs_flaky: transient },
  });
  const s = await backfillStoredPaymentIntents({ delayMs: 0, stripe });
  assert.equal(s.passesNoIntent, 1);
  assert.equal(s.errors, 1);
  assert.deepEqual(writes, [[3, 'none']]); // flaky row left NULL for next run
});

test('dry-run resolves but writes nothing', async () => {
  const { backfillStoredPaymentIntents, stripe, writes } = load({
    passes: [{ id: 5, account_id: 14, season_number: 12, stripe_session_id: 'cs_dry' }],
    sessions: { cs_dry: { payment_intent: 'pi_dry' } },
  });
  const s = await backfillStoredPaymentIntents({ delayMs: 0, stripe, dryRun: true });
  assert.equal(s.passesScanned, 1);
  assert.deepEqual(writes, []);
});
