/**
 * Task #873 — Stripe receipt-URL resolution for the Purchase History page.
 *
 * Purchase-history rows carry an internal Stripe reference: either a
 * payment-intent id (`stripe_payment_intent`, one-off perks) or a checkout
 * session id (`stripe_session_id`, frames / founder rings / coin-pack
 * top-ups). `attachReceiptUrls` resolves each reference to the Stripe-hosted
 * receipt URL (charge.receipt_url), strips the raw ids so they never reach
 * the client, and attaches `receipt_url` when a receipt exists.
 *
 * Best-effort by design: any Stripe error, missing charge or missing receipt
 * simply omits the link. Successful lookups are cached for 24 h, failures /
 * missing receipts for 10 min, so the endpoint never hammers Stripe.
 *
 * Extracted into its own module so tests can exercise the resolution,
 * caching and id-stripping rules with a mocked Stripe client.
 */

'use strict';

const OK_TTL_MS = 24 * 60 * 60 * 1000;
const FAIL_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE = 5000;

// ref ("pi:<id>" | "cs:<id>") -> { url: string|null, expiresAt: ms }
const _cache = new Map();

function _clearReceiptCache() {
  _cache.clear();
}

async function _resolve(stripe, kind, id) {
  if (kind === 'pi') {
    const pi = await stripe.paymentIntents.retrieve(id, { expand: ['latest_charge'] });
    return pi?.latest_charge?.receipt_url || null;
  }
  // Checkout session — the payment intent (and its latest charge) hang off it.
  const session = await stripe.checkout.sessions.retrieve(id, {
    expand: ['payment_intent.latest_charge'],
  });
  return session?.payment_intent?.latest_charge?.receipt_url || null;
}

async function getReceiptUrl(stripe, kind, id, { log = console } = {}) {
  if (!stripe || !id) return null;
  const ref = `${kind}:${id}`;
  const now = Date.now();
  const cached = _cache.get(ref);
  if (cached && now < cached.expiresAt) return cached.url;
  let url = null;
  try {
    url = await _resolve(stripe, kind, id);
  } catch (e) {
    log.warn?.('[Receipts] lookup failed for', ref, '—', e?.message || e);
    url = null;
  }
  _cache.set(ref, { url, expiresAt: now + (url ? OK_TTL_MS : FAIL_TTL_MS) });
  // Keep the cache bounded — evict oldest entries past the cap.
  if (_cache.size > MAX_CACHE) {
    for (const k of _cache.keys()) {
      if (_cache.size <= MAX_CACHE * 0.8) break;
      _cache.delete(k);
    }
  }
  return url;
}

/**
 * Mutates `items` in place: removes `stripe_payment_intent` /
 * `stripe_session_id` from every item and sets `receipt_url` where a
 * Stripe-hosted receipt could be resolved. Returns the same array.
 */
async function attachReceiptUrls(items, { stripe, log = console } = {}) {
  if (!Array.isArray(items) || !items.length) return items;
  await Promise.all(items.map(async (item) => {
    if (!item) return;
    const pi = item.stripe_payment_intent;
    const cs = item.stripe_session_id;
    delete item.stripe_payment_intent;
    delete item.stripe_session_id;
    if (!stripe) return;
    let url = null;
    if (pi) url = await getReceiptUrl(stripe, 'pi', pi, { log });
    if (!url && cs) url = await getReceiptUrl(stripe, 'cs', cs, { log });
    if (url) item.receipt_url = url;
  }));
  return items;
}

module.exports = { attachReceiptUrls, getReceiptUrl, _clearReceiptCache };
