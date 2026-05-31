// Task #582 — regression for the paid-receipt rollout backfill.
//
// `paid_notified_at` is added NULL-by-default. Without a one-time backfill the
// first settlement sweep would treat every payout that was ALREADY 'paid'
// before this feature shipped as "needs a receipt" and DM/push historical
// winners about money paid long ago. The migration stamps those rows once (only
// when the column was just created). This test pins both halves of that
// contract against the live DB using a self-contained temp table, so it never
// touches real payout rows:
//   1. the backfill UPDATE stamps pre-existing 'paid' rows, and
//   2. the candidate-selection WHERE (mirrors getPayoutsNeedingPaidReceipt)
//      then excludes those backfilled rows while still selecting a genuinely
//      new paid row that transitions after rollout.
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db/index.js');

const BACKFILL_SQL = `
  UPDATE _t582_payouts SET paid_notified_at = NOW()
   WHERE transfer_status = 'paid' AND paid_notified_at IS NULL`;

// Mirrors the live getPayoutsNeedingPaidReceipt() WHERE clause.
const CANDIDATE_SQL = `
  SELECT id FROM _t582_payouts
   WHERE transfer_status = 'paid'
     AND amount_cents > 0
     AND paid_notified_at IS NULL
   ORDER BY id`;

test('rollout backfill stamps historical paid rows so they never get a receipt', async () => {
  await db.init();
  const p = db.getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE _t582_payouts (
        id            SERIAL PRIMARY KEY,
        transfer_status TEXT,
        amount_cents  INTEGER,
        paid_notified_at TIMESTAMPTZ
      ) ON COMMIT DROP`);

    // Seed the world as it looks the instant the column is added:
    //  1 = historical paid prize (predates the feature) -> must be backfilled
    //  2 = pending payout                               -> stays NULL, not a candidate
    //  3 = paid but zero-amount (e.g. placeholder)      -> excluded by amount_cents > 0
    await client.query(`
      INSERT INTO _t582_payouts (transfer_status, amount_cents, paid_notified_at) VALUES
        ('paid',    5000, NULL),
        ('pending', 2500, NULL),
        ('paid',       0, NULL)`);

    // Before backfill the historical paid prize would be picked up as a receipt.
    const before = await client.query(CANDIDATE_SQL);
    assert.deepEqual(before.rows.map(r => r.id), [1], 'pre-backfill: historical paid row is a candidate');

    await client.query(BACKFILL_SQL);

    // After backfill it is stamped, so the sweep skips it — no historical blast.
    const after = await client.query(CANDIDATE_SQL);
    assert.equal(after.rows.length, 0, 'post-backfill: no historical receipts pending');

    // The backfill stamps every 'paid' row (mirrors the real migration, which
    // has no amount filter) — both the real prize (1) and the zero-amount paid
    // placeholder (3). The pending row (2) stays NULL. Zero-amount rows are
    // never receipt candidates anyway, so stamping them is harmless.
    const stamped = await client.query(
      `SELECT id FROM _t582_payouts WHERE paid_notified_at IS NOT NULL ORDER BY id`);
    assert.deepEqual(stamped.rows.map(r => r.id), [1, 3], 'every pre-existing paid row was stamped');

    // A genuinely new payout that transitions to 'paid' AFTER rollout must still
    // be selected — the backfill must not poison new transitions.
    await client.query(
      `INSERT INTO _t582_payouts (transfer_status, amount_cents, paid_notified_at)
       VALUES ('paid', 7500, NULL)`);
    const newPaid = await client.query(CANDIDATE_SQL);
    assert.deepEqual(newPaid.rows.map(r => r.id), [4], 'a new paid transition is still a receipt candidate');
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
});
