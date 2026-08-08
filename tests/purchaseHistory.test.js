// Task #768 — unit tests for the purchase-history assembly rules.
const { test } = require('node:test');
const assert = require('node:assert');
const { buildPurchaseHistory } = require('../src/web/purchaseHistory');

const CATALOG = {
  'cosmetic:vanity_url': { name: 'Vanity URL Slug', cents: 1200 },
};

test('includes granted Stripe perks with catalog name, amount and currency', () => {
  const items = buildPurchaseHistory({
    perks: [{
      perk_key: 'cosmetic:vanity_url', source: 'stripe',
      granted_at: '2026-01-05T00:00:00Z', amount_cents: 1200, currency: 'aud',
    }],
    perkCatalog: CATALOG,
  });
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].type, 'stripe_perk');
  assert.strictEqual(items[0].name, 'Vanity URL Slug');
  assert.strictEqual(items[0].amount_cents, 1200);
  assert.strictEqual(items[0].currency, 'aud');
});

test('excludes owner-perk synthesis, pending rows and ungranted perks', () => {
  const items = buildPurchaseHistory({
    perks: [
      { perk_key: 'a', source: 'owner_perk', granted_at: null },
      { perk_key: 'b', source: 'stripe_pending', granted_at: '2026-01-01T00:00:00Z' },
      { perk_key: 'c', source: 'stripe', granted_at: null },
    ],
  });
  assert.strictEqual(items.length, 0);
});

test('includes Stripe frame purchases with paid amount', () => {
  const items = buildPurchaseHistory({
    framePurchases: [
      { frame_id: 'cosmic', amount_cents: 399, currency: 'aud', purchased_at: '2026-02-01T00:00:00Z' },
    ],
  });
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].type, 'stripe_frame');
  assert.strictEqual(items[0].key, 'frame:cosmic');
  assert.strictEqual(items[0].amount_cents, 399);
});

test('recovery-shaped frame rows (webhook created, verified Stripe amount) appear with real amount', () => {
  // Shape produced by confirmFramePurchase when no pending pre-record existed:
  // webhook passes session.amount_total/currency, purchased_at = NOW().
  const items = buildPurchaseHistory({
    framePurchases: [
      { frame_id: 'fire', amount_cents: 399, currency: 'aud',
        purchased_at: '2026-02-03T00:00:00Z', created_at: '2026-02-03T00:00:00Z' },
    ],
  });
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].amount_cents, 399);
  assert.strictEqual(items[0].currency, 'aud');
});

test('legacy active frame rows without a recorded amount still appear (amount null)', () => {
  const items = buildPurchaseHistory({
    framePurchases: [
      { frame_id: 'fire', amount_cents: null, purchased_at: '2026-02-02T00:00:00Z' },
    ],
  });
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].key, 'frame:fire');
  assert.strictEqual(items[0].amount_cents, null);
});

test('includes founder rings (per-slug + Founders Pass) with metadata amounts', () => {
  const items = buildPurchaseHistory({
    founderRingPurchases: [
      { sku: 'founder_ring:phoenix', granted_at: '2026-03-01T00:00:00Z',
        metadata: { amount_cents: 799, currency: 'aud' } },
      { sku: 'founders_pass_ring', granted_at: '2026-03-02T00:00:00Z', metadata: {} },
    ],
  });
  assert.strictEqual(items.length, 2);
  const phoenix = items.find(i => i.key === 'founder_ring:phoenix');
  assert.strictEqual(phoenix.amount_cents, 799);
  assert.strictEqual(phoenix.name, 'Phoenix Founders Ring');
  const pass = items.find(i => i.key === 'founders_pass_ring');
  assert.strictEqual(pass.name, 'Founders Pass Ring');
  assert.strictEqual(pass.amount_cents, null);
});

test('includes coin cosmetic purchases; excludes coins_spent=0 grants', () => {
  const items = buildPurchaseHistory({
    coinPurchases: [
      { kind: 'founder_ring', value: 'storm', coins_spent: 2000, created_at: '2026-04-01T00:00:00Z' },
      { kind: 'frame', value: 'fire', coins_spent: 0, created_at: '2026-04-02T00:00:00Z' }, // lootbox grant
    ],
  });
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].type, 'coin_cosmetic');
  assert.strictEqual(items[0].coins_spent, 2000);
  assert.strictEqual(items[0].amount_cents, null);
});

test('coin-pack top-ups carry the real money amount and completed timestamp', () => {
  const items = buildPurchaseHistory({
    coinPackPurchases: [{
      id: 7, pack_id: 'standard', coins: 1200, amount_cents: 999, currency: 'aud',
      completed_at: '2026-05-01T00:00:00Z', created_at: '2026-04-30T00:00:00Z',
    }],
  });
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].type, 'coin_topup');
  assert.strictEqual(items[0].amount_cents, 999);
  assert.strictEqual(items[0].currency, 'aud');
  assert.strictEqual(items[0].purchased_at, '2026-05-01T00:00:00Z');
  assert.match(items[0].name, /1,200/);
});

test('sorts newest-first across all sources', () => {
  const items = buildPurchaseHistory({
    perks: [{ perk_key: 'p', source: 'stripe', granted_at: '2026-01-01T00:00:00Z', amount_cents: 100 }],
    framePurchases: [{ frame_id: 'cosmic', amount_cents: 399, purchased_at: '2026-03-01T00:00:00Z' }],
    coinPurchases: [{ kind: 'frame', value: 'fire', coins_spent: 2500, created_at: '2026-02-01T00:00:00Z' }],
    coinPackPurchases: [{ id: 1, pack_id: 'starter', coins: 500, amount_cents: 499, completed_at: '2026-04-01T00:00:00Z' }],
  });
  assert.deepStrictEqual(items.map(i => i.type),
    ['coin_topup', 'stripe_frame', 'coin_cosmetic', 'stripe_perk']);
});

// Task #873 — receipt-link support: the payment-intent id must ride along on
// Stripe perk rows so the route can resolve the receipt URL server-side.
test('carries stripe_payment_intent through on stripe_perk items', () => {
  const items = buildPurchaseHistory({
    perks: [{
      perk_key: 'cosmetic:vanity_url', source: 'stripe',
      granted_at: '2026-01-05T00:00:00Z', amount_cents: 1200, currency: 'aud',
      stripe_payment_intent: 'pi_123',
    }],
    perkCatalog: CATALOG,
  });
  assert.strictEqual(items[0].stripe_payment_intent, 'pi_123');
});

test('stripe_payment_intent is null when the perk row has none', () => {
  const items = buildPurchaseHistory({
    perks: [{ perk_key: 'x', source: 'stripe', granted_at: '2026-01-05T00:00:00Z' }],
  });
  assert.strictEqual(items[0].stripe_payment_intent, null);
});

test('carries stripe_session_id through on frame, founder-ring and top-up rows', () => {
  const items = buildPurchaseHistory({
    framePurchases: [{ frame_id: 'gold', amount_cents: 299, purchased_at: '2026-02-01T00:00:00Z', stripe_session_id: 'cs_f' }],
    founderRingPurchases: [{ sku: 'founder_ring:storm', granted_at: '2026-02-02T00:00:00Z', metadata: { stripe_session_id: 'cs_r' } }],
    coinPackPurchases: [{ id: 1, pack_id: 'starter', coins: 500, amount_cents: 499, created_at: '2026-02-03T00:00:00Z', stripe_session_id: 'cs_t' }],
  });
  const byType = Object.fromEntries(items.map(i => [i.type, i]));
  assert.strictEqual(byType.stripe_frame.stripe_session_id, 'cs_f');
  assert.strictEqual(byType.stripe_founder_ring.stripe_session_id, 'cs_r');
  assert.strictEqual(byType.coin_topup.stripe_session_id, 'cs_t');
});
