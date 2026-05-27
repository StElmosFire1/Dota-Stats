#!/usr/bin/env node
// Task #426 — Post-merge trigger: fire the browser smoke suite when the
// most recent patch-note entry in src/data/patchNotes.js carries
// `major: true`. Invoked from scripts/post-merge.sh after the deploy /
// push completes. Best-effort — any error here logs and exits 0 so a
// transient network blip doesn't fail the merge.
//
// Reads SMOKE_INTERNAL_TOKEN (shared secret with the running server) and
// SMOKE_TRIGGER_URL (defaults to https://oceinhouse.gg). If either is
// missing or the latest note isn't major, this script no-ops silently.

const path = require('path');

function loadLatest() {
  try {
    const notes = require(path.join(process.cwd(), 'src', 'data', 'patchNotes'));
    return Array.isArray(notes) && notes.length ? notes[0] : null;
  } catch (e) {
    console.warn('[trigger-major-smoke] could not load patchNotes:', e.message);
    return null;
  }
}

(async () => {
  const latest = loadLatest();
  if (!latest) { console.log('[trigger-major-smoke] no patch notes found; nothing to do.'); return; }
  if (!latest.major) { console.log(`[trigger-major-smoke] latest note v${latest.version} is not major; skipping.`); return; }

  const token = process.env.SMOKE_INTERNAL_TOKEN;
  if (!token) { console.log('[trigger-major-smoke] SMOKE_INTERNAL_TOKEN not set; skipping.'); return; }
  const base = process.env.SMOKE_TRIGGER_URL || 'https://oceinhouse.gg';
  const url = base.replace(/\/$/, '') + '/api/internal/smoke/trigger';

  try {
    const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
    const res = await (await fetch)(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = await res.text();
    console.log(`[trigger-major-smoke] v${latest.version} → POST ${url} → HTTP ${res.status} ${body.slice(0, 200)}`);
  } catch (e) {
    console.warn('[trigger-major-smoke] POST failed:', e.message);
  }
})();
