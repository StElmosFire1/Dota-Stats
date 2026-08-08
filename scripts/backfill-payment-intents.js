#!/usr/bin/env node
/* eslint-disable no-console */
// Task #909 — CLI runner for the stored-payment-intent backfill. Resolves
// stripe_session_id → payment_intent for frame_purchases rows and
// founder-ring entitlements created before Task #890, so charge.refunded
// can revoke historical purchases too.
//
// Flags:
//   --dry-run        Resolve + print, write nothing
//   --limit=<n>      Max rows per kind (default 200)
//   --delay-ms=<n>   Pause between Stripe calls (default 250)
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { backfillStoredPaymentIntents } = require('../src/payments/backfillPaymentIntents');

(async () => {
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const delayArg = process.argv.find(a => a.startsWith('--delay-ms='));
  const limit = limitArg ? parseInt(limitArg.slice('--limit='.length), 10) : 200;
  const delayMs = delayArg ? parseInt(delayArg.slice('--delay-ms='.length), 10) : 250;
  console.log(`[PI Backfill CLI] starting (dryRun=${dryRun}, limit=${limit}, delayMs=${delayMs})`);
  try {
    const summary = await backfillStoredPaymentIntents({ dryRun, limit, delayMs });
    console.log('[PI Backfill CLI] done:', summary);
    process.exit(0);
  } catch (err) {
    console.error('[PI Backfill CLI] failed:', err);
    process.exit(2);
  }
})();
