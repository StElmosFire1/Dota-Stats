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

    _push({
      ts: Date.now(),
      path: _shortStr(rawPath.split('?')[0], 200),
      referer_host: refHost || '(none)',
      referer: _shortStr(referer, 300),
      ua: _shortStr(ua, 200),
      ip: req.ip || null,
      method: req.method,
      decision,
    });

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

// Test hook — reset the buffer between cases.
function _resetForTests() {
  _ring.length = 0;
}

module.exports = {
  hotlinkMiddleware,
  buildReport,
  isGatedAssetPath,
  _resetForTests,
  RING_BUFFER_MAX,
  DEFAULT_ALLOWED_HOSTS,
};
