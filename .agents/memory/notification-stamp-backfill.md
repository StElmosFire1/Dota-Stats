---
name: Notification one-shot stamp columns need rollout backfill
description: Adding a NULL "already-notified" marker column to an existing table will blast historical rows on the first sweep unless backfilled at migration time.
---

# Rule
When you add a one-shot notification marker column (e.g. `paid_notified_at`,
`connect_notified_at`) to an existing table and a sweep selects rows
`WHERE marker IS NULL`, you MUST backfill the marker for pre-existing rows that
already satisfy the trigger condition — at migration time, gated to run ONLY on
the boot that first creates the column.

**Why:** the column defaults NULL for every existing row, so the first sweep
treats long-since-completed rows as "needs notification" and DMs/pushes
historical users (real-money receipts, in the payout case). High user-facing
spam + trust damage.

**How to apply:** in `src/db/index.js` schema migration, check
`information_schema.columns` for the column BEFORE the `ALTER ... ADD COLUMN IF
NOT EXISTS`; if it didn't exist, run a one-time `UPDATE ... SET marker = NOW()
WHERE <trigger condition already met>`. Guard with the pre-existence flag so it
never re-stamps legitimately-new NULL rows on later boots.

**Test it:** live-DB regression using a `CREATE TEMP TABLE ... ON COMMIT DROP`
inside a `BEGIN/ROLLBACK` — mirror the backfill SQL + the candidate-selection
WHERE, assert historical rows get stamped (excluded) while a new transition
post-rollout is still selected. Never touch real rows.
