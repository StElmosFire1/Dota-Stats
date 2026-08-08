// Task #896 — Nightly full-database backup, shipped OFF the bot host.
//
// Why: the admin panel's manual "Backup DB" button only snapshots three
// ratings tables INTO the same database — if the DB host dies, match history,
// purchases and Stripe records die with it. This job takes a full `pg_dump`
// every night, prunes on a retention window (14 daily + 8 weekly), and ships
// the surviving dumps off-host via rclone (works with S3/Spaces/B2/sftp/...).
//
// Failure posture: silent failure is impossible. Every failed step goes
// through reportError() (→ ERROR_ALERT_WEBHOOK_URL Discord ping) AND flips
// the `nightly_db_backup` cron heartbeat to 'error' (visible in AdminPanel →
// System heartbeats). In production, "off-host shipping not configured" is
// itself treated as a failure unless BACKUP_ALLOW_LOCAL_ONLY=1 is set
// explicitly — a backup that lives only on the host it protects is not a
// backup.
//
// Env vars (see docs/db-backups.md + docs/env-vars.md):
//   BACKUP_LOCAL_DIR        staging dir for dumps (default ~/backups/nightly)
//   BACKUP_RCLONE_REMOTE    rclone destination, e.g. `spaces:oi-backups/nightly`
//   BACKUP_KEEP_DAILY       daily dumps to keep (default 14)
//   BACKUP_KEEP_WEEKLY      Sunday dumps to keep beyond the daily window (default 8)
//   BACKUP_ALLOW_LOCAL_ONLY set to 1 to suppress the prod "no remote" alert
//   BACKUP_PG_DUMP_PATH     override the pg_dump binary (default `pg_dump` on PATH)
//   BACKUP_RCLONE_PATH      override the rclone binary (default `rclone` on PATH)

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const DUMP_RE = /^nightly-(\d{4})(\d{2})(\d{2})-\d{6}\.dump$/;

function _parseDumpDate(name) {
  const m = DUMP_RE.exec(name);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Pure retention policy: given the dump filenames present, return the ones
 * to DELETE. Keeps the newest `keepDaily` dumps (one slot per file), plus the
 * newest `keepWeekly` Sunday (UTC) dumps beyond those. Non-matching filenames
 * are never touched (manual/pre-migration dumps stay put).
 */
function selectPrunable(filenames, { keepDaily = 14, keepWeekly = 8 } = {}) {
  const dumps = filenames
    .map(name => ({ name, date: _parseDumpDate(name) }))
    .filter(x => x.date)
    .sort((a, b) => b.name.localeCompare(a.name)); // newest first (timestamped names sort lexically)

  const keep = new Set();
  for (const d of dumps.slice(0, keepDaily)) keep.add(d.name);

  let weeklies = 0;
  for (const d of dumps) {
    if (weeklies >= keepWeekly) break;
    if (d.date.getUTCDay() === 0) { // Sunday
      if (!keep.has(d.name)) keep.add(d.name);
      weeklies++;
    }
  }

  return dumps.filter(d => !keep.has(d.name)).map(d => d.name);
}

function _execFileP(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 8 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = String(stderr || '').slice(0, 2000);
        return reject(err);
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function _localDir() {
  return process.env.BACKUP_LOCAL_DIR || path.join(os.homedir(), 'backups', 'nightly');
}

/**
 * Run one full backup cycle: dump → prune → ship off-host.
 * Never throws; returns { ok, file?, shipped, pruned, error? }.
 * Injectable deps for tests: { execFileP, reportError, recordHeartbeat, now }.
 */
async function runNightlyBackup(deps = {}) {
  const execFileP = deps.execFileP || _execFileP;
  const reportError = deps.reportError || require('../observability/errorMonitor').reportError;
  const recordHeartbeat = deps.recordHeartbeat || (async (h) => {
    try { await require('../db').recordCronHeartbeat(h); } catch (_) {}
  });
  const now = deps.now || new Date();

  const isProd = process.env.NODE_ENV === 'production';
  const remote = (process.env.BACKUP_RCLONE_REMOTE || '').trim();
  const localDir = _localDir();
  const keepDaily = parseInt(process.env.BACKUP_KEEP_DAILY, 10) || 14;
  const keepWeekly = parseInt(process.env.BACKUP_KEEP_WEEKLY, 10) || 8;
  const pgDump = process.env.BACKUP_PG_DUMP_PATH || 'pg_dump';
  const rclone = process.env.BACKUP_RCLONE_PATH || 'rclone';

  const fail = async (step, err) => {
    const msg = `${step}: ${err && err.message ? err.message : String(err)}`;
    reportError(err instanceof Error ? err : new Error(msg), { source: 'nightly_db_backup', step });
    await recordHeartbeat({ name: 'nightly_db_backup', status: 'error', message: msg.slice(0, 480) });
    return { ok: false, shipped: false, pruned: [], error: msg };
  };

  if (!process.env.DATABASE_URL) {
    return fail('preflight', new Error('DATABASE_URL is not set — cannot back up the database'));
  }

  // 1. Dump
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
  const fileName = `nightly-${stamp.slice(0, 8)}-${stamp.slice(8)}.dump`;
  const filePath = path.join(localDir, fileName);
  try {
    fs.mkdirSync(localDir, { recursive: true });
    await execFileP(pgDump, ['--no-password', '-Fc', '-f', filePath, process.env.DATABASE_URL]);
    const size = fs.statSync(filePath).size;
    if (!size) throw new Error('pg_dump produced an empty file');
    console.log(`[Backup] nightly dump written: ${filePath} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  } catch (err) {
    try { fs.rmSync(filePath, { force: true }); } catch (_) {}
    return fail('pg_dump', err);
  }

  // 2. Prune local staging dir on the retention window.
  let pruned = [];
  try {
    const names = fs.readdirSync(localDir);
    pruned = selectPrunable(names, { keepDaily, keepWeekly });
    for (const name of pruned) fs.rmSync(path.join(localDir, name), { force: true });
    if (pruned.length) console.log(`[Backup] pruned ${pruned.length} old dump(s): ${pruned.join(', ')}`);
  } catch (err) {
    // Pruning failure is non-fatal for the backup itself, but must not be silent.
    reportError(err, { source: 'nightly_db_backup', step: 'prune' });
  }

  // 3. Ship off-host. `rclone sync` mirrors the (already-pruned) staging dir,
  // so retention applies to the remote automatically.
  let shipped = false;
  if (remote) {
    try {
      await execFileP(rclone, ['sync', localDir, remote, '--include', 'nightly-*.dump']);
      shipped = true;
      console.log(`[Backup] synced to off-host remote ${remote}`);
    } catch (err) {
      const wrapped = new Error(`rclone sync to ${remote} failed: ${err.message}${err.stderr ? ` — ${err.stderr.slice(0, 300)}` : ''}`);
      return fail('rclone_sync', wrapped);
    }
  } else if (isProd && process.env.BACKUP_ALLOW_LOCAL_ONLY !== '1') {
    // A dump that only exists on the host it protects is not off-host backup.
    return fail('offhost_config', new Error(
      'BACKUP_RCLONE_REMOTE is not set in production — nightly dump was written locally ' +
      `(${filePath}) but NOT shipped off-host. Configure rclone + BACKUP_RCLONE_REMOTE ` +
      '(see docs/db-backups.md), or set BACKUP_ALLOW_LOCAL_ONLY=1 to accept the risk explicitly.'
    ));
  }

  await recordHeartbeat({
    name: 'nightly_db_backup',
    status: 'ok',
    message: `dump ${fileName}${shipped ? ` shipped to ${remote}` : ' (local only)'}; pruned ${pruned.length}`,
  });
  return { ok: true, file: filePath, shipped, pruned };
}

module.exports = { runNightlyBackup, selectPrunable, DUMP_RE };
