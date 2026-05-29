// Task #537 — Community-edition runtime UA classifier middleware.
//
// Brings the community edition (dota.stats.corvidaeinc.com) up to parity
// with the full edition's Task #492 AI-agent hardening. This is the
// community edition's OWN middleware/wiring — independent of the full
// edition's src/security/agentClassifier.js — but it deliberately reuses
// the single shared agent list at src/security/agentUaList.js so the
// robots.txt generator + drift gate keep both editions in sync.
//
// On every request:
//   1. Classifies the User-Agent against the shared classifyUa().
//   2. Sets X-Robots-Tag: noai, noimageai on the response (cheap; humans
//      ignore it, honourable AI crawlers pick it up).
//   3. For classified agents (`ai-crawler` / `app-builder` / `unknown-bot`):
//        - pushes a record into an in-memory ring buffer (capped at
//          RING_BUFFER_MAX so a sustained scrape can't OOM the process).
//        - if BLOCK_AI_AGENTS=1 and the class is ai-crawler/app-builder,
//          responds 403 with a short policy message (unknown-bot is never
//          hard-blocked — observability only).
//        - applies a stricter express-rate-limit bucket keyed on
//          (ip, ua-family).
//        - DMs the bot owner the first time a family appears in any 24h
//          window, via the community Discord bot's owner-DM path.
//
// Never throws out of the middleware: every async/DM call is try/caught so
// a Discord outage or a bad bot list can't take the API down.

'use strict';

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
// Reuse the single shared agent list (Task #492 source of truth) so robots.txt
// for both editions stays generated from one place and the drift gate passes.
const { classifyUa } = require('../../../src/security/agentUaList');

const RING_BUFFER_MAX = 5000;
const ALERT_DEDUPE_MS = 24 * 60 * 60 * 1000;

const _ring = []; // newest pushed at end; trimmed from front when over cap
const _lastAlertAt = new Map(); // family → ts

function _push(entry) {
  _ring.push(entry);
  if (_ring.length > RING_BUFFER_MAX) {
    _ring.splice(0, _ring.length - RING_BUFFER_MAX);
  }
}

function _shortUa(ua) {
  if (!ua) return '';
  return ua.length > 200 ? ua.slice(0, 200) + '…' : ua;
}

async function _maybeAlertOwner(family, sampleUa, samplePath) {
  const last = _lastAlertAt.get(family) || 0;
  if (Date.now() - last < ALERT_DEDUPE_MS) return;
  _lastAlertAt.set(family, Date.now());
  try {
    const { getDiscordBot } = require('../discord/bot');
    const bot = getDiscordBot();
    if (bot && typeof bot._dmOwner === 'function') {
      await bot._dmOwner(
        `🕷️ **AI agent first-seen** — \`${family}\` hit the site.\n` +
        `Path: \`${samplePath}\`\n` +
        `UA: \`${_shortUa(sampleUa)}\`\n` +
        `(Suppressed for the next 24h per-family.)`
      );
    }
  } catch (_) { /* never let alerting break the request loop */ }
}

// Stricter rate-limit bucket for classified agents. Keyed on (ip, family)
// so one misbehaving family can't take down others sharing the IP, and so
// distinct families sharing an IP each get their own quota.
const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ipKey = ipKeyGenerator(req.ip || '');
    const family = (req._agentClassification && req._agentClassification.family) || 'agent';
    return `${ipKey}|${family}`;
  },
  // Custom handler so we can flip the ring-buffer entry's decision from
  // 'logged' to 'throttled' before the 429 is returned. Without this the
  // observability report can never distinguish throttled traffic from
  // merely logged traffic.
  handler: (req, res /*, next, options */) => {
    if (req._agentEntry) req._agentEntry.decision = 'throttled';
    res.set('Cache-Control', 'no-store');
    return res.status(429).json({ error: 'Rate limit exceeded for automated agent.' });
  },
});

function classifierMiddleware(req, res, next) {
  // Always advertise the AI opt-out, even on human requests — meta tags
  // already do it in HTML; the header covers JSON/image responses.
  try { res.set('X-Robots-Tag', 'noai, noimageai'); } catch (_) {}

  const ua = req.get('user-agent') || '';
  const result = classifyUa(ua);
  if (result.class === 'human') return next();

  req._agentClassification = result;

  // Record into the ring buffer.
  let decision = 'logged';
  const blockOn = process.env.BLOCK_AI_AGENTS === '1';
  const isBlockable = (result.class === 'ai-crawler' || result.class === 'app-builder');
  if (blockOn && isBlockable) decision = 'blocked';

  const entry = {
    ts: Date.now(),
    ip: req.ip || null,
    ua: _shortUa(ua),
    path: req.originalUrl || req.url || '',
    method: req.method,
    family: result.family,
    kind: result.kind,
    decision,
  };
  _push(entry);
  // Held on the request so the rate-limit handler can flip
  // decision to 'throttled' on rejection.
  req._agentEntry = entry;

  // First-seen-per-24h DM — only for blockable (real) agents. Unknown-bot
  // is observability-only so we don't spam.
  if (isBlockable) {
    _maybeAlertOwner(result.family, ua, req.originalUrl || req.url || '/').catch(() => {});
  }

  if (decision === 'blocked') {
    res.set('Cache-Control', 'no-store');
    return res.status(403).type('text/plain').send(
      'AI scraping and automated agent access are not permitted on this site. ' +
      'See /robots.txt for the policy.\n'
    );
  }

  // Apply the stricter rate-limit bucket for known agents. Unknown-bot
  // also gets the tighter bucket — they are not humans.
  return agentLimiter(req, res, (err) => {
    if (err) return next(err);
    if (res.headersSent) return; // 429 already returned by limiter
    next();
  });
}

// Report builder — used by the superuser admin route. Aggregates the ring
// buffer over a window (defaults to 7 days) by (family, decision).
function buildReport({ windowMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const filtered = _ring.filter(e => e.ts >= cutoff);
  const byFamily = new Map();
  for (const e of filtered) {
    const key = e.family || 'unknown';
    if (!byFamily.has(key)) {
      byFamily.set(key, {
        family: key,
        kind: e.kind,
        hits: 0,
        blocked: 0,
        throttled: 0,
        logged: 0,
        unique_ips: new Set(),
        unique_paths: new Set(),
        last_seen: 0,
        first_seen: e.ts,
        sample_ua: e.ua,
        sample_path: e.path,
      });
    }
    const row = byFamily.get(key);
    row.hits += 1;
    row[e.decision] = (row[e.decision] || 0) + 1;
    if (e.ip) row.unique_ips.add(e.ip);
    if (e.path) row.unique_paths.add(e.path);
    if (e.ts > row.last_seen) row.last_seen = e.ts;
    if (e.ts < row.first_seen) row.first_seen = e.ts;
  }
  const families = [...byFamily.values()].map(r => ({
    ...r,
    unique_ips: r.unique_ips.size,
    unique_paths: r.unique_paths.size,
  })).sort((a, b) => b.hits - a.hits);

  // Recent samples (newest first, capped) so the admin can eyeball exactly
  // what came in.
  const recent = filtered.slice(-200).reverse();

  return {
    windowMs,
    generatedAt: now,
    ringBufferSize: _ring.length,
    ringBufferMax: RING_BUFFER_MAX,
    blockOn: process.env.BLOCK_AI_AGENTS === '1',
    families,
    recent,
  };
}

// Test hook — lets unit tests reset between cases without exporting the
// internals directly.
function _resetForTests() {
  _ring.length = 0;
  _lastAlertAt.clear();
}

module.exports = {
  classifierMiddleware,
  buildReport,
  _resetForTests,
  RING_BUFFER_MAX,
};
