// Task #856 — centralized structured error monitoring with alerting.
//
// reportError(err, context) is the single funnel for "something broke and an
// operator should know". It:
//   1. Logs a structured entry via src/logger.js (JSON when pino is present),
//      with secrets redacted from the message/stack/context.
//   2. Posts an alert to ERROR_ALERT_WEBHOOK_URL (falls back to
//      OWNER_ALERT_WEBHOOK_URL) — Discord/Slack-style incoming webhook,
//      compatible with the existing _alertOwner channel. Rate-limited so an
//      error loop cannot flood the channel: max ALERT_BURST alerts per
//      ALERT_WINDOW_MS window, with a per-signature dedupe (same error
//      message alerts at most once per DEDUPE_MS).
//   3. Never throws — monitoring must not take down the thing it monitors.
//
// Process-level handlers (uncaughtException / unhandledRejection) are wired
// in src/index.js via installProcessHandlers().

const { createLogger } = require('../logger');
const log = createLogger({ component: 'error-monitor' });

const ALERT_WINDOW_MS = 60_000;
const ALERT_BURST = 5;            // max alerts per window
const DEDUPE_MS = 10 * 60_000;    // same error signature alerts once per 10 min

let _windowStart = 0;
let _windowCount = 0;
const _lastAlertBySig = new Map();

// Env var names whose values must never appear in logs/alerts. We redact by
// VALUE (any occurrence of the secret string) plus common key=value shapes.
const SECRET_ENV_KEYS = [
  'DISCORD_TOKEN', 'OI_DISCORD_TOKEN', 'STEAM_PASSWORD', 'STEAM_SHARED_SECRET',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SESSION_SECRET',
  'SUPERUSER_PASSWORD', 'UPLOAD_KEY', 'DATABASE_URL', 'PGPASSWORD',
  'GROK_API_KEY', 'TWITCH_CLIENT_SECRET', 'GITHUB_PERSONAL_ACCESS_TOKEN',
  'VAPID_PRIVATE_KEY', 'DEDICATED_SERVER_RCON_PASSWORD',
  'DEDICATED_SERVER_SSH_PRIVATE_KEY', 'SMOKE_INTERNAL_TOKEN',
];

function redact(text) {
  if (text == null) return text;
  let s = String(text);
  for (const key of SECRET_ENV_KEYS) {
    const val = process.env[key];
    if (val && val.length >= 6) {
      // split/join avoids regex-escaping the secret value
      s = s.split(val).join(`[REDACTED:${key}]`);
    }
  }
  // Generic shapes: sk_live_..., bearer tokens, key=... query params.
  s = s.replace(/\b(sk|rk)_(live|test)_[A-Za-z0-9]{8,}\b/g, '[REDACTED:stripe-key]');
  s = s.replace(/\b(authorization|x-superuser-key|x-upload-key|x-admin-key)\b\s*[:=]\s*\S+/gi, '$1: [REDACTED]');
  s = s.replace(/([?&](?:superuser_key|upload_key|token|key|secret|password)=)[^&\s"']+/gi, '$1[REDACTED]');
  return s;
}

function _redactContext(ctx) {
  const out = {};
  for (const [k, v] of Object.entries(ctx || {})) {
    if (/(secret|password|token|key|authorization|cookie)/i.test(k)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'string') {
      out[k] = redact(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function _shouldAlert(signature) {
  const now = Date.now();
  const last = _lastAlertBySig.get(signature);
  if (last && now - last < DEDUPE_MS) return false;
  if (now - _windowStart > ALERT_WINDOW_MS) {
    _windowStart = now;
    _windowCount = 0;
  }
  if (_windowCount >= ALERT_BURST) return false;
  _windowCount++;
  _lastAlertBySig.set(signature, now);
  // keep the dedupe map bounded
  if (_lastAlertBySig.size > 500) {
    for (const [k, t] of _lastAlertBySig) {
      if (now - t > DEDUPE_MS) _lastAlertBySig.delete(k);
    }
  }
  return true;
}

async function _postWebhook(text) {
  const url = process.env.ERROR_ALERT_WEBHOOK_URL || process.env.OWNER_ALERT_WEBHOOK_URL;
  if (!url) return false;
  try {
    const fetchFn = global.fetch || (await import('node-fetch')).default;
    const r = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `content` for Discord, `text` for Slack-style hooks.
      body: JSON.stringify({ content: text.slice(0, 1900), text: text.slice(0, 1900) }),
    });
    return r.ok;
  } catch (_) {
    return false;
  }
}

/**
 * Central error funnel. Safe to call from anywhere; never throws.
 * @param {Error|any} err
 * @param {object} context — { source, requestId, route, ... }; secret-looking
 *   keys and any embedded secret values are redacted before logging/alerting.
 */
function reportError(err, context = {}) {
  try {
    const message = redact(err && err.message ? err.message : String(err));
    const stack = redact(err && err.stack ? err.stack : null);
    const ctx = _redactContext(context);
    const source = ctx.source || 'unspecified';

    log.error({ ...ctx, err: message, stack }, `error captured (${source})`);

    const signature = `${source}:${message}`.slice(0, 300);
    if (_shouldAlert(signature)) {
      const lines = [
        `🚨 **[${(process.env.NODE_ENV === 'production') ? 'PROD' : 'DEV'} error]** ${source}`,
        `\`${message.slice(0, 400)}\``,
      ];
      if (ctx.requestId) lines.push(`request: ${ctx.requestId}${ctx.route ? ` ${ctx.route}` : ''}`);
      if (stack) lines.push('```\n' + stack.split('\n').slice(0, 6).join('\n').slice(0, 900) + '\n```');
      _postWebhook(lines.join('\n')).catch(() => {});
    }
  } catch (monitorErr) {
    // last resort — monitoring must never crash the app
    try { console.error('[ErrorMonitor] reportError failed:', monitorErr.message); } catch (_) {}
  }
}

/**
 * Wire process-level handlers through the central error path.
 * - unhandledRejection: report + keep running (matches previous behaviour).
 * - uncaughtException: report, give the alert 2s to flush, then exit 1 so
 *   PM2 restarts a clean process instead of running in a corrupt state.
 */
function installProcessHandlers() {
  process.on('unhandledRejection', (err) => {
    reportError(err, { source: 'unhandledRejection' });
  });
  process.on('uncaughtException', (err) => {
    reportError(err, { source: 'uncaughtException', fatal: true });
    setTimeout(() => process.exit(1), 2000).unref();
    // If the alert flushes faster, still exit promptly on next tick of a
    // second timer; the unref'd timer above guarantees exit within 2s while
    // letting the webhook POST attempt complete.
  });
}

// Also exported for one-shot informational posts (e.g. recovery all-clear
// pings) that must reach the same channel but should NOT consume the error
// burst/dedupe budget. Callers are responsible for their own one-shot logic.
module.exports = { reportError, installProcessHandlers, redact, postWebhookAlert: _postWebhook };
