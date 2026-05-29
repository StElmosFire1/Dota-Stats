// Task #451 — Daily Dota mini-games suite.
// Deterministic seeding + a tiny HMAC signer for opaque puzzle/image tokens.
//
// "Daily mode" must give every player the same puzzle for a given AEST
// calendar day, and that day must roll over at Sydney midnight. So the seed
// is derived from the Australia/Sydney date string (YYYY-MM-DD) plus the game
// key. Endless mode passes its own random seed instead.

const crypto = require('crypto');

const SYDNEY_TZ = 'Australia/Sydney';

// Epoch the puzzle numbering counts from (its #001). Arbitrary but stable —
// chosen as the day this suite shipped so #001 reads nicely.
const PUZZLE_EPOCH = '2026-05-01';

// Returns the current calendar date in Australia/Sydney as 'YYYY-MM-DD'.
// Optionally accepts a Date to convert (defaults to now). en-CA formats as
// ISO-ish YYYY-MM-DD which is exactly what we want.
function sydneyDateStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Tomorrow's Sydney date string (used by the puzzle pre-generation cron).
function sydneyTomorrowStr(date = new Date()) {
  const next = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  return sydneyDateStr(next);
}

// Whole days between PUZZLE_EPOCH and the given Sydney date string, +1 so the
// epoch day is puzzle #1. Used to render "#042" in the share string.
function puzzleNumber(dateStr) {
  const a = Date.parse(`${PUZZLE_EPOCH}T00:00:00Z`);
  const b = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / (24 * 60 * 60 * 1000)) + 1);
}

// Stable 32-bit hash of a string (FNV-1a). Deterministic across processes —
// unlike Math.random — so the same (game, date) always picks the same answer.
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Small deterministic PRNG seeded from a 32-bit integer (mulberry32).
function mulberry32(seedInt) {
  let a = seedInt >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Returns a PRNG seeded deterministically from (game, dateStr).
function dailyRng(game, dateStr) {
  return mulberry32(hash32(`${game}:${dateStr}`));
}

// Picks one element from arr using the given rng.
function pick(arr, rng) {
  if (!arr || !arr.length) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

// Deterministic shuffle (Fisher–Yates) using the given rng. Returns a copy.
function shuffle(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function _signingKey() {
  return process.env.SESSION_SECRET || process.env.SESSION_FINGERPRINT_SALT || 'oce-games-dev-secret';
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

// Opaque, tamper-proof token carrying a small JSON object. Used so puzzle
// answers / CDN image paths never appear in client-readable form.
function signToken(obj) {
  const payload = b64url(JSON.stringify(obj));
  const sig = b64url(crypto.createHmac('sha256', _signingKey()).update(payload).digest());
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', _signingKey()).update(payload).digest());
  if (sig !== expected) return null;
  try {
    return JSON.parse(b64urlDecode(payload).toString('utf8'));
  } catch (_) {
    return null;
  }
}

module.exports = {
  SYDNEY_TZ,
  sydneyDateStr,
  sydneyTomorrowStr,
  puzzleNumber,
  hash32,
  mulberry32,
  dailyRng,
  pick,
  shuffle,
  signToken,
  verifyToken,
};
