---
name: Stripe refund/fulfillment ordering
description: Refund revocation must survive charge.refunded arriving before checkout fulfillment, and must fail closed.
---

Stripe does NOT order webhook delivery: `charge.refunded` can arrive before `checkout.session.completed` (or its async variant). Revoke-by-payment-intent alone leaks entitlements in that window.

**Why:** a refund that lands first finds no entitlement row (or a pending row with no intent stored); the later fulfillment then grants an active entitlement the buyer was already repaid for. Stripe won't redeliver the refund.

**How to apply:**
- `charge.refunded` durably records the intent in `stripe_refunded_intents` FIRST (no .catch — let the webhook 500 so Stripe retries).
- Fulfillment paths check `isPaymentIntentRefunded` and revoke instead of granting. The check must run OUTSIDE the "row was pending" guard — on a retry after partial failure the row is already active and confirm returns null.
- Revoke/lookup failures must propagate (fail closed → non-2xx → Stripe retry), unlike the deliberately best-effort refund handlers.
- Daily backstop: `reconcileRefundedSeasonPasses`-style sweep joins refunded intents against still-active rows (covers exhausted retries + late backfills).
- Backfill sentinel 'none' must never be matchable as an intent.
