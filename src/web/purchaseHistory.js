/**
 * Task #768 — purchase-history assembly, extracted as a pure function so
 * tests can exercise the filtering/ordering rules without a live DB.
 *
 * Combines, into one newest-first list:
 *  - Stripe one-off perks (user_one_off_perks) — Custom URL, verified badge,
 *    any catalogued perk. Pending/revoked rows and superuser owner-perk
 *    synthesis are excluded.
 *  - Stripe frame purchases (frame_purchases, status='active' with a real
 *    amount — webhook-fallback grants carry no amount and are excluded).
 *  - Stripe founder-ring purchases (entitlements granted_by='stripe',
 *    amount/currency read from metadata).
 *  - Coin cosmetic purchases (coin_owned_cosmetics with coins_spent > 0 —
 *    lootbox/admin grants have coins_spent = 0 and are excluded).
 *  - Completed Stripe coin-pack top-ups (coin_pack_purchases,
 *    status='completed') with the real money amount paid.
 */

function _titleCase(s) {
  return String(s || '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildPurchaseHistory({
  perks = [],
  framePurchases = [],
  founderRingPurchases = [],
  coinPurchases = [],
  coinPackPurchases = [],
  perkCatalog = {},
} = {}) {
  const items = [];

  for (const p of perks || []) {
    // Skip synthesized owner-perk rows and anything without a real grant
    // (pending rows carry revoked_at and listOneOffPerks already filters
    // them, but be defensive).
    if (!p || p.source === 'owner_perk' || p.source === 'stripe_pending' || !p.granted_at) continue;
    items.push({
      type: 'stripe_perk',
      key: p.perk_key,
      name: perkCatalog[p.perk_key]?.name
        || (p.metadata && p.metadata.name) || p.perk_key,
      amount_cents: p.amount_cents ?? null,
      currency: p.currency || 'aud',
      coins_spent: null,
      purchased_at: p.granted_at,
      expires_at: p.expires_at || null,
      // Task #873 — carried through so the route can resolve the Stripe
      // receipt URL for this purchase (best-effort, never sent to clients).
      stripe_payment_intent: p.stripe_payment_intent || null,
    });
  }

  for (const f of framePurchases || []) {
    // All active rows are real fulfilled Stripe purchases (webhook-verified).
    // amount_cents can be null only on legacy rows created by the recovery
    // path before it persisted amounts (Task #768) — still show them.
    if (!f) continue;
    items.push({
      type: 'stripe_frame',
      key: `frame:${f.frame_id}`,
      name: `${_titleCase(f.frame_id)} Profile Frame`,
      amount_cents: f.amount_cents ?? null,
      currency: f.currency || 'aud',
      coins_spent: null,
      purchased_at: f.purchased_at || f.created_at,
      expires_at: null,
      // Task #873 — checkout session ref lets the route resolve the receipt.
      stripe_session_id: f.stripe_session_id || null,
    });
  }

  for (const e of founderRingPurchases || []) {
    if (!e || !e.sku) continue;
    const md = e.metadata || {};
    const isPass = e.sku === 'founders_pass_ring';
    const slug = isPass ? null : String(e.sku).split(':')[1];
    items.push({
      type: 'stripe_founder_ring',
      key: e.sku,
      name: isPass ? 'Founders Pass Ring' : `${_titleCase(slug)} Founders Ring`,
      amount_cents: md.amount_cents ?? null,
      currency: md.currency || 'aud',
      coins_spent: null,
      purchased_at: e.granted_at,
      expires_at: null,
      // Task #873 — webhook stores the checkout session id in metadata.
      stripe_session_id: md.stripe_session_id || null,
    });
  }

  for (const c of coinPurchases || []) {
    if (!c || !c.coins_spent) continue; // lootbox/admin grants, not purchases
    items.push({
      type: 'coin_cosmetic',
      key: `${c.kind}:${c.value}`,
      name: `${_titleCase(c.kind)}: ${_titleCase(c.value)}`,
      amount_cents: null,
      currency: null,
      coins_spent: c.coins_spent,
      purchased_at: c.created_at,
      expires_at: null,
    });
  }

  for (const t of coinPackPurchases || []) {
    if (!t) continue;
    items.push({
      type: 'coin_topup',
      key: `topup:${t.id}`,
      name: `Coin Top-up — ${_titleCase(t.pack_id)} pack (+${Number(t.coins || 0).toLocaleString()} 🪙)`,
      amount_cents: t.amount_cents ?? null,
      currency: t.currency || 'aud',
      coins_spent: null,
      purchased_at: t.completed_at || t.created_at,
      expires_at: null,
      // Task #873 — checkout session ref lets the route resolve the receipt.
      stripe_session_id: t.stripe_session_id || null,
    });
  }

  items.sort((a, b) => new Date(b.purchased_at || 0) - new Date(a.purchased_at || 0));
  return items;
}

module.exports = { buildPurchaseHistory };
