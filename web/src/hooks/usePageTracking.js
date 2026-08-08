// Task #848 — first-party analytics beacon.
//
// Records SPA page views (and optional named tool-usage events) into a tiny
// in-memory queue that is flushed as a batched, fire-and-forget POST to
// /api/analytics/events. Uses navigator.sendBeacon on pagehide (survives tab
// close) and fetch keepalive for periodic flushes. Silently no-ops on any
// failure — analytics must never affect the user experience.

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const ENDPOINT = '/api/analytics/events';
const FLUSH_MS = 5000;
const MAX_BATCH = 20;

let _queue = [];
let _timer = null;

function flush(useBeacon = false) {
  if (!_queue.length) return;
  const events = _queue.splice(0, MAX_BATCH);
  const body = JSON.stringify({ events });
  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {});
  } catch (_) { /* never surface analytics failures */ }
}

function enqueue(ev) {
  _queue.push(ev);
  if (_queue.length >= MAX_BATCH) {
    flush();
    return;
  }
  if (!_timer) {
    _timer = setTimeout(() => { _timer = null; flush(); }, FLUSH_MS);
  }
}

// Collapse dynamic segments (numeric ids, long hashes) so aggregation groups
// by logical route instead of per-entity URLs.
export function normalizeRoute(pathname) {
  return (pathname || '/')
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/\/[0-9a-f]{16,}(?=\/|$)/gi, '/:hash')
    .slice(0, 200) || '/';
}

// Optional named tool-usage event, e.g. trackToolEvent('draft-assistant').
export function trackToolEvent(name) {
  if (!name) return;
  try {
    enqueue({ t: 'tool', r: normalizeRoute(window.location.pathname), n: String(name).slice(0, 100) });
  } catch (_) {}
}

// Mount once (inside the router) — reports every route change.
export default function usePageTracking() {
  const location = useLocation();
  const lastRoute = useRef(null);

  useEffect(() => {
    const route = normalizeRoute(location.pathname);
    if (route === lastRoute.current) return;
    lastRoute.current = route;
    enqueue({ t: 'pageview', r: route });
  }, [location.pathname]);

  useEffect(() => {
    const onHide = () => flush(true);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush(true);
    });
    return () => window.removeEventListener('pagehide', onHide);
  }, []);
}
