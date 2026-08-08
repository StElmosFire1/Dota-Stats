// Task #897 — payment-webhook failure alerting.
//
// The Payment Review admin page shows stuck payment events, but only when
// someone looks. This module makes the Stripe webhook pipeline shout the
// moment it starts breaking: signature rejects, handler errors, and inbox
// rows stuck unclaimed/failed past a threshold all funnel into the central
// error monitor, which posts to ERROR_ALERT_WEBHOOK_URL (falling back to
// OWNER_ALERT_WEBHOOK_URL) with the existing rate limiting (max 5 alerts/min)
// and per-signature dedupe (10 min) — an error loop can't flood the channel.
//
// Never throws — alerting must not take down the payment path it watches.

const { reportError, postWebhookAlert } = require('./errorMonitor');

// How old (minutes) an inbox row can be while still failed / unclaimed
// before the periodic sweep raises an alert. Override with
// STRIPE_INBOX_STUCK_MINUTES; default 30 min (two retry-sweep cycles plus
// slack, so a single transient failure that heals itself stays quiet).
const STUCK_THRESHOLD_MINUTES = (() => {
  const n = parseInt(process.env.STRIPE_INBOX_STUCK_MINUTES ?? '30', 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
})();

/**
 * Report a Stripe webhook processing failure (signature reject, inbox write
 * failure, or handler error). Funnels through the central error monitor so
 * alerts are logged, redacted, rate-limited and deduped.
 * @param {Error|any} err
 * @param {object} context — { phase: 'request'|'handler'|'retry-sweep', eventType?, eventId? }
 */
function reportPaymentWebhookFailure(err, context = {}) {
  try {
    reportError(err, {
      source: `stripe-webhook:${context.phase || 'request'}`,
      route: '/api/stripe/webhook',
      ...context,
    });
  } catch (_) { /* never throw from the alert path */ }
}

/**
 * Periodic stuck-inbox check. Counts failed rows and stale-claimed
 * received/processing rows older than the threshold; alerts when any exist
 * (purchases may not be activating). Returns the counts (or null when the
 * db helper is unavailable, e.g. lightweight test stubs).
 */
// Task #911 — remember whether the last stuck-inbox check alerted, so the
// first subsequent all-clear check can post a one-shot recovery ping. The
// recovery message goes straight to the webhook (postWebhookAlert) rather
// than through reportError: it's informational, must not consume the error
// burst budget, and must not be suppressed by the 10-min dedupe if the
// inbox re-breaks and re-recovers quickly. The flag itself guarantees a
// single ping per alert episode. Process-local by design: a restart while
// stuck simply re-alerts on the next sweep, re-arming recovery.
let _stuckAlertActive = false;

/**
 * Periodic stuck-inbox check. Counts failed rows and stale-claimed
 * received/processing rows older than the threshold; alerts when any exist
 * (purchases may not be activating). Returns the counts (or null when the
 * db helper is unavailable, e.g. lightweight test stubs).
 */
async function checkStuckStripeInbox(db, { thresholdMinutes = STUCK_THRESHOLD_MINUTES } = {}) {
  if (!db || typeof db.countStuckStripeWebhookEvents !== 'function') return null;
  let counts = null;
  try {
    counts = await db.countStuckStripeWebhookEvents({ olderThanMinutes: thresholdMinutes });
  } catch (e) {
    // A broken count query is itself a monitoring failure worth knowing about,
    // but don't alert-loop on it — reportError's dedupe covers repeats.
    // Deliberately does NOT touch _stuckAlertActive: we can't tell whether
    // the backlog drained, so no false "recovered" ping.
    reportError(e, { source: 'stripe-inbox-stuck-check' });
    return null;
  }
  if (counts && counts.total > 0) {
    _stuckAlertActive = true;
    reportError(
      new Error(
        `${counts.total} Stripe webhook inbox event(s) stuck past ${thresholdMinutes} min ` +
        `(${counts.failed} failed, ${counts.stale} unclaimed/processing) — ` +
        `purchases may not be activating. See AdminPanel → Payment Review.`
      ),
      { source: 'stripe-inbox-stuck' }
    );
  } else if (counts && counts.total === 0 && _stuckAlertActive) {
    _stuckAlertActive = false;
    try {
      await postWebhookAlert(
        '✅ [stripe-inbox-stuck] Recovered: the Stripe webhook inbox is clear again — ' +
        'no failed or stuck events remain. No action needed.'
      );
    } catch (_) { /* never throw from the alert path */ }
  }
  return counts;
}

// Test-only: reset the recovery latch between test cases.
function _resetStuckAlertStateForTest() {
  _stuckAlertActive = false;
}

module.exports = {
  reportPaymentWebhookFailure,
  checkStuckStripeInbox,
  STUCK_THRESHOLD_MINUTES,
  _resetStuckAlertStateForTest,
};
