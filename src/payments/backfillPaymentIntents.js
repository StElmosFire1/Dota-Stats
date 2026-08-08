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
//   - season_pass_purchases rows (Task #912) — self-purchases store the
//     session in stripe_session_id, gift activations in gift_stripe_session_id
//   - coin_pack_purchases rows (Task #916) — completed top-ups fulfilled
//     before intents were stored at fulfillment time
//   - gift_purchases rows with gift_type='coins' (Task #916) — completed
//     coin gifts, so charge.refunded can debit the recipient's coins
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
    passesScanned: 0, passesFilled: 0, passesNoIntent: 0,
    coinPacksScanned: 0, coinPacksFilled: 0, coinPacksNoIntent: 0,
    giftCoinsScanned: 0, giftCoinsFilled: 0, giftCoinsNoIntent: 0,
    errors: 0,
  };

  const [frames, rings, passes, coinPacks, giftCoins] = await Promise.all([
    db.listFramePurchasesMissingPaymentIntent(limit),
    db.listFounderRingEntitlementsMissingPaymentIntent(limit),
    db.listSeasonPassPurchasesMissingPaymentIntent(limit),
    db.listCoinPackPurchasesMissingPaymentIntent(limit),
    db.listGiftCoinPurchasesMissingPaymentIntent(limit),
  ]);
  if (!frames.length && !rings.length && !passes.length && !coinPacks.length && !giftCoins.length) {
    return summary; // fully backfilled — no Stripe calls
  }

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

  for (const row of passes) {
    summary.passesScanned++;
    const res = await _resolveSessionIntent(client, row.stripe_session_id);
    if (res.retry) {
      summary.errors++;
      console.warn('[PI Backfill] season_pass_purchases id=%s session=%s retryable error: %s', row.id, row.stripe_session_id, res.error);
    } else if (dryRun) {
      console.log('[PI Backfill] (dry-run) season_pass_purchases id=%s %s → %s', row.id, row.stripe_session_id, res.intent);
    } else {
      await db.setSeasonPassPurchasePaymentIntent(row.id, res.intent);
      if (res.intent === NO_INTENT_SENTINEL) {
        summary.passesNoIntent++;
        console.log('[PI Backfill] season_pass_purchases id=%s session=%s has no payment intent — stamped sentinel', row.id, row.stripe_session_id);
      } else {
        summary.passesFilled++;
        console.log('[PI Backfill] season_pass_purchases id=%s (account=%s season=%s) ← %s', row.id, row.account_id, row.season_number, res.intent);
      }
    }
    await _sleep(delayMs);
  }

  // Task #916 — coin packs + gifted coins.
  for (const row of coinPacks) {
    summary.coinPacksScanned++;
    const res = await _resolveSessionIntent(client, row.stripe_session_id);
    if (res.retry) {
      summary.errors++;
      console.warn('[PI Backfill] coin_pack_purchases id=%s session=%s retryable error: %s', row.id, row.stripe_session_id, res.error);
    } else if (dryRun) {
      console.log('[PI Backfill] (dry-run) coin_pack_purchases id=%s %s → %s', row.id, row.stripe_session_id, res.intent);
    } else {
      await db.setCoinPackPurchasePaymentIntent(row.id, res.intent);
      if (res.intent === NO_INTENT_SENTINEL) {
        summary.coinPacksNoIntent++;
        console.log('[PI Backfill] coin_pack_purchases id=%s session=%s has no payment intent — stamped sentinel', row.id, row.stripe_session_id);
      } else {
        summary.coinPacksFilled++;
        console.log('[PI Backfill] coin_pack_purchases id=%s (account=%s pack=%s) ← %s', row.id, row.account_id, row.pack_id, res.intent);
      }
    }
    await _sleep(delayMs);
  }

  for (const row of giftCoins) {
    summary.giftCoinsScanned++;
    const res = await _resolveSessionIntent(client, row.stripe_session_id);
    if (res.retry) {
      summary.errors++;
      console.warn('[PI Backfill] gift_purchases(coins) id=%s session=%s retryable error: %s', row.id, row.stripe_session_id, res.error);
    } else if (dryRun) {
      console.log('[PI Backfill] (dry-run) gift_purchases(coins) id=%s %s → %s', row.id, row.stripe_session_id, res.intent);
    } else {
      await db.setGiftPurchasePaymentIntent(row.id, res.intent);
      if (res.intent === NO_INTENT_SENTINEL) {
        summary.giftCoinsNoIntent++;
        console.log('[PI Backfill] gift_purchases(coins) id=%s session=%s has no payment intent — stamped sentinel', row.id, row.stripe_session_id);
      } else {
        summary.giftCoinsFilled++;
        console.log('[PI Backfill] gift_purchases(coins) id=%s (recipient=%s) ← %s', row.id, row.recipient_account_id, res.intent);
      }
    }
    await _sleep(delayMs);
  }

  return summary;
}

module.exports = { backfillStoredPaymentIntents, NO_INTENT_SENTINEL };
