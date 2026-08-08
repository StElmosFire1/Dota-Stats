// Task #873 — receipt-URL resolution for the Purchase History endpoint.
// Exercises the same attachReceiptUrls() call the GET /me/purchase-history
// route makes, with a mocked Stripe client: receipt URLs appear for every
// Stripe source (perk via payment intent, frame / founder ring / coin
// top-up via checkout session), raw Stripe ids are stripped from the JSON
// payload, failures are best-effort, and lookups are cached.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { buildPurchaseHistory } = require('../src/web/purchaseHistory');
const { attachReceiptUrls, _clearReceiptCache } = require('../src/web/stripeReceipts');

const quietLog = { warn: () => {} };

function makeStripe({ piReceipt = null, sessionReceipts = {} } = {}) {
  const calls = { pi: [], cs: [] };
  return {
    calls,
    paymentIntents: {
      retrieve: async (id) => {
        calls.pi.push(id);
        if (piReceipt instanceof Error) throw piReceipt;
        return { id, latest_charge: piReceipt ? { receipt_url: piReceipt } : null };
      },
    },
    checkout: {
      sessions: {
        retrieve: async (id) => {
          calls.cs.push(id);
          const url = sessionReceipts[id];
          if (url instanceof Error) throw url;
          return { id, payment_intent: url ? { latest_charge: { receipt_url: url } } : null };
        },
      },
    },
  };
}

beforeEach(() => _clearReceiptCache());

test('attaches receipt URLs for every Stripe source and strips raw ids', async () => {
  const items = buildPurchaseHistory({
    perks: [{
      perk_key: 'cosmetic:vanity_url', source: 'stripe',
      granted_at: '2026-01-05T00:00:00Z', amount_cents: 1200, currency: 'aud',
      stripe_payment_intent: 'pi_perk',
    }],
    framePurchases: [{
      frame_id: 'cosmic', amount_cents: 399, currency: 'aud',
      purchased_at: '2026-02-01T00:00:00Z', stripe_session_id: 'cs_frame',
    }],
    founderRingPurchases: [{
      sku: 'founder_ring:phoenix', granted_at: '2026-03-01T00:00:00Z',
      metadata: { amount_cents: 799, currency: 'aud', stripe_session_id: 'cs_ring' },
    }],
    coinPackPurchases: [{
      id: 7, pack_id: 'standard', coins: 1200, amount_cents: 999, currency: 'aud',
      completed_at: '2026-04-01T00:00:00Z', stripe_session_id: 'cs_topup',
    }],
  });
  const stripe = makeStripe({
    piReceipt: 'https://receipt/perk',
    sessionReceipts: {
      cs_frame: 'https://receipt/frame',
      cs_ring: 'https://receipt/ring',
      cs_topup: 'https://receipt/topup',
    },
  });
  await attachReceiptUrls(items, { stripe, log: quietLog });

  const byType = Object.fromEntries(items.map(i => [i.type, i]));
  assert.strictEqual(byType.stripe_perk.receipt_url, 'https://receipt/perk');
  assert.strictEqual(byType.stripe_frame.receipt_url, 'https://receipt/frame');
  assert.strictEqual(byType.stripe_founder_ring.receipt_url, 'https://receipt/ring');
  assert.strictEqual(byType.coin_topup.receipt_url, 'https://receipt/topup');
  // Raw Stripe ids must never appear in the serialized payload.
  const json = JSON.stringify(items);
  assert.ok(!json.includes('pi_perk'));
  assert.ok(!json.includes('cs_frame'));
  assert.ok(!json.includes('stripe_payment_intent'));
  assert.ok(!json.includes('stripe_session_id'));
});

test('coin cosmetic rows and refless rows get no receipt link', async () => {
  const items = buildPurchaseHistory({
    coinPurchases: [{ kind: 'frame', value: 'fire', coins_spent: 2500, created_at: '2026-01-01T00:00:00Z' }],
    framePurchases: [{ frame_id: 'gold', amount_cents: 299, purchased_at: '2026-01-02T00:00:00Z' }], // legacy: no session id
  });
  const stripe = makeStripe();
  await attachReceiptUrls(items, { stripe, log: quietLog });
  assert.ok(items.every(i => !('receipt_url' in i)));
  assert.strictEqual(stripe.calls.pi.length + stripe.calls.cs.length, 0);
});

test('Stripe failures are best-effort — items survive without a link, ids still stripped', async () => {
  const items = buildPurchaseHistory({
    perks: [{
      perk_key: 'x', source: 'stripe', granted_at: '2026-01-05T00:00:00Z',
      stripe_payment_intent: 'pi_boom',
    }],
  });
  const stripe = makeStripe({ piReceipt: new Error('stripe down') });
  await attachReceiptUrls(items, { stripe, log: quietLog });
  assert.strictEqual(items.length, 1);
  assert.ok(!('receipt_url' in items[0]));
  assert.ok(!JSON.stringify(items).includes('pi_boom'));
});

test('missing stripe client omits links without throwing', async () => {
  const items = [{ type: 'stripe_perk', stripe_payment_intent: 'pi_x' }];
  await attachReceiptUrls(items, { stripe: null, log: quietLog });
  assert.ok(!('receipt_url' in items[0]) && !('stripe_payment_intent' in items[0]));
});

test('lookups are cached — a second pass hits Stripe zero times', async () => {
  const stripe = makeStripe({ sessionReceipts: { cs_a: 'https://receipt/a' } });
  const make = () => [{ type: 'stripe_frame', stripe_session_id: 'cs_a' }];
  await attachReceiptUrls(make(), { stripe, log: quietLog });
  assert.strictEqual(stripe.calls.cs.length, 1);
  const second = make();
  await attachReceiptUrls(second, { stripe, log: quietLog });
  assert.strictEqual(stripe.calls.cs.length, 1); // cache hit
  assert.strictEqual(second[0].receipt_url, 'https://receipt/a');
});
