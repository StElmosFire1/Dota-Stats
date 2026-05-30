// Task #491 — Brand-asset hotlink protection (full edition only).
//
// A clone site has been mimicking OCE Inhouse, and AI builders (or the humans
// prompting them) commonly hotlink a target site's logo / favicon / imagery
// directly off its domain. This middleware blocks requests for our DISTINCTIVE
// brand assets (logo, favicon, tier badges, voice packs, scoreboard renders)
// with HTTP 403 when the `Referer` header points at a domain outside our
// allow-list. Empty referer, same-origin, our own domains, and known social
// unfurlers (Discord/Twitter/Slack/etc.) are always permitted.
//
// Generic static assets (CSS, JS, fonts, the bundled React build, the Dota
// minimap, the service worker, robots.txt) are intentionally NOT gated — only
// branded imagery / audio / scoreboard renders.
//
// Decisions are recorded into an in-memory ring buffer (no schema, no new
// dependency) so the owner can see — via GET /api/admin/asset-hotlink-report —
// whether the clone (or anything else) has been pulling assets from our domain.
//
// Never throws out of the middleware: a bad referer or a parse error must not
// take the asset path down.

'use strict';

const RING_BUFFER_MAX = 5000;

const _ring = []; // newest pushed at end; trimmed from front when over cap

function _push(entry) {
  _ring.push(entry);
  if (_ring.length > RING_BUFFER_MAX) {
    _ring.splice(0, _ring.length - RING_BUFFER_MAX);
  }
}

// --- Task #565: durable persistence (daily rollup) ------------------------
// The ring buffer above is in-process only and resets on every deploy/reboot,
// so the owner loses the hotlink history right when a clone scrape is worth
// acting on. We additionally roll every decision up into an in-memory
// accumulator keyed by (UTC day, referer host) and periodically flush the
// DELTAS since the last flush into the `asset_hotlink_daily` table via UPSERT.
// This bounds DB writes to (#distinct day|host) per flush window regardless of
// traffic volume — a sustained scrape from one host is a single UPSERT per
// flush — and keeps the privacy posture of the ring buffer (referer host + a
// sample path/UA only, no raw PII beyond what the buffer already held).
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;        // batch window
const RETENTION_DAYS = 90;                       // bounded retention for the rollup
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;   // prune at most once per day

const _accum = new Map(); // key `${day}|${host}` -> delta row since last flush
let _flushTimer = null;
let _lastPruneTs = 0;
let _flushing = false;

function _dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10); // UTC YYYY-MM-DD
}

function _accumulate(entry) {
  const day = _dayKey(entry.ts);
  const host = entry.referer_host || '(none)';
  const key = day + '|' + host;
  let row = _accum.get(key);
  if (!row) {
    row = {
      day,
      referer_host: host,
      hits: 0,
      allowed: 0,
      blocked: 0,
      _paths: new Set(),
      sample_path: entry.path || null,
      sample_ua: entry.ua || null,
      first_seen: entry.ts,
      last_seen: entry.ts,
    };
    _accum.set(key, row);
  }
  row.hits += 1;
  if (entry.decision === 'allowed') row.allowed += 1;
  else if (entry.decision === 'blocked') row.blocked += 1;
  if (entry.path) row._paths.add(entry.path);
  if (entry.ts < row.first_seen) row.first_seen = entry.ts;
  if (entry.ts > row.last_seen) row.last_seen = entry.ts;
}

async function _maybePrune() {
  const now = Date.now();
  if (now - _lastPruneTs < PRUNE_INTERVAL_MS) return;
  _lastPruneTs = now;
  try {
    const db = require('../db');
    await db.pruneAssetHotlinkDaily(RETENTION_DAYS);
  } catch (err) {
    console.warn('[AssetHotlink] prune failed:', err.message);
  }
}

// Flush the accumulated deltas to the DB. Returns the number of (day, host)
// rows written. Single-flighted so an overlapping interval + report-triggered
// flush can't double-write. Best-effort: on DB failure the snapshot is folded
// back into the accumulator so the next flush retries it.
async function flushHotlinkLog() {
  if (_flushing) return 0;
  if (_accum.size === 0) {
    await _maybePrune();
    return 0;
  }
  _flushing = true;
  const snapshot = [..._accum.values()].map(r => ({
    day: r.day,
    referer_host: r.referer_host,
    hits: r.hits,
    allowed: r.allowed,
    blocked: r.blocked,
    distinct_paths: r._paths.size,
    sample_path: r.sample_path,
    sample_ua: r.sample_ua,
    first_seen: r.first_seen,
    last_seen: r.last_seen,
  }));
  _accum.clear();
  let n = 0;
  try {
    const db = require('../db');
    n = await db.upsertAssetHotlinkDaily(snapshot);
  } catch (err) {
    // Fold the snapshot back so the next flush retries it (path identities are
    // lost on a fold, so distinct_paths becomes approximate after a failure —
    // acceptable for a best-effort observability rollup).
    for (const s of snapshot) {
      const key = s.day + '|' + s.referer_host;
      const existing = _accum.get(key);
      if (!existing) {
        _accum.set(key, {
          day: s.day,
          referer_host: s.referer_host,
          hits: s.hits,
          allowed: s.allowed,
          blocked: s.blocked,
          _paths: new Set(),
          sample_path: s.sample_path,
          sample_ua: s.sample_ua,
          first_seen: s.first_seen,
          last_seen: s.last_seen,
        });
      } else {
        existing.hits += s.hits;
        existing.allowed += s.allowed;
        existing.blocked += s.blocked;
        if (s.first_seen < existing.first_seen) existing.first_seen = s.first_seen;
        if (s.last_seen > existing.last_seen) existing.last_seen = s.last_seen;
      }
    }
    console.warn('[AssetHotlink] flush failed (will retry next flush):', err.message);
    _flushing = false;
    return 0;
  }
  _flushing = false;
  await _maybePrune();
  return n;
}

// Start the periodic background flush. Idempotent — calling twice is a no-op.
// The timer is unref'd so it never keeps the process alive on its own.
function startHotlinkPersistence({ intervalMs = FLUSH_INTERVAL_MS } = {}) {
  if (_flushTimer) return _flushTimer;
  _flushTimer = setInterval(() => {
    flushHotlinkLog().catch(() => { /* best-effort */ });
  }, intervalMs);
  if (_flushTimer.unref) _flushTimer.unref();
  return _flushTimer;
}

function stopHotlinkPersistence() {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
}

// Built-in default allow-list of host suffixes that are always permitted as a
// referer. Configurable / extendable via BRAND_ASSET_REFERER_ALLOWLIST
// (comma-separated). Matched as a suffix so subdomains (e.g. www.oceinhouse.gg)
// are covered automatically.
const DEFAULT_ALLOWED_HOSTS = [
  'oceinhouse.gg',
  'dota.stats.corvidaeinc.com',
  'corvidaeinc.com',
  'localhost',
  '127.0.0.1',
  'replit.dev',
  'repl.co',
  'replit.app',
];

function _allowedHosts() {
  const extra = (process.env.BRAND_ASSET_REFERER_ALLOWLIST || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  // De-dupe while preserving order.
  return [...new Set([...DEFAULT_ALLOWED_HOSTS, ...extra])];
}

// Social unfurlers / link-preview bots that legitimately fetch our branded
// OG / scoreboard images. Most send no referer (already allowed), but some
// stamp one, so we also allow them by UA substring. Lower-cased match.
const UNFURLER_UA_SUBSTRINGS = [
  'discordbot',
  'twitterbot',
  'facebookexternalhit',
  'slackbot',
  'slack-imgproxy',
  'telegrambot',
  'whatsapp',
  'linkedinbot',
  'redditbot',
  'pinterest',
  'embedly',
  'skypeuripreview',
  'vkshare',
  'googlebot', // Google's own image cache / unfurl
  'bingbot',
];

// Decide whether a given request path targets a DISTINCTIVE brand asset that
// should be hotlink-gated. Exact files + path prefixes + scoreboard render
// routes. Everything else (bundled JS/CSS, fonts, minimap, sw.js, robots.txt)
// returns false and is served normally.
function isGatedAssetPath(rawPath) {
  if (!rawPath) return false;
  // Strip query string + normalise to lower-case for matching.
  let p = rawPath.split('?')[0];
  try { p = decodeURIComponent(p); } catch (_) { /* keep raw */ }
  p = p.toLowerCase();

  // Exact distinctive brand files served from web/public (copied into dist).
  if (p === '/oa-logo.png') return true;
  if (p === '/favicon.png') return true;
  if (p === '/favicon.ico') return true;

  // Distinctive directories: tier badges + voice packs + notification sounds.
  if (p.startsWith('/badges/')) return true;
  if (p.startsWith('/voice-packs/')) return true;
  if (p.startsWith('/sounds/')) return true;

  // Scoreboard / recap renders (server-generated branded imagery).
  if (p.endsWith('/recap-card.png')) return true;
  if (p.startsWith('/overlay/scoreboard/')) return true;

  return false;
}

// Parse the host out of a Referer header. Returns lower-cased host (no port)
// or null when the header is empty / unparseable.
function _refererHost(referer) {
  if (!referer) return null;
  try {
    return new URL(referer).hostname.toLowerCase();
  } catch (_) {
    return null;
  }
}

function _hostAllowed(host, allowed) {
  if (!host) return true; // empty / unparseable referer → allow
  for (const a of allowed) {
    if (host === a || host.endsWith('.' + a)) return true;
  }
  return false;
}

function _isUnfurler(ua) {
  if (!ua) return false;
  const low = ua.toLowerCase();
  return UNFURLER_UA_SUBSTRINGS.some(s => low.includes(s));
}

function _shortStr(s, max = 200) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function hotlinkMiddleware(req, res, next) {
  let rawPath;
  try {
    rawPath = req.originalUrl || req.url || '';
    if (!isGatedAssetPath(rawPath)) return next();

    const referer = req.get('referer') || req.get('referrer') || '';
    const refHost = _refererHost(referer);
    const ua = req.get('user-agent') || '';
    const allowed = _allowedHosts();

    // Same-origin: referer host matches the request host (covers the dev
    // domain and any host we're actually served on without listing it).
    const reqHost = (req.get('host') || '').split(':')[0].toLowerCase();

    let decision = 'blocked';
    if (!refHost) decision = 'allowed';                 // empty / unparseable referer
    else if (refHost === reqHost) decision = 'allowed'; // same-origin
    else if (_hostAllowed(refHost, allowed)) decision = 'allowed';
    else if (_isUnfurler(ua)) decision = 'allowed';     // social unfurler

    const entry = {
      ts: Date.now(),
      path: _shortStr(rawPath.split('?')[0], 200),
      referer_host: refHost || '(none)',
      referer: _shortStr(referer, 300),
      ua: _shortStr(ua, 200),
      ip: req.ip || null,
      method: req.method,
      decision,
    };
    _push(entry);
    _accumulate(entry); // Task #565 — roll up for durable persistence

    if (decision === 'blocked') {
      res.set('Cache-Control', 'no-store');
      return res.status(403).type('text/plain').send(
        'Hotlinking OCE Inhouse brand assets from another site is not permitted.\n'
      );
    }
    return next();
  } catch (_) {
    // Never let a hotlink check break asset delivery.
    return next();
  }
}

// Report builder for the superuser admin route. Aggregates the ring buffer
// over a window (defaults to 7 days) grouped by referer host.
function buildReport({ windowMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const filtered = _ring.filter(e => e.ts >= cutoff);

  const byHost = new Map();
  for (const e of filtered) {
    const key = e.referer_host || '(none)';
    if (!byHost.has(key)) {
      byHost.set(key, {
        referer_host: key,
        hits: 0,
        allowed: 0,
        blocked: 0,
        unique_paths: new Set(),
        last_seen: 0,
        first_seen: e.ts,
        sample_path: e.path,
        sample_ua: e.ua,
      });
    }
    const row = byHost.get(key);
    row.hits += 1;
    row[e.decision] = (row[e.decision] || 0) + 1;
    if (e.path) row.unique_paths.add(e.path);
    if (e.ts > row.last_seen) row.last_seen = e.ts;
    if (e.ts < row.first_seen) row.first_seen = e.ts;
  }

  const hosts = [...byHost.values()].map(r => ({
    ...r,
    unique_paths: r.unique_paths.size,
  })).sort((a, b) => b.hits - a.hits);

  const recent = filtered.slice(-200).reverse();

  return {
    windowMs,
    generatedAt: now,
    ringBufferSize: _ring.length,
    ringBufferMax: RING_BUFFER_MAX,
    allowedHosts: _allowedHosts(),
    totals: {
      hits: filtered.length,
      allowed: filtered.filter(e => e.decision === 'allowed').length,
      blocked: filtered.filter(e => e.decision === 'blocked').length,
    },
    hosts,
    recent,
  };
}

// Test hook — reset the buffer + accumulator + prune marker between cases.
function _resetForTests() {
  _ring.length = 0;
  _accum.clear();
  _lastPruneTs = 0;
}

module.exports = {
  hotlinkMiddleware,
  buildReport,
  isGatedAssetPath,
  flushHotlinkLog,
  startHotlinkPersistence,
  stopHotlinkPersistence,
  _resetForTests,
  RING_BUFFER_MAX,
  RETENTION_DAYS,
  DEFAULT_ALLOWED_HOSTS,
};
