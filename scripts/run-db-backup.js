#!/usr/bin/env node
// Task #896 — manual trigger for the nightly DB backup job. Runs the exact
// same code path as the 02:30 cron (dump → prune → rclone sync off-host),
// including failure alerting. Use it to verify the backup pipeline end-to-end
// after configuring rclone, or for an ad-hoc pre-change dump.
//
//   node scripts/run-db-backup.js
//
// Exit code 0 on success, 1 on any failure (details also hit the error
// alert webhook + the nightly_db_backup heartbeat). See docs/db-backups.md.
'use strict';
require('dotenv').config();

const { runNightlyBackup } = require('../src/jobs/nightlyDbBackup');

runNightlyBackup().then((res) => {
  if (res.ok) {
    console.log(`[Backup] OK — ${res.file}${res.shipped ? ' (shipped off-host)' : ' (LOCAL ONLY — not shipped off-host)'}`);
    process.exit(0);
  }
  console.error(`[Backup] FAILED — ${res.error}`);
  process.exit(1);
}).catch((err) => {
  console.error('[Backup] FAILED —', err.message);
  process.exit(1);
});
