// v5.75 — Inhouse lobby auto-start ticker.
//
// Polls active inhouse sessions every 5s and advances them through phases
// without an admin having to press buttons:
//
//   open       — once `min_players` is reached, set `auto_start_at = NOW() +
//                lobby_fill_seconds`. When that timer expires AND the lobby
//                still has min_players, flip to `accepting` and start the
//                accept-phase timer. Stragglers can still join during the
//                grace window and the timer is reset if the count drops back
//                below min_players.
//
//   accepting  — when the accept-phase timer expires, if `accepted >=
//                min_players` flip to `drafting` and auto-pick captains
//                using the session's captain_mode. Otherwise drop back to
//                `open` so the missing-accept players can rejoin or be
//                replaced by stragglers.
//
// All transitions are best-effort and idempotent — the actual phase
// changes go through the existing /api endpoints' atomic UPDATE-with-WHERE
// guards via internal HTTP calls (so we don't duplicate transition logic).

const TICK_MS = 5000;
// Task #168 — backoff for `server_failed` sessions so a persistent RCON
// outage doesn't fire the Discord admin-channel ping every 5s.
const RECOVERY_BACKOFF_MS = (Number(process.env.INHOUSE_RECOVERY_BACKOFF_SECONDS) || 60) * 1000;
const _lastFailedAttempt = new Map();
// Task #136 — drop players whose last_seen_at is older than this (default
// 45s, override via INHOUSE_HEARTBEAT_STALE_SECONDS). The frontend pings
// every 15s, so 45s gives ~3 missed pings before reclaiming the slot.
const STALE_SECONDS = Number(process.env.INHOUSE_HEARTBEAT_STALE_SECONDS) || 45;

let _timer = null;
let _logger = console;
let _sessionStore = null;

function log(...args) { _logger.log('[InhouseAutoStart]', ...args); }
function warn(...args) { _logger.warn('[InhouseAutoStart]', ...args); }

async function tick(db, basePort) {
  const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
  // Task #136 — sweep stale players first so the open/accepting reads below
  // see the freshly-trimmed roster. Failures here are non-fatal; we still
  // run the phase advancement.
  try {
    const dropped = await db.pruneStaleInhousePlayers(STALE_SECONDS);
    if (dropped.length) {
      log(`Heartbeat sweep dropped ${dropped.length} stale player row(s):`,
        dropped.map(r => `s${r.session_id}/${r.account_id}`).join(', '));
    }
  } catch (e) {
    warn('pruneStaleInhousePlayers failed:', e.message);
  }
  // Task #136 — Steam-session-validity sweep. For every active inhouse
  // seat that has a recorded express-session id, ask the session store
  // whether that session still exists. Logout, cookie expiry, and
  // store-side eviction all destroy the row, so this catches "ghost
  // seats" whose underlying Steam auth is gone without waiting for the
  // 45s heartbeat-staleness window. No-op if the session store wasn't
  // wired in (e.g. tests / non-API runners).
  if (_sessionStore && typeof _sessionStore.get === 'function') {
    try {
      const seats = await db.listInhousePlayerSessionTokens();
      const uniqueSids = Array.from(new Set(seats.map(s => s.last_session_id).filter(Boolean)));
      const liveness = new Map();
      await Promise.all(uniqueSids.map(sid => new Promise(resolve => {
        try {
          _sessionStore.get(sid, (err, sess) => {
            if (err) { liveness.set(sid, true); return resolve(); } // soft-pass on store error
            // A live Steam session has steamId64 / accountId set on it;
            // an anonymous-but-existing session row doesn't count.
            const alive = !!(sess && (sess.steamId64 || sess.accountId));
            liveness.set(sid, alive);
            resolve();
          });
        } catch (e) {
          liveness.set(sid, true); // soft-pass on throw
          resolve();
        }
      })));
      const dead = seats.filter(s => liveness.get(s.last_session_id) === false);
      if (dead.length) {
        for (const seat of dead) {
          try { await db.dropInhousePlayerSeat(seat.session_id, seat.account_id); } catch {}
        }
        log(`Session-expiry sweep dropped ${dead.length} seat(s) (Steam session gone):`,
          dead.map(r => `s${r.session_id}/${r.account_id}`).join(', '));
      }
    } catch (e) {
      warn('session-expiry sweep failed:', e.message);
    }
  }
  // Only fetch sessions that could need advancing — keeps the poll cheap
  // even as the inhouse_sessions table grows.
  const pool = db.getPool();
  let openRows, acceptingRows, draftingRows;
  try {
    [openRows, acceptingRows, draftingRows] = await Promise.all([
      pool.query(`SELECT * FROM inhouse_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 20`),
      pool.query(`SELECT * FROM inhouse_sessions WHERE status = 'accepting' ORDER BY id DESC LIMIT 20`),
      // Task #168 — recovery sweep: pick up sessions that finished drafting
      // but never got their server provisioned (missed in-flight trigger,
      // server restart between the 8th pick and the helper firing, etc).
      pool.query(`SELECT * FROM inhouse_sessions WHERE status IN ('drafting','server_failed') AND match_password IS NULL ORDER BY id DESC LIMIT 20`),
    ]);
  } catch (e) {
    warn('listInhouseSessions failed:', e.message);
    return;
  }
  const open = openRows.rows;
  const accepting = acceptingRows.rows;
  const drafting = draftingRows.rows;

  for (const s of open) {
    try {
      const players = await db.getInhouseSessionPlayers(s.id);
      const min = s.min_players || 10;
      const fillSec = s.lobby_fill_seconds || 30;

      if (players.length >= min) {
        if (!s.auto_start_at) {
          // First time we hit the threshold — start the grace timer.
          await db.updateInhouseSession(s.id, { auto_start_at: new Date(Date.now() + fillSec * 1000) });
          log(`Session #${s.id}: ${players.length}/${min} reached, auto-start in ${fillSec}s`);
        } else if (new Date(s.auto_start_at).getTime() <= Date.now()) {
          // v6.03 — resolve the captain-mode vote winner BEFORE flipping the
          // status, so the captain selection that runs at end-of-accept-phase
          // uses the mode the lobby actually voted for. Filter to **current
          // lobby members** so a leaver can't keep skewing the result. Zero
          // valid votes / ties → 'highest_rank' per resolveWinningCaptainMode().
          const memberSet = new Set(players.map(p => String(p.account_id)));
          const winningMode = db.resolveWinningCaptainMode(s.captain_mode_votes || {}, memberSet);
          // Timer expired — flip to accepting. Status-guarded UPDATE so we
          // never race with a manual admin transition.
          const guard = await pool.query(
            `UPDATE inhouse_sessions
                SET status = 'accepting',
                    accept_phase_starts_at = NOW(),
                    accept_phase_seconds = COALESCE(accept_phase_seconds, $2),
                    captain_mode = $3,
                    auto_start_at = NULL
              WHERE id = $1 AND status = 'open'
            RETURNING id`,
            [s.id, s.accept_phase_seconds || 60, winningMode]
          );
          if (guard.rowCount > 0) {
            log(`Session #${s.id}: auto-flipped to accepting (${players.length} players, captain mode=${winningMode})`);
          }
        }
      } else if (s.auto_start_at) {
        // Count dropped below min — clear the timer.
        await db.updateInhouseSession(s.id, { auto_start_at: null });
        log(`Session #${s.id}: dropped below min (${players.length}/${min}), cleared auto-start timer`);
      }
    } catch (e) {
      warn(`Session #${s.id} (open) tick failed:`, e.message);
    }
  }

  for (const s of accepting) {
    try {
      const startedAt = s.accept_phase_starts_at ? new Date(s.accept_phase_starts_at).getTime() : 0;
      const expiresAt = startedAt + (s.accept_phase_seconds || 60) * 1000;
      if (Date.now() < expiresAt) continue;

      const players = await db.getInhouseSessionPlayers(s.id);
      const accepted = players.filter(p => p.status === 'accepted');
      const min = s.min_players || 10;

      if (accepted.length >= min) {
        // Auto-select captains via internal POST so we hit the same atomic
        // guard the manual button uses. We call our own API on localhost
        // with the superuser key.
        const port = basePort || process.env.PORT || 5000;
        const key = process.env.SUPERUSER_PASSWORD;
        if (!key) {
          warn(`Session #${s.id}: cannot auto-select captains, SUPERUSER_PASSWORD not set`);
          continue;
        }
        const r = await fetch(`http://127.0.0.1:${port}/api/inhouse/${s.id}/select-captains`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-superuser-key': key },
          body: JSON.stringify({ mode: s.captain_mode || 'highest_rank' }),
        });
        if (r.ok) {
          log(`Session #${s.id}: accept-phase timer expired, auto-selected captains (${accepted.length} accepted)`);
        } else {
          const txt = await r.text().catch(() => '');
          warn(`Session #${s.id}: select-captains call failed (${r.status}):`, txt.slice(0, 200));
        }
      } else {
        // Not enough accepts — drop back to open so the lobby can refill.
        // Status-guarded so we don't trample a concurrent admin transition.
        const guard = await pool.query(
          `UPDATE inhouse_sessions
              SET status = 'open', accept_phase_starts_at = NULL, auto_start_at = NULL
            WHERE id = $1 AND status = 'accepting'
          RETURNING id`,
          [s.id]
        );
        if (guard.rowCount > 0) {
          await pool.query(
            `UPDATE inhouse_session_players SET status = 'registered', accepted_at = NULL
               WHERE session_id = $1 AND status IN ('accepted','declined')`,
            [s.id]
          );
          log(`Session #${s.id}: only ${accepted.length}/${min} accepted, dropped back to open`);
        }
      }
    } catch (e) {
      warn(`Session #${s.id} (accepting) tick failed:`, e.message);
    }
  }

  // Task #168 — recovery sweep for sessions where the draft completed but
  // the in-flight auto-provision never landed (server restart, transient
  // DB blip, etc). The provisioner has its own per-session single-flight
  // lock, so this is safe to run alongside the /draft-pick trigger.
  //
  // For sessions already in `server_failed` we apply a per-session backoff
  // (60s default, override via INHOUSE_RECOVERY_BACKOFF_SECONDS) so a
  // persistent RCON outage doesn't spam the admin Discord channel every
  // 5s. Captains can still hit the Retry button on /inhouse at any time
  // (that path doesn't go through the ticker).
  for (const s of drafting) {
    try {
      if (s.status === 'server_failed') {
        const last = _lastFailedAttempt.get(s.id) || 0;
        if (Date.now() - last < RECOVERY_BACKOFF_MS) continue;
        _lastFailedAttempt.set(s.id, Date.now());
      }
      const players = await db.getInhouseSessionPlayers(s.id);
      const cap1 = Number(s.captain1_account_id);
      const cap2 = Number(s.captain2_account_id);
      const drafted = players.filter(p =>
        p.team !== 0 && Number(p.account_id) !== cap1 && Number(p.account_id) !== cap2
      ).length;
      if (drafted < 8) continue;
      const { provisionInhouseServer } = require('./serverProvisioner');
      const r = await provisionInhouseServer(s.id, { trigger: 'auto_recovery' });
      if (r.ok && !r.skipped) {
        log(`Session #${s.id}: recovery sweep auto-provisioned dedicated server`);
        _lastFailedAttempt.delete(s.id);
      } else if (!r.ok && !r.skipped) {
        warn(`Session #${s.id}: recovery sweep provision failed:`, r.error);
      }
    } catch (e) {
      warn(`Session #${s.id} (drafting recovery) tick failed:`, e.message);
    }
  }
}

function start(db, opts = {}) {
  if (_timer) return;
  _logger = opts.logger || console;
  _sessionStore = opts.sessionStore || null;
  const basePort = opts.basePort;
  _timer = setInterval(() => {
    tick(db, basePort).catch(e => warn('tick fatal:', e.message));
  }, TICK_MS);
  log(`Started (every ${TICK_MS}ms)`);
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    log('Stopped');
  }
}

module.exports = { start, stop, _tick: tick };
