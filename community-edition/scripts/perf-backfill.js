#!/usr/bin/env node
/* eslint-disable no-console */
// CLI runner for backfilling PERF scores. Mirrors the !perf-backfill Discord
// command. Flags:
//   --all      Recompute every match (not just pending NULL perf rows)
//   --limit=N  Cap to N matches (default: all)
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const db = require('../src/db');
const { backfillPerf } = require('../src/perf/perfService');

(async () => {
  const all = process.argv.includes('--all');
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
  console.log(`[PERF backfill CLI] starting (all=${all}, limit=${limit || 'none'})`);
  try {
    await db.initSchema();
    const r = await backfillPerf(db.getPool, { limit, batchSize: 50, sleepMs: 250, all });
    console.log(`[PERF backfill CLI] done:`, r);
    process.exit(r.failed > 0 ? 1 : 0);
  } catch (err) {
    console.error(`[PERF backfill CLI] failed:`, err);
    process.exit(2);
  }
})();
