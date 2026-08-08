// Task #855 — Stripe idempotency-key helper.
//
// Builds a deterministic idempotency key from domain parts so retried or
// double-clicked Stripe mutations (checkout-session create, PaymentIntent
// capture/cancel, refunds) replay the first response instead of acting
// twice. Pass the result as the second argument to any Stripe SDK call:
//
//   await stripe.paymentIntents.capture(pi, idem('booking-capture', bookingId));
//
// Keys must be ≤255 chars and stable per logical operation. For user-driven
// creates without a pre-existing DB anchor, include a short time bucket
// (idemBucket) so a double-click dedupes but a genuine later purchase does
// not collide.

'use strict';

const crypto = require('crypto');

function idemKey(...parts) {
  const raw = ['oi', ...parts.map(p => String(p ?? ''))].join(':');
  if (raw.length <= 255) return raw;
  return raw.slice(0, 215) + ':' + crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

// Options object for the Stripe SDK's per-request `idempotencyKey`.
function idem(...parts) {
  return { idempotencyKey: idemKey(...parts) };
}

// 10-second bucket: absorbs double-clicks/rapid retries while letting a
// deliberate repeat purchase (minutes later) go through as a new request.
function idemBucket(seconds = 10) {
  return Math.floor(Date.now() / (seconds * 1000));
}

module.exports = { idem, idemKey, idemBucket };
