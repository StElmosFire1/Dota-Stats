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
  const changed = req.session.ip !== ip || req.session.ua !== ua;
  if (!changed && (now - last) < REFRESH_MS) return false;
  req.session.ip = ip;
  req.session.ua = ua;
  req.session.fpStampedAt = now;
  return true;
}

function middleware(req, res, next) {
  try { stampSession(req); } catch (_) { /* never break the request */ }
  next();
}

module.exports = { middleware, stampSession, computePrints, _hashPart };
