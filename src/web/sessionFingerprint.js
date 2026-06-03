// Task #431 — Session fingerprint capture for smurf detection.
//
// Stashes a hashed IP + hashed/truncated User-Agent onto every
// authenticated express-session row so `smurfScorer._buildSessionFingerprintIndex`
// (which already supports `sess.ip` / `sess.ua`) actually has data to
// overlap. Before this, the fingerprint signal (10 / 100 pts) always
// degraded to "no fingerprint data available" because nothing wrote
// those keys.
//
// Privacy posture (documented in replit.md → "Environment variables"):
//   - IP is salted-SHA-256-hashed and truncated to 16 hex chars before
//     storage. Raw IPs never hit the DB.
//   - UA is salted-SHA-256-hashed and truncated to 16 hex chars too.
//     We don't need the readable string — overlap detection just needs
//     a deterministic per-machine token.
//   - Salt is `SESSION_FINGERPRINT_SALT` if set, else falls back to
//     `SESSION_SECRET`. Rotating either rotates the fingerprint
//     namespace and effectively forgets prior overlaps on next login.
//   - Retention is bounded by the session cookie's 7-day maxAge plus
//     connect-pg-simple's pruner — there is no separate long-lived
//     audit log of IP / UA.
//   - Only authenticated sessions (`sess.accountId` present) get
//     stamped. Anonymous visitors leave no fingerprint behind.
//   - The middleware re-stamps at most once every 15 minutes per
//     session, OR immediately when the hashed IP/UA changes (the case
//     we actually care about — same account moving between machines).
//     This keeps the session-store write rate sane.

const crypto = require('crypto');

const REFRESH_MS = 15 * 60 * 1000;

function _salt() {
  return process.env.SESSION_FINGERPRINT_SALT
    || process.env.SESSION_SECRET
    || 'oi-session-fp-default-salt';
}

function _hashPart(input) {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  return crypto.createHash('sha256').update(_salt() + '|' + s).digest('hex').slice(0, 16);
}

// Extract a best-effort client IP. We trust the first hop in
// X-Forwarded-For because the app already sets `trust proxy = 1` in
// server.js — anything further upstream would be platform-spoofable.
function _extractIp(req) {
  return req.ip || req.connection?.remoteAddress || null;
}

function _extractUa(req) {
  const ua = req.headers && req.headers['user-agent'];
  if (!ua) return null;
  // Truncate before hashing — defense in depth against absurdly long
  // UA strings burning CPU.
  return String(ua).slice(0, 256);
}

// Task #748 — coarse, non-identifying device label for the user-facing
// "active sessions" list (e.g. "Chrome on Windows"). This is deliberately
// low-resolution: only the browser + OS *family*, never the raw UA string,
// version numbers, or anything device-unique. It does not weaken the
// hash-only privacy posture above — the raw UA still never hits the DB.
function _parseDevice(uaRaw) {
  if (!uaRaw) return 'Unknown device';
  const ua = String(uaRaw);
  let os = 'Unknown OS';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  let br = 'Browser';
  if (/Edg\//i.test(ua)) br = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) br = 'Opera';
  else if (/Firefox\//i.test(ua)) br = 'Firefox';
  else if (/Chromium\//i.test(ua)) br = 'Chromium';
  else if (/Chrome\//i.test(ua)) br = 'Chrome';
  else if (/Safari\//i.test(ua) && /Version\//i.test(ua)) br = 'Safari';
  return `${br} on ${os}`;
}

// Compute the print pair for a request. Exported so the auth-complete
// handler can stamp immediately on session creation.
function computePrints(req) {
  return {
    ip: _hashPart(_extractIp(req)),
    ua: _hashPart(_extractUa(req)),
  };
}

// Apply prints to req.session if they're new or stale. Returns true if
// anything was changed (caller may want to req.session.save()).
function stampSession(req) {
  if (!req.session || !req.session.accountId) return false;
  const { ip, ua } = computePrints(req);
  if (!ip && !ua) return false;
  const now = Date.now();
  const last = Number(req.session.fpStampedAt || 0);
  const device = _parseDevice(_extractUa(req));
  const changed = req.session.ip !== ip || req.session.ua !== ua || req.session.device !== device;
  if (!changed && (now - last) < REFRESH_MS) return false;
  req.session.ip = ip;
  req.session.ua = ua;
  // Task #748 — coarse device label + last-active marker for the user's
  // "active sessions" list. Updated on the same ≤15-min cadence as the
  // fingerprint so the session-store write rate stays sane.
  req.session.device = device;
  req.session.lastSeenAt = now;
  req.session.fpStampedAt = now;
  return true;
}

function middleware(req, res, next) {
  try { stampSession(req); } catch (_) { /* never break the request */ }
  next();
}

module.exports = { middleware, stampSession, computePrints, _hashPart };
