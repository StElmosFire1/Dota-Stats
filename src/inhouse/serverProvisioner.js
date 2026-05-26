// Task #168 — Auto-provision dedicated server when captain draft completes.
//
// Extracted from the body of POST /api/inhouse/:id/server so the same
// provisioning path can be triggered from three places without duplication:
//
//   1. The owner-only POST /api/inhouse/:id/server route (manual override).
//   2. POST /api/inhouse/:id/draft-pick once the 10th player has been placed
//      (primary trigger — no operator click required).
//   3. autoStartTicker.js as a belt-and-braces poll for sessions stuck in
//      `drafting` with all 10 slots filled but no match_password recorded
//      (covers a missed in-flight trigger after a server restart).
//
// A per-session in-memory single-flight lock prevents the three callers from
// racing into a duplicate RCON setMatchPassword + Discord announcement.

const db = require('../db');
const { generateMatchPassword } = require('../services/steamConnectLink');

const _inFlight = new Set();

function _opsReport(ev) {
  try { require('../web/opsState').reportProvisioner(ev); } catch (_) {}
}

function _isProvisioned(session) {
  return !!(session && session.match_password && session.status === 'in_progress');
}

// Returns { ok, session, rcon, skipped } so callers can log/announce, but
// always resolves — never throws — so background callers don't crash the
// process. RCON failure does NOT roll back the status flip (matches the
// existing manual-route semantics: players still need the password to
// connect even if the server happened to already have it set).
async function provisionInhouseServer(sessionId, opts = {}) {
  const id = Number(sessionId);
  if (!id) return { ok: false, error: 'invalid session id' };

  if (_inFlight.has(id)) {
    return { ok: false, skipped: 'in_flight' };
  }
  _inFlight.add(id);
  _opsReport({ inFlight: Array.from(_inFlight) });
  try {
    const cfg = require('../config').config;
    const cur = await db.getInhouseSession(id);
    if (!cur) return { ok: false, error: 'Session not found' };
    if (_isProvisioned(cur)) return { ok: true, session: cur, skipped: 'already_provisioned' };
    // Task #168 — `server_failed` is allowed so the captain-callable
    // /server/retry route (and the recovery sweep) can re-run the helper
    // after a transient RCON outage without forcing an admin to bounce
    // the session back to drafting first.
    if (cur.status !== 'drafting' && cur.status !== 'server_failed') {
      return { ok: false, error: `Cannot provision from status ${cur.status}`, skipped: 'wrong_status' };
    }

    const reqPwd = (opts.password || '').toString();
    const safePwd = /^[A-Za-z0-9_-]{4,32}$/.test(reqPwd) ? reqPwd : generateMatchPassword(8);
    const ip = (opts.ip || cfg.dota?.dedicatedServer?.ip || '').toString();
    if (ip && !/^[0-9.]{7,15}$|^[a-zA-Z0-9.-]+$/.test(ip)) {
      return { ok: false, error: 'Invalid server IP' };
    }
    const port = parseInt(opts.port || cfg.dota?.dedicatedServer?.port || 27015, 10);

    let rconResult = null;
    try {
      const { setMatchPassword } = require('../services/rconClient');
      await setMatchPassword(safePwd);
      rconResult = { ok: true };
    } catch (rconErr) {
      rconResult = { ok: false, error: rconErr.message };
    }

    // Task #168 — when RCON is configured but the push fails (server
    // offline / wrong password / network) we move the session to
    // `server_failed` instead of silently flipping to `in_progress`. This
    // surfaces a banner + Retry button on the inhouse UI and pings the
    // admin Discord channel. RCON "not configured" (no RCON password set)
    // is NOT a failure — that's the connect-link-only fallback path the
    // existing manual route already supported.
    const rconConfigured = !!(cfg.dota?.dedicatedServer?.rconPassword);
    const rconFailed = rconConfigured && rconResult && rconResult.ok === false;
    if (rconFailed) {
      const reason = `Server provisioning failed at ${new Date().toISOString()}: ${rconResult.error}`;
      const failedSession = await db.updateInhouseSession(id, {
        status: 'server_failed',
        notes: reason,
      });
      // Task #297 — `silent: true` also suppresses the failure-path Discord
      // ping so a diagnostic run that hits an RCON outage cannot page the
      // community channel. The HTTP response carries the same error to the
      // operator, which is the only audience that should see it.
      if (!opts.silent) {
        try {
          const { getDiscordBot } = require('../discord/bot');
          const bot = getDiscordBot();
          if (bot) {
            bot._notifyChannel(
              `⚠️ **Inhouse server provisioning failed** — session #${id}\n` +
              `Reason: \`${rconResult.error}\`\n` +
              `Captains can press **Retry** on the lobby page, or a superuser can re-run from the admin panel.`
            );
          }
        } catch (e) {
          console.warn('[Inhouse] Could not notify Discord of provisioning failure:', e.message);
        }
      }
      _opsReport({ failure: { sessionId: id, error: rconResult.error } });
      return { ok: false, session: failedSession, rcon: rconResult, error: rconResult.error, failed: true };
    }

    const session = await db.updateInhouseSession(id, {
      match_password: safePwd,
      server_ip: ip,
      server_port: port,
      status: 'in_progress',
      started_at: new Date(),
      notes: null,
    });
    _opsReport({ success: { sessionId: id } });

    // Discord announcement + voice-channel shuffle. Wrapped so a Discord
    // outage never affects the HTTP response or the calling ticker.
    // Task #297 — `silent: true` suppresses the Discord announce + voice-move
    // entirely so the superuser diagnostic provision can render its
    // steam:// link without paging the community or shuffling players.
    if (opts.silent) {
      return { ok: true, session, rcon: rconResult };
    }
    try {
      const { getDiscordBot } = require('../discord/bot');
      const bot = getDiscordBot();
      if (bot && ip) {
        const connectLink = `steam://connect/${ip}:${port}/${encodeURIComponent(safePwd)}`;
        const trigger = opts.trigger || 'manual';
        const triggerLabel = trigger === 'auto_draft_complete'
          ? '\n_(auto-provisioned the moment the draft finished)_'
          : trigger === 'auto_recovery'
            ? '\n_(auto-provisioned by the recovery sweep)_'
            : '';
        bot._notifyChannel(
          `🖥️ **Inhouse server provisioned — game is live!**\n` +
          `Server: \`${ip}:${port}\` · Password: \`${safePwd}\`\n` +
          `**One-click connect:** <${connectLink}>` + triggerLabel
        );
      }
      if (bot && typeof bot._movePlayersToVoiceChannels === 'function') {
        const players = await db.getInhouseSessionPlayers(id);
        const STEAM64_OFFSET = 76561197960265728n;
        const t1IsRad = session.team1_is_radiant !== false;
        const synthLobby = {
          players: players
            .filter(p => p.team === 1 || p.team === 2)
            .map(p => ({
              steamId: (BigInt(p.account_id) + STEAM64_OFFSET).toString(),
              team: (p.team === 1 ? (t1IsRad ? 0 : 1) : (t1IsRad ? 1 : 0)),
            })),
        };
        bot._movePlayersToVoiceChannels(synthLobby).catch(e =>
          console.warn('[Inhouse] Voice-move failed:', e.message)
        );
      }
    } catch (e) {
      console.warn('[Inhouse] Could not notify Discord of server provisioning:', e.message);
    }

    return { ok: true, session, rcon: rconResult };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    _inFlight.delete(id);
    _opsReport({ inFlight: Array.from(_inFlight) });
  }
}

// Returns true when the 8 non-captain slots are all placed (i.e. the snake
// draft has completed and the session is ready to provision).
function isDraftComplete(session, players) {
  if (!session) return false;
  const cap1 = Number(session.captain1_account_id);
  const cap2 = Number(session.captain2_account_id);
  const drafted = players.filter(p =>
    p.team !== 0 && Number(p.account_id) !== cap1 && Number(p.account_id) !== cap2
  ).length;
  return drafted >= 8;
}

module.exports = { provisionInhouseServer, isDraftComplete };
