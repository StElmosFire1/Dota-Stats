// Task #417 — Instrumented Stripe client.
//
// Returns a single cached Stripe instance wrapped in a recursive Proxy that
// records every SDK method call as `stripe.call.count` + `stripe.call.duration_ms`
// metrics (and a span via withSpan). Call sites use:
//
//   const stripe = require('../observability/stripeClient').getStripe();
//
// instead of `require('stripe')(process.env.STRIPE_SECRET_KEY)`. The proxy
// is transparent: every resource (checkout.sessions, refunds, subscriptions,
// accounts, accountLinks, paymentIntents, billingPortal, webhooks…) keeps
// working identically.

'use strict';

const metrics = require('./metrics');
const { withSpan } = require('./tracing');

// NOTE: do NOT cache the wrapped client across calls — test suites rely on
// re-stubbing `require('stripe')` between boots (see tests/moneyPathsCoverage,
// stripeWebhookAsyncPayment, stripeWebhookRefundsKyc). The Proxy itself is
// cheap; the underlying `require('stripe')` is module-cached by Node so the
// per-call cost is a single Proxy construction.

function _wrap(obj, path) {
  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return obj;
  return new Proxy(obj, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, recv);
      if (typeof prop === 'symbol') return v;
      // `webhooks.constructEvent` is sync + cheap. Don't wrap it (avoid
      // false-positive latency entries on every webhook hit).
      if (path === 'webhooks') return v;
      if (typeof v === 'function') {
        const op = path ? `${path}.${String(prop)}` : String(prop);
        return function instrumented(...args) {
          const start = Date.now();
          let result;
          try {
            result = v.apply(target, args);
          } catch (e) {
            metrics.recordStripeCall({ op, durationMs: Date.now() - start, ok: false });
            throw e;
          }
          if (result && typeof result.then === 'function') {
            // Wrap promise in a span too.
            return withSpan(`stripe.${op}`, { 'stripe.op': op }, () => result.then(
              (r) => {
                metrics.recordStripeCall({ op, durationMs: Date.now() - start, ok: true });
                return r;
              },
              (e) => {
                metrics.recordStripeCall({ op, durationMs: Date.now() - start, ok: false });
                throw e;
              }
            ));
          }
          metrics.recordStripeCall({ op, durationMs: Date.now() - start, ok: true });
          return result;
        };
      }
      if (v && typeof v === 'object') {
        return _wrap(v, path ? `${path}.${String(prop)}` : String(prop));
      }
      return v;
    },
  });
}

function getStripe() {
  const raw = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return _wrap(raw, '');
}

module.exports = { getStripe };
