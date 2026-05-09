// Task #191 — best-effort backfill of `pick_source` for draft picks made
// before Task #179 added the column. The autoStartTicker logs every
// deadline auto-pick as:
//
//   [InhouseAutoStart] Session #<sid>: pick deadline expired,
//   auto-picked <accountId> onto team <team> (pick N/8)
//
// We scan a list of log files (PM2 stdout by default) for that exact
// phrase, then stamp the matching `inhouse_session_players` rows with
// `pick_source = 'auto_deadline'`. Idempotent: only rows whose
// `pick_source IS NULL` are touched, so re-runs and overlapping log
// rotations are safe.

const fs = require('fs');
const os = require('os');
const path = require('path');

// Matches the log line emitted by autoStartTicker.tick() (full edition,
// inhouse path) — see src/inhouse/autoStartTicker.js.
const LINE_RE =
  /Session #(\d+): pick deadline expired, auto-picked (\d+) onto team (\d+)/;

function defaultLogPaths() {
  const fromEnv = (process.env.INHOUSE_LOG_PATHS || '')
    .split(/[,;]/).map(s => s.trim()).filter(Boolean);
  if (fromEnv.length) return fromEnv;
  // PM2's default output log layout — both prod editions write here.
  const home = os.homedir();
  return [
    path.join(home, '.pm2', 'logs', 'oi-bot-out.log'),
    path.join(home, '.pm2', 'logs', 'oi-bot-error.log'),
    path.join(home, '.pm2', 'logs', 'inhouse-bot-out.log'),
    path.join(home, '.pm2', 'logs', 'inhouse-bot-error.log'),
  ];
}

// Parse a list of log file paths into a Set of "<sessionId>:<accountId>"
// candidate keys. Missing files are skipped silently — PM2 may have
// rotated them away or only one of the two editions runs on this host.
function parseLogs(paths, logger = console) {
  const candidates = new Map(); // key -> { sessionId, accountId, team, hits }
  let filesScanned = 0;
  let linesScanned = 0;
  for (const p of paths) {
    let text;
    try {
      text = fs.readFileSync(p, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`[BackfillPickSource] could not read ${p}: ${err.message}`);
      }
      continue;
    }
    filesScanned++;
    for (const line of text.split(/\r?\n/)) {
      linesScanned++;
      const m = line.match(LINE_RE);
      if (!m) continue;
      const sessionId = parseInt(m[1], 10);
      const accountId = String(m[2]);
      const team = parseInt(m[3], 10);
      const key = `${sessionId}:${accountId}`;
      const cur = candidates.get(key);
      if (cur) cur.hits++;
      else candidates.set(key, { sessionId, accountId, team, hits: 1 });
    }
  }
  return { candidates, filesScanned, linesScanned };
}

async function backfillPickSource(getPool, opts = {}) {
  const logger = opts.logger || console;
  const dryRun = !!opts.dryRun;
  const logPaths = (opts.logPaths && opts.logPaths.length)
    ? opts.logPaths
    : defaultLogPaths();
  logger.log(`[BackfillPickSource] scanning ${logPaths.length} log path(s) (dryRun=${dryRun})`);

  const { candidates, filesScanned, linesScanned } = parseLogs(logPaths, logger);
  logger.log(`[BackfillPickSource] parsed ${filesScanned} file(s), ${linesScanned} line(s), ${candidates.size} unique (session, account) pair(s) seen`);

  const pool = getPool();
  const updates = [];   // rows we will / would stamp
  const skipped = [];   // rows already stamped (or with a non-null source)
  const missing = [];   // log entries whose row no longer exists

  for (const cand of candidates.values()) {
    let row;
    try {
      const r = await pool.query(
        `SELECT session_id, account_id, team, pick_order, pick_source
           FROM inhouse_session_players
          WHERE session_id = $1 AND account_id = $2`,
        [cand.sessionId, cand.accountId]
      );
      row = r.rows[0];
    } catch (err) {
      logger.warn(`[BackfillPickSource] lookup failed s${cand.sessionId}/${cand.accountId}: ${err.message}`);
      continue;
    }
    if (!row) {
      missing.push(cand);
      continue;
    }
    if (row.pick_source != null) {
      skipped.push({ ...cand, existing: row.pick_source });
      continue;
    }
    // Sanity-check the team matches what the log claimed. A mismatch
    // would mean the auto-pick log and the eventual seat disagree —
    // refuse to stamp rather than risk corrupting a manual override.
    if (row.team != null && Number(row.team) !== cand.team) {
      logger.warn(`[BackfillPickSource] team mismatch s${cand.sessionId}/${cand.accountId}: log=${cand.team} db=${row.team}, skipping`);
      continue;
    }
    updates.push({ ...cand, pick_order: row.pick_order });
  }

  // Print the proposed updates either way — operators want to see what
  // they would have stamped before committing.
  for (const u of updates) {
    logger.log(`[BackfillPickSource] ${dryRun ? 'WOULD STAMP' : 'STAMP'} session=${u.sessionId} account=${u.accountId} team=${u.team} pick_order=${u.pick_order} (log hits=${u.hits})`);
  }

  let stamped = 0;
  if (!dryRun && updates.length) {
    for (const u of updates) {
      try {
        // Idempotent: the WHERE pick_source IS NULL guard means a
        // concurrent ticker run between the SELECT above and this UPDATE
        // (or a re-run of the backfill itself) won't double-stamp.
        const r = await pool.query(
          `UPDATE inhouse_session_players
              SET pick_source = 'auto_deadline'
            WHERE session_id = $1 AND account_id = $2
              AND pick_source IS NULL`,
          [u.sessionId, u.accountId]
        );
        if (r.rowCount > 0) stamped++;
      } catch (err) {
        logger.warn(`[BackfillPickSource] update failed s${u.sessionId}/${u.accountId}: ${err.message}`);
      }
    }
  }

  const summary = {
    filesScanned,
    linesScanned,
    candidates: candidates.size,
    proposed: updates.length,
    stamped,
    alreadyStamped: skipped.length,
    missing: missing.length,
    dryRun,
  };
  logger.log(`[BackfillPickSource] done: ${JSON.stringify(summary)}`);
  return summary;
}

module.exports = {
  backfillPickSource,
  defaultLogPaths,
  parseLogs,
  LINE_RE,
};
