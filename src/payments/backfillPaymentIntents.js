'use strict';
/* eslint-disable no-console */
// Task #909 — one-time backfill: resolve stored Stripe checkout session ids
// into payment intents for purchases made BEFORE Task #890 shipped, so
// charge.refunded can revoke historical frames and founder rings too.
//
// Covers:
//   - frame_purchases rows with stripe_session_id but stripe_payment_intent NULL
//   - founder-ring entitlements (founder_ring:% / founders_pass_ring) with a
//     metadata stripe_session_id but no metadata stripe_payment_intent
//
// Idempotent: each filled row leaves the "missing" set forever, and rows whose
// session genuinely has no payment intent (or no longer exists on Stripe) are
// stamped with the sentinel 'none' so they're never re-queried. Real payment
// intents always start with 'pi_', so the sentinel can never match a refund.
//
// Rate-limit friendly: one session retrieve per row, serialized with a small
// delay between Stripe calls (default 250ms) and a per-run row cap. Transient
// Stripe errors leave the row NULL so the next run retries it.

const db = require('../db');

const NO_INTENT_SENTINEL = 'none';

function _extractIntent(session) {
  const pi = session?.payment_intent;
  if (typeof pi === 'string' && pi) return pi;
  if (pi && typeof pi === 'object' && pi.id) return pi.id;
  return null;
}

async function _resolveSessionIntent(stripe, sessionId) {
  // Returns { intent } on success ('none' sentinel when the session has no
  // payment intent or is gone), or { retry: true, error } on transient failure.
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return { intent: _extractIntent(session) || NO_INTENT_SENTINEL };
  } catch (e) {
    // A permanently-missing session (deleted, wrong mode/account) will never
    // resolve — stamp the sentinel so we stop asking. Anything else (network,
    // rate limit, 5xx) is left for the next run.
    if (e?.code === 'resource_missing' || e?.statusCode === 404) {
      return { intent: NO_INTENT_SENTINEL };
    }
    return { retry: true, error: e?.message || String(e) };
  }
}

const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run the backfill. Options:
 *   dryRun  — resolve + log, but write nothing (default false)
 *   limit   — max rows per kind per run (default 200)
 *   delayMs — pause between Stripe calls (default 250)
 *   stripe  — injectable Stripe client (tests); defaults to the shared client
 */
async function backfillStoredPaymentIntents({ dryRun = false, limit = 200, delayMs = 250, stripe = null } = {}) {
  const summary = {
    framesScanned: 0, framesFilled: 0, framesNoIntent: 0,
    ringsScanned: 0, ringsFilled: 0, ringsNoIntent: 0,
    errors: 0,
  };

  const [frames, rings] = await Promise.all([
    db.listFramePurchasesMissingPaymentIntent(limit),
    db.listFounderRingEntitlementsMissingPaymentIntent(limit),
  ]);
  if (!frames.length && !rings.length) return summary; // fully backfilled — no Stripe calls

  if (!process.env.STRIPE_SECRET_KEY && !stripe) {
    console.warn('[PI Backfill] STRIPE_SECRET_KEY missing — skipping');
    return { ...summary, skipped: true };
  }
  const client = stripe || require('../observability/stripeClient').getStripe();

  for (const row of frames) {
    summary.framesScanned++;
    const res = await _resolveSessionIntent(client, row.stripe_session_id);
    if (res.retry) {
      summary.errors++;
      console.warn('[PI Backfill] frame_purchases id=%s session=%s retryable error: %s', row.id, row.stripe_session_id, res.error);
    } else if (dryRun) {
      console.log('[PI Backfill] (dry-run) frame_purchases id=%s %s → %s', row.id, row.stripe_session_id, res.intent);
    } else {
      await db.setFramePurchasePaymentIntent(row.id, res.intent);
      if (res.intent === NO_INTENT_SENTINEL) {
        summary.framesNoIntent++;
        console.log('[PI Backfill] frame_purchases id=%s session=%s has no payment intent — stamped sentinel', row.id, row.stripe_session_id);
      } else {
        summary.framesFilled++;
        console.log('[PI Backfill] frame_purchases id=%s (account=%s frame=%s) ← %s', row.id, row.account_id, row.frame_id, res.intent);
      }
    }
    await _sleep(delayMs);
  }

  for (const row of rings) {
    summary.ringsScanned++;
    const res = await _resolveSessionIntent(client, row.stripe_session_id);
    if (res.retry) {
      summary.errors++;
      console.warn('[PI Backfill] entitlements id=%s session=%s retryable error: %s', row.id, row.stripe_session_id, res.error);
    } else if (dryRun) {
      console.log('[PI Backfill] (dry-run) entitlements id=%s %s → %s', row.id, row.stripe_session_id, res.intent);
    } else {
      await db.setEntitlementPaymentIntent(row.id, res.intent);
      if (res.intent === NO_INTENT_SENTINEL) {
        summary.ringsNoIntent++;
        console.log('[PI Backfill] entitlements id=%s session=%s has no payment intent — stamped sentinel', row.id, row.stripe_session_id);
      } else {
        summary.ringsFilled++;
        console.log('[PI Backfill] entitlements id=%s (account=%s sku=%s) ← %s', row.id, row.account_id, row.sku, res.intent);
      }
    }
    await _sleep(delayMs);
  }

  return summary;
}

module.exports = { backfillStoredPaymentIntents, NO_INTENT_SENTINEL };
