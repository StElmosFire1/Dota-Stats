// Task #498 — Lockdown access log (full edition only).
//
// While the owner-only lockdown gate is on (FULL_SITE_LOCKDOWN=1 or the
// DB-backed runtime toggle from Task #497), every blocked request is recorded
// into a small in-memory ring buffer so the owner can see *who* tried to reach
// the site — which deep links humans are hitting from a leaked share, with what
// UA family and IP — separate from the AI-agent traffic card (Task #492).
//
// Two block decisions are recorded, mirroring the gate's two responses:
//   - 'html-gate'  — a browser top-level navigation that got the inline
//                    sign-in page.
//   - '401-empty'  — a non-HTML request (API/JSON/image/JS bundle/fetch)
//                    that got a 401 with an empty body.
//
// Surfaced via GET /api/admin/lockdown-attempts (superuser). No schema, no new
// dependency; the buffer is in-process only and resets on reboot.

'use strict';

const { classifyUa } = require('./agentUaList');

const RING_BUFFER_MAX = 1000;

const _ring = []; // newest pushed at end; trimmed from front when over cap

function _push(entry) {
  _ring.push(entry);
  if (_ring.length > RING_BUFFER_MAX) {
    _ring.splice(0, _ring.length - RING_BUFFER_MAX);
  }
}

function _shortStr(s, max = 200) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// Coarse UA family for a blocked request. Known bots/crawlers/app-builders are
// labelled via the shared classifier (so e.g. a leaked link being probed by
// GPTBot is obvious); otherwise we derive a coarse browser family so the owner
// can tell a real person on Chrome from a scripted client. Order matters:
// Edge/Opera/Brave all embed "Chrome" in their UA, so they're tested first.
function uaFamily(ua) {
  if (!ua || typeof ua !== 'string') return 'unknown';
  const c = classifyUa(ua);
  if (c.class !== 'human' && c.family) return c.family;
  if (/\bEdg(?:A|iOS)?\//.test(ua)) return 'edge';
  if (/\bOPR\/|\bOpera\b/.test(ua)) return 'opera';
  if (/\bBrave\//.test(ua)) return 'brave';
  if (/\bSamsungBrowser\//.test(ua)) return 'samsung';
  if (/\bFirefox\/|\bFxiOS\//.test(ua)) return 'firefox';
  if (/\bChrome\/|\bCriOS\//.test(ua)) return 'chrome';
  if (/\bSafari\//.test(ua)) return 'safari';
  return 'other';
}

// Record a single gated request. Called from the lockdown middleware right
// before it returns the block response. `decision` is 'html-gate' or
// '401-empty'. Never throws — logging must not break the gate.
function record({ ip, path, ua, method, decision }) {
  try {
    _push({
      ts: Date.now(),
      ip: ip || null,
      path: _shortStr((path || '').split('?')[0], 200),
      family: uaFamily(ua),
      ua: _shortStr(ua, 200),
      method: method || 'GET',
      decision,
    });
  } catch (_) { /* never let the access log break the gate */ }
}

// Report builder for the superuser admin route. Aggregates the ring buffer over
// a window (defaults to 7 days) grouped by UA family.
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
        hits: 0,
        html_gate: 0,
        empty_401: 0,
        unique_ips: new Set(),
        unique_paths: new Set(),
        last_seen: 0,
        first_seen: e.ts,
        sample_path: e.path,
        sample_ua: e.ua,
      });
    }
    const row = byFamily.get(key);
    row.hits += 1;
    if (e.decision === 'html-gate') row.html_gate += 1;
    else if (e.decision === '401-empty') row.empty_401 += 1;
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

  const recent = filtered.slice(-200).reverse();

  return {
    windowMs,
    generatedAt: now,
    ringBufferSize: _ring.length,
    ringBufferMax: RING_BUFFER_MAX,
    totals: {
      hits: filtered.length,
      html_gate: filtered.filter(e => e.decision === 'html-gate').length,
      empty_401: filtered.filter(e => e.decision === '401-empty').length,
    },
    families,
    recent,
  };
}

// Test hook — reset the buffer between cases.
function _resetForTests() {
  _ring.length = 0;
}

module.exports = {
  record,
  buildReport,
  uaFamily,
  _resetForTests,
  RING_BUFFER_MAX,
};
