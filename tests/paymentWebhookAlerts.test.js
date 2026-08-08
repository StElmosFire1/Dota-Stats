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
  _resetStuckAlertStateForTest,
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
  _resetStuckAlertStateForTest(); // prior test latched an alert; clear-with-no-prior-alert must stay silent
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

// ── Task #911 — recovery all-clear ping ─────────────────────────────────────
// These run after the burst-cap test above, which proves recovery pings do
// NOT go through the rate-limited error path: they must post even when the
// error burst window is exhausted.

const stuckDb = (total, failed = total, stale = 0) => ({
  async countStuckStripeWebhookEvents() { return { failed, stale, total }; },
});

test('a recovery ping is posted once the inbox drains after an alert', async () => {
  _resetStuckAlertStateForTest();
  posts.length = 0;
  await checkStuckStripeInbox(stuckDb(2, 2, 0)); // alert (suppressed by burst cap, but latches)
  posts.length = 0;
  await checkStuckStripeInbox(stuckDb(0, 0, 0));
  await tick(); await tick();
  assert.equal(posts.length, 1, 'exactly one recovery ping');
  assert.match(posts[0].body.content, /Recovered/);
  assert.match(posts[0].body.content, /inbox is clear/i);
});

test('the recovery ping is one-shot — repeated clear checks stay silent', async () => {
  posts.length = 0;
  await checkStuckStripeInbox(stuckDb(0, 0, 0));
  await checkStuckStripeInbox(stuckDb(0, 0, 0));
  await tick(); await tick();
  assert.equal(posts.length, 0);
});

test('no recovery ping when no alert was previously fired', async () => {
  _resetStuckAlertStateForTest();
  posts.length = 0;
  await checkStuckStripeInbox(stuckDb(0, 0, 0));
  await tick(); await tick();
  assert.equal(posts.length, 0);
});

test('a failing count query does not clear the latch or fake a recovery', async () => {
  _resetStuckAlertStateForTest();
  posts.length = 0;
  await checkStuckStripeInbox(stuckDb(1, 1, 0)); // latch
  posts.length = 0;
  await checkStuckStripeInbox({
    async countStuckStripeWebhookEvents() { throw new Error('relation gone again'); },
  });
  await tick(); await tick();
  // Only the (deduped) check-failure report may appear — never a recovery ping.
  assert.ok(!posts.some(p => /Recovered/.test(p.body.content)), 'no recovery on query failure');
  posts.length = 0;
  await checkStuckStripeInbox(stuckDb(0, 0, 0)); // real drain → ping fires now
  await tick(); await tick();
  assert.equal(posts.length, 1);
  assert.match(posts[0].body.content, /Recovered/);
});

test('a re-break after recovery re-arms the ping', async () => {
  _resetStuckAlertStateForTest();
  posts.length = 0;
  await checkStuckStripeInbox(stuckDb(3, 1, 2));
  await checkStuckStripeInbox(stuckDb(0, 0, 0)); // recovery #1
  await checkStuckStripeInbox(stuckDb(1, 1, 0)); // re-break
  await checkStuckStripeInbox(stuckDb(0, 0, 0)); // recovery #2
  await tick(); await tick();
  const recoveries = posts.filter(p => /Recovered/.test(p.body.content));
  assert.equal(recoveries.length, 2, 'each alert episode gets its own recovery ping');
});

test('alert text redacts the Stripe secret key', () => {
  const { redact } = require('../src/observability/errorMonitor');
  const out = redact(`auth failed for key ${process.env.STRIPE_SECRET_KEY}`);
  assert.ok(!out.includes(process.env.STRIPE_SECRET_KEY));
  assert.match(out, /REDACTED/);
});
