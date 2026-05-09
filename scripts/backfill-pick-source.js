#!/usr/bin/env node
/* eslint-disable no-console */
// Task #191 — CLI runner for backfilling pick_source on historical
// inhouse_session_players rows. Mirrors !backfill-pick-source on Discord.
//
// Flags:
//   --dry-run                 Print proposed stamps without writing
//   --log=<path>              Add a log file to scan (repeatable)
//
// Default log paths: $INHOUSE_LOG_PATHS (comma-separated) if set,
// otherwise PM2's default oi-bot / inhouse-bot stdout+stderr files
// under ~/.pm2/logs/.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const db = require('../src/db');
const { backfillPickSource } = require('../src/inhouse/backfillPickSource');

(async () => {
  const dryRun = process.argv.includes('--dry-run');
  const logPaths = process.argv
    .filter(a => a.startsWith('--log='))
    .map(a => a.slice('--log='.length));
  console.log(`[BackfillPickSource CLI] starting (dryRun=${dryRun}, logPaths=${logPaths.length || 'defaults'})`);
  try {
    await db.initSchema();
    const r = await backfillPickSource(db.getPool, { dryRun, logPaths });
    console.log('[BackfillPickSource CLI] done:', r);
    process.exit(0);
  } catch (err) {
    console.error('[BackfillPickSource CLI] failed:', err);
    process.exit(2);
  }
})();
