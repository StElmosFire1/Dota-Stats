// Task #855 — integration tests for the webhook-inbox claim LEASE against a
// real Postgres database. Proves that a worker whose lease was taken over
// (stale-claim recovery) cannot overwrite the new owner's terminal state.
// Skipped when no DATABASE_URL is available.

const test = require('node:test');
const assert = require('node:assert/strict');

const HAS_DB = !!process.env.DATABASE_URL;
const EVT = 'evt_lease_test_1';

test('claim lease: stale takeover invalidates the original worker\'s terminal writes', { skip: !HAS_DB && 'DATABASE_URL not set' }, async () => {
  const db = require('../src/db');
  await db.init();
  const pool = db.getPool();
  await pool.query('DELETE FROM stripe_webhook_inbox WHERE event_id = $1', [EVT]);
  try {
    // Worker A receives + claims the event.
    const a = await db.recordStripeWebhookEvent({ id: EVT, type: 'test', data: {} });
    assert.equal(a.claimed, true);
    assert.ok(a.claimToken);

    // While A is live, nobody else can claim, and duplicates defer.
    assert.equal(await db.claimStripeWebhookEvent(EVT), null);
    const dup = await db.recordStripeWebhookEvent({ id: EVT, type: 'test', data: {} });
    assert.equal(dup.claimed, false);

    // A's lease goes stale (simulated crash / overlong processing) …
    await pool.query(
      `UPDATE stripe_webhook_inbox SET claimed_at = NOW() - INTERVAL '20 minutes' WHERE event_id = $1`,
      [EVT]
    );
    // … and the row becomes visible to the retry sweep.
    const retryable = await db.listRetryableStripeWebhookEvents({});
    assert.ok(retryable.some(r => r.event_id === EVT), 'stale processing row is sweep-eligible');

    // Worker B (the sweep) takes over with a fresh token.
    const bToken = await db.claimStripeWebhookEvent(EVT);
    assert.ok(bToken);
    assert.notEqual(bToken, a.claimToken);

    // A wakes up and tries to write terminal state with its OLD token — both
    // writes must be no-ops.
    assert.equal(await db.markStripeWebhookProcessed(EVT, a.claimToken), false);
    assert.equal(await db.markStripeWebhookFailed(EVT, 'late failure', a.claimToken), false);
    let row = (await pool.query('SELECT status FROM stripe_webhook_inbox WHERE event_id = $1', [EVT])).rows[0];
    assert.equal(row.status, 'processing', 'lost lease cannot overwrite the new owner');

    // B's terminal write with the CURRENT token applies.
    assert.equal(await db.markStripeWebhookProcessed(EVT, bToken), true);
    row = (await pool.query('SELECT status, claim_token FROM stripe_webhook_inbox WHERE event_id = $1', [EVT])).rows[0];
    assert.equal(row.status, 'processed');
    assert.equal(row.claim_token, null, 'token cleared on terminal state');

    // Processed rows can never be reclaimed or re-marked.
    assert.equal(await db.claimStripeWebhookEvent(EVT), null);
    assert.equal(await db.markStripeWebhookFailed(EVT, 'x', bToken), false);
    const rec = await db.recordStripeWebhookEvent({ id: EVT, type: 'test', data: {} });
    assert.deepEqual({ claimed: rec.claimed, status: rec.status }, { claimed: false, status: 'processed' });
  } finally {
    await pool.query('DELETE FROM stripe_webhook_inbox WHERE event_id = $1', [EVT]);
  }
});
