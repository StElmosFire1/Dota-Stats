// Task #897 — payment-webhook failure alerting.
//
// Locks in the contract of src/observability/paymentAlerts.js:
//   - reportPaymentWebhookFailure posts to ERROR_ALERT_WEBHOOK_URL via the
//     central error monitor, tagged with a stripe-webhook source.
//   - Repeats of the same failure are deduped (10-min per-signature window)
//     so a webhook error loop can't flood the Discord channel.
//   - checkStuckStripeInbox alerts when the db reports stuck inbox rows,
//     stays quiet when none are stuck, and tolerates a missing db helper.
//   - Alert text never contains the Stripe secret key (redaction).

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ERROR_ALERT_WEBHOOK_URL = 'https://discord.example/webhook/test-897';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_task897secretvalue123';

// Capture webhook posts made by the error monitor.
const posts = [];
global.fetch = async (url, opts) => {
  posts.push({ url, body: JSON.parse(opts.body) });
  return { ok: true };
};

const {
  reportPaymentWebhookFailure,
  checkStuckStripeInbox,
  STUCK_THRESHOLD_MINUTES,
} = require('../src/observability/paymentAlerts');

const tick = () => new Promise((r) => setImmediate(r));

test('reportPaymentWebhookFailure posts an alert tagged with the webhook source', async () => {
  posts.length = 0;
  reportPaymentWebhookFailure(new Error('No signatures found matching the expected signature'), {
    phase: 'request',
  });
  await tick(); await tick();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, 'https://discord.example/webhook/test-897');
  const text = posts[0].body.content;
  assert.match(text, /stripe-webhook:request/);
  assert.match(text, /No signatures found/);
});

test('repeated identical failures are deduped — no alert flood', async () => {
  posts.length = 0;
  for (let i = 0; i < 10; i++) {
    reportPaymentWebhookFailure(new Error('handler exploded: pool timeout'), {
      phase: 'handler', eventType: 'checkout.session.completed',
    });
  }
  await tick(); await tick();
  assert.equal(posts.length, 1, 'same signature must alert at most once per dedupe window');
});

test('distinct failure phases alert independently (retry-sweep is its own signature)', async () => {
  posts.length = 0;
  reportPaymentWebhookFailure(new Error('handler exploded: pool timeout'), {
    phase: 'retry-sweep', eventType: 'checkout.session.completed', eventId: 'evt_1',
  });
  await tick(); await tick();
  assert.equal(posts.length, 1);
  assert.match(posts[0].body.content, /stripe-webhook:retry-sweep/);
});

test('checkStuckStripeInbox alerts when rows are stuck past the threshold', async () => {
  posts.length = 0;
  const dbStub = {
    async countStuckStripeWebhookEvents({ olderThanMinutes }) {
      assert.equal(olderThanMinutes, STUCK_THRESHOLD_MINUTES);
      return { failed: 2, stale: 1, total: 3 };
    },
  };
  const counts = await checkStuckStripeInbox(dbStub);
  await tick(); await tick();
  assert.deepEqual(counts, { failed: 2, stale: 1, total: 3 });
  assert.equal(posts.length, 1);
  const text = posts[0].body.content;
  assert.match(text, /stripe-inbox-stuck/);
  assert.match(text, /3 Stripe webhook inbox event/);
  assert.match(text, /2 failed, 1 unclaimed/);
});

test('checkStuckStripeInbox stays quiet when nothing is stuck', async () => {
  posts.length = 0;
  const counts = await checkStuckStripeInbox({
    async countStuckStripeWebhookEvents() { return { failed: 0, stale: 0, total: 0 }; },
  });
  await tick(); await tick();
  assert.deepEqual(counts, { failed: 0, stale: 0, total: 0 });
  assert.equal(posts.length, 0);
});

test('checkStuckStripeInbox tolerates a db stub without the helper', async () => {
  posts.length = 0;
  assert.equal(await checkStuckStripeInbox({}), null);
  assert.equal(await checkStuckStripeInbox(null), null);
  assert.equal(posts.length, 0);
});

test('a failing count query is reported but never throws', async () => {
  posts.length = 0;
  const counts = await checkStuckStripeInbox({
    async countStuckStripeWebhookEvents() { throw new Error('relation gone'); },
  });
  await tick(); await tick();
  assert.equal(counts, null);
  assert.equal(posts.length, 1);
  assert.match(posts[0].body.content, /stripe-inbox-stuck-check/);
});

test('the alert burst cap holds — a flood of distinct errors stops posting', () => {
  // The previous tests consumed the 5-alert/min burst window; further
  // distinct errors in the same window must NOT post (flood protection).
  posts.length = 0;
  reportPaymentWebhookFailure(new Error(`unique flood error ${Math.PI}`), { phase: 'request' });
  assert.equal(posts.length, 0, 'burst cap must suppress further alerts in the window');
});

test('alert text redacts the Stripe secret key', () => {
  const { redact } = require('../src/observability/errorMonitor');
  const out = redact(`auth failed for key ${process.env.STRIPE_SECRET_KEY}`);
  assert.ok(!out.includes(process.env.STRIPE_SECRET_KEY));
  assert.match(out, /REDACTED/);
});
