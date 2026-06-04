// Task #778 — Dedicated-server crash watchdog.
//
// The dedicated srcds process can die between matches (OOM, crash, a Steam
// content update that restarts it, etc). Nothing was watching for that — the
// `server_failed` banner only appears at draft-complete time when a fresh
// RCON push fails, so an operator had to SSH in manually to bring the box
// back up.
//
// This module runs a lightweight loop (60s by default) that pings RCON via
// `rconClient.pingServer()`. After N consecutive failures it takes one of
// two actions depending on configuration:
//
//   (a) DEDICATED_SERVER_ALLOW_SSH_RESTART unset/!= "1" (default):
//       fire a one-shot Discord admin ping describing the outage and how to
//       recover by hand. The ping is sent once per outage (not every tick).
//
//   (b) DEDICATED_SERVER_ALLOW_SSH_RESTART="1":
//       attempt a remote `systemctl restart <unit>` over the existing SSH
//       helper, wait, then re-ping once. If the server comes back we post a
//       recovery note; if it's still down we fall through to the (a) admin
//       ping. The SSH restart is attempted at most once per outage.
//
// When RCON recovers (with or without our intervention) after we'd alerted,
// we post a "recovered" note so the channel knows it's healthy again.
//
// The monitor no-ops entirely when the dedicated server isn't configured
// (no IP or no RCON password), so it's safe to always start.

const { config } = require('../config');
const { pingServer } = require('./rconClient');
const opsState = require('./../web/opsState');

const CHECK_INTERVAL_MS = (Number(process.env.DEDICATED_SERVER_HEALTH_INTERVAL_SECONDS) || 60) * 1000;
const FAILURE_THRESHOLD = Math.max(1, Number(process.env.DEDICATED_SERVER_HEALTH_FAILURE_THRESHOLD) || 3);
const ALLOW_SSH_RESTART = process.env.DEDICATED_SERVER_ALLOW_SSH_RESTART === '1';
// systemd unit name on the droplet — sanitised before use so it can never
// inject extra shell. Defaults to the unit name in docs/dedicated-server-runbook.md.
const RAW_UNIT = process.env.DEDICATED_SERVER_SYSTEMD_UNIT || 'dota2';
const RESTART_UNIT = /^[A-Za-z0-9_.@-]{1,64}$/.test(RAW_UNIT) ? RAW_UNIT : 'dota2';
const POST_RESTART_WAIT_MS = (Number(process.env.DEDICATED_SERVER_RESTART_WAIT_SECONDS) || 20) * 1000;

let _timer = null;
let _logger = console;
let _checking = false;
let _consecutiveFailures = 0;
let _alerted = false;          // a "down" ping has been sent for the current outage
let _restartAttempted = false; // an SSH restart has been tried for the current outage

function log(...args) { _logger.log('[ServerHealth]', ...args); }
function warn(...args) { _logger.warn('[ServerHealth]', ...args); }

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function _notify(message) {
  try {
    const { getDiscordBot } = require('../discord/bot');
    const bot = getDiscordBot();
    if (bot && typeof bot._notifyChannel === 'function') bot._notifyChannel(message);
  } catch (e) {
    warn('Discord notify failed:', e.message);
  }
}

async function _attemptSshRestart() {
  try {
    const { withConnection, execCommand } = require('./serverReplayFetcher');
    const out = await withConnection(conn => execCommand(conn, `systemctl restart ${RESTART_UNIT}`));
    return { ok: true, output: out };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function _notifyDown(lastError, { restartTried, restartError } = {}) {
  _alerted = true;
  opsState.pushLog('serverHealth', 'error', `dedicated server unreachable: ${lastError}`);
  let msg =
    `🔴 **Dedicated server health check failed** — ${FAILURE_THRESHOLD} consecutive RCON failures.\n` +
    `Last error: \`${lastError}\`\n`;
  if (restartTried) {
    msg += `Attempted an automatic \`systemctl restart ${RESTART_UNIT}\` over SSH but the server is still unreachable` +
      `${restartError ? ` (\`${restartError}\`)` : ''}. Manual intervention needed — SSH in and check ` +
      `\`journalctl -u ${RESTART_UNIT} -f\`.`;
  } else if (ALLOW_SSH_RESTART) {
    msg += `Automatic SSH restart could not run (SSH not configured?). SSH in and run \`systemctl restart ${RESTART_UNIT}\`.`;
  } else {
    msg += `Automatic SSH restart is disabled — set \`DEDICATED_SERVER_ALLOW_SSH_RESTART=1\` to enable it. ` +
      `For now, SSH in and run \`systemctl restart ${RESTART_UNIT}\`.`;
  }
  _notify(msg);
}

function _notifyRecovered({ viaRestart } = {}) {
  opsState.pushLog('serverHealth', 'info', 'dedicated server recovered');
  _notify(viaRestart
    ? `🟢 **Dedicated server auto-recovered** — \`systemctl restart ${RESTART_UNIT}\` over SSH brought RCON back online.`
    : `🟢 **Dedicated server recovered** — RCON is responding again.`);
}

// Once the failure threshold is crossed, decide what to do. Returns true if
// the server was brought back online during this call.
async function _handleDown(lastError) {
  if (ALLOW_SSH_RESTART && !_restartAttempted) {
    _restartAttempted = true;
    log(`RCON down ${_consecutiveFailures}x — attempting systemctl restart ${RESTART_UNIT} over SSH`);
    const restart = await _attemptSshRestart();
    opsState.reportServerHealth({ restartAttempt: restart });
    if (restart.ok) {
      await _sleep(POST_RESTART_WAIT_MS);
      const reping = await pingServer();
      opsState.reportServerHealth({ checked: true, ok: reping.ok, error: reping.error });
      if (reping.ok) {
        log('Server recovered after SSH restart');
        _consecutiveFailures = 0;
        _notifyRecovered({ viaRestart: true });
        _alerted = false;
        return true;
      }
      warn('Server still down after SSH restart');
      _notifyDown(reping.error || lastError, { restartTried: true, restartError: 'still unreachable after restart' });
      return false;
    }
    warn('SSH restart failed:', restart.error);
    _notifyDown(lastError, { restartTried: true, restartError: restart.error });
    return false;
  }
  // No SSH restart path (disabled or already tried) — ping admins once.
  if (!_alerted) _notifyDown(lastError, { restartTried: false });
  return false;
}

async function check() {
  if (_checking) return;
  const ds = config.dota?.dedicatedServer || {};
  // Only watch a server that's actually wired up. RCON needs both an IP and
  // a password; without them pingServer() would always "fail" and spam.
  if (!ds.ip || !ds.rconPassword) return;
  _checking = true;
  try {
    const res = await pingServer();
    if (res.ok) {
      const wasAlerted = _alerted;
      _consecutiveFailures = 0;
      _restartAttempted = false;
      _alerted = false;
      opsState.reportServerHealth({ checked: true, ok: true, consecutiveFailures: 0 });
      if (wasAlerted) _notifyRecovered({ viaRestart: false });
      return;
    }
    _consecutiveFailures += 1;
    opsState.reportServerHealth({ checked: true, ok: false, error: res.error, consecutiveFailures: _consecutiveFailures });
    warn(`health check failed (${_consecutiveFailures}/${FAILURE_THRESHOLD}): ${res.error}`);
    if (_consecutiveFailures >= FAILURE_THRESHOLD) {
      await _handleDown(res.error);
    }
  } catch (e) {
    warn('check threw:', e.message);
  } finally {
    _checking = false;
  }
}

function start(opts = {}) {
  if (_timer) return;
  _logger = opts.logger || console;
  const ds = config.dota?.dedicatedServer || {};
  if (!ds.ip || !ds.rconPassword) {
    log('Dedicated server not configured (no IP / RCON password) — watchdog idle.');
    return;
  }
  opsState.reportServerHealth({ monitoring: true });
  // Kick off the first check shortly after boot, then on the fixed interval.
  _timer = setInterval(() => { check().catch(e => warn('tick fatal:', e.message)); }, CHECK_INTERVAL_MS);
  if (_timer.unref) _timer.unref();
  setTimeout(() => { check().catch(e => warn('initial check failed:', e.message)); }, 5000);
  log(`Started — pinging RCON every ${CHECK_INTERVAL_MS / 1000}s, ` +
    `alert after ${FAILURE_THRESHOLD} failures, ` +
    `SSH auto-restart ${ALLOW_SSH_RESTART ? `enabled (unit: ${RESTART_UNIT})` : 'disabled'}.`);
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    opsState.reportServerHealth({ monitoring: false });
    log('Stopped');
  }
}

module.exports = { start, stop, _check: check };
