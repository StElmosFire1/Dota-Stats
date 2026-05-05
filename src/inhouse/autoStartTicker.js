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

let _timer = null;
let _logger = console;

function log(...args) { _logger.log('[InhouseAutoStart]', ...args); }
function warn(...args) { _logger.warn('[InhouseAutoStart]', ...args); }

async function tick(db, basePort) {
  const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
  let active;
  try {
    active = await db.listInhouseSessions({ status: null, limit: 20 });
  } catch (e) {
    warn('listInhouseSessions failed:', e.message);
    return;
  }
  const open = active.filter(s => s.status === 'open');
  const accepting = active.filter(s => s.status === 'accepting');

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
          // Timer expired — flip to accepting.
          const upd = await db.updateInhouseSession(s.id, {
            status: 'accepting',
            accept_phase_starts_at: new Date(),
            accept_phase_seconds: s.accept_phase_seconds || 60,
            auto_start_at: null,
          });
          if (upd && upd.status === 'accepting') {
            log(`Session #${s.id}: auto-flipped to accepting (${players.length} players)`);
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
        await db.updateInhouseSession(s.id, {
          status: 'open',
          accept_phase_starts_at: null,
          auto_start_at: null,
        });
        // Reset declined statuses so they can rejoin the queue cleanly.
        const pool = db.getPool();
        await pool.query(
          `UPDATE inhouse_session_players SET status = 'registered', accepted_at = NULL
             WHERE session_id = $1 AND status IN ('accepted','declined')`,
          [s.id]
        );
        log(`Session #${s.id}: only ${accepted.length}/${min} accepted, dropped back to open`);
      }
    } catch (e) {
      warn(`Session #${s.id} (accepting) tick failed:`, e.message);
    }
  }
}

function start(db, opts = {}) {
  if (_timer) return;
  _logger = opts.logger || console;
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
