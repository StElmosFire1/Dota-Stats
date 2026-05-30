// Task #508 — Brute-force protection for the lockdown sign-in endpoint.
//
// When the site is locked, POST /api/admin/superuser-login is the one
// credential-checking route that MUST stay reachable through the lockdown
// gate (otherwise nobody could unlock). That allowlisting makes it the
// obvious target for a password-guessing attack, so it needs its own,
// much tighter limiter than the shared global `authLimiter`.
//
// Two stacked buckets, both keyed on IP and both ignoring successful
// logins (a legit operator who fat-fingers the password once and then
// succeeds is never penalised — only sustained failures count):
//   1. Burst:     5 failed attempts / 15 min  → short cool-off.
//   2. Sustained: 20 failed attempts / 2 h    → the "longer lockout after
//      repeated failures" — survives the burst window resetting, so an
//      attacker who waits out each 15-min window still gets shut down.
//
// On lockout the response is the same minimal-info shape the lockdown gate
// uses (429, empty text body, no-store) so a brute-forcer learns nothing,
// and the bot owner gets a deduped Discord DM so a real attack is visible.

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// One owner DM per IP per this window, so a sustained attack produces a
// single alert rather than one DM per blocked request.
const ALERT_DEDUPE_MS = 15 * 60 * 1000;
const _lastAlertAt = new Map();

function _fmtTs(ts) {
  try {
    return new Date(ts).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
  } catch (_) {
    return new Date(ts).toISOString();
  }
}

async function _alertOwner(ip, scope) {
  const now = Date.now();
  const key = ip || 'unknown';
  const last = _lastAlertAt.get(key) || 0;
  if (now - last < ALERT_DEDUPE_MS) return; // still suppressed for this IP
  _lastAlertAt.set(key, now);

  // Opportunistic prune so the map can't grow unbounded.
  if (_lastAlertAt.size > 5000) {
    for (const [k, v] of _lastAlertAt) {
      if (now - v >= ALERT_DEDUPE_MS) _lastAlertAt.delete(k);
    }
  }

  try {
    const { getDiscordBot } = require('../discord/bot');
    const bot = getDiscordBot();
    if (bot && typeof bot._dmOwner === 'function') {
      await bot._dmOwner(
        '🚨 **Superuser login brute-force** — the lockdown sign-in page is being hammered.\n' +
        `IP: \`${key}\`\n` +
        `Trigger: ${scope}\n` +
        `Time: \`${_fmtTs(now)}\` (Sydney time)\n` +
        '(Further alerts for this IP suppressed for ~15 min.)'
      );
    }
  } catch (_) { /* alerting must never break the request loop */ }
}

function _minimalLockout(req, res, scope) {
  _alertOwner(req.ip, scope).catch(() => {});
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow, noai, noimageai');
  // Same minimal-info shape as the lockdown gate's non-HTML branch: an
  // empty text body that leaks nothing about why the request was refused.
  return res.status(429).type('text/plain').send('');
}

const _keyGenerator = (req) => ipKeyGenerator(req.ip || '');

// Burst bucket — short, tight window for a single guessing run.
const burstLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: _keyGenerator,
  handler: (req, res) => _minimalLockout(req, res, '5 failed attempts / 15 min'),
});

// Sustained bucket — the longer lockout that survives an attacker patiently
// waiting out each burst window.
const sustainedLimiter = rateLimit({
  windowMs: 2 * 60 * 60 * 1000, // 2 hours
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: _keyGenerator,
  handler: (req, res) => _minimalLockout(req, res, '20 failed attempts / 2 h (extended lockout)'),
});

// Express accepts an array of middleware — the sustained (slow, broad) check
// runs first so a long-running attack stays locked even after a burst window
// resets; the burst check catches the common fast-guessing case.
const superuserLoginLimiter = [sustainedLimiter, burstLimiter];

// Exposed for tests so the in-memory dedupe state can be cleared between cases.
function _resetAlertState() {
  _lastAlertAt.clear();
}

module.exports = { superuserLoginLimiter, _resetAlertState };
