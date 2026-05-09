// Task #217 — global voice-pack lifecycle hook. Mounted once at the App
// root so the user's selected Pro voice pack fires its `win.mp3` /
// `loss.mp3` / `first-blood.mp3` / `achievement-unlock.mp3` (and the
// remaining slots) anywhere on the site as the matching server-side
// event lands.
//
// Mechanics:
//   - Polls GET /api/me/voice-events every POLL_MS while a Steam user is
//     signed in and the page is visible. The endpoint drains the
//     in-memory queue server-side, so each event is delivered at most
//     once per browser tab.
//   - Voice-pack id is loaded from /api/me/profile (same endpoint
//     useInhouseAlerts uses). When no pack is selected, NO sound plays —
//     this is intentional, the church bell is an inhouse-alerts-only
//     concept; outside the lobby a non-Pro user gets silence.
//   - Honors the same `inhouse:muted` localStorage toggle as the lobby
//     hook so muting in /inhouse silences post-match cues too.
//   - Uses the shared createVoicePackPlayer() helper from lib/voicePack
//     so the per-event audio cache and 404-fallback shape stay in sync
//     with useInhouseAlerts.

import { useEffect, useRef } from 'react';
import { createVoicePackPlayer, VOICE_PACK_EVENTS } from '../lib/voicePack';

const POLL_MS = 8000;
const MUTE_STORAGE_KEY = 'inhouse:muted';

function readMuted() {
  try { return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1'; }
  catch (_) { return false; }
}

export function useVoicePackEvents({ accountId }) {
  const playerRef = useRef(null);
  const voicePackIdRef = useRef(null);
  const pollTimerRef = useRef(null);
  const inFlightRef = useRef(false);

  // Lazy-init player so SSR / non-window environments stay safe.
  if (typeof window !== 'undefined' && !playerRef.current) {
    playerRef.current = createVoicePackPlayer();
  }

  // Load the user's selected voice pack whenever the signed-in account
  // changes. Anonymous viewers (or any failure path) leave it null,
  // which makes poll() a no-op below.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!accountId) { voicePackIdRef.current = null; return; }
    let alive = true;
    fetch('/api/me/profile', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!alive) return;
        const v = data && data.customization && data.customization.selected_voice_pack;
        voicePackIdRef.current = typeof v === 'string' && v ? v : null;
      })
      .catch(() => { if (alive) voicePackIdRef.current = null; });
    return () => { alive = false; };
  }, [accountId]);

  // Polling loop — only runs while a Steam user is signed in AND a pack
  // is actually selected. The two checks are deliberately split: until
  // /api/me/profile resolves we don't know the pack yet, so we still
  // poll (cheap empty array) so events that land mid-load aren't lost.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!accountId) return;

    const poll = async () => {
      if (inFlightRef.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      inFlightRef.current = true;
      try {
        const res = await fetch('/api/me/voice-events', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const events = (data && Array.isArray(data.events)) ? data.events : [];
        if (events.length === 0) return;
        const muted = readMuted();
        const pack = voicePackIdRef.current;
        if (muted || !pack || !playerRef.current) return;
        // Play each event in arrival order. Multiple events on a single
        // poll usually arrive seconds apart on the server; here we space
        // them by ~900ms so two clips don't overlap if the user just
        // re-tabbed in and the queue was non-empty.
        events.forEach((e, i) => {
          if (!e || !VOICE_PACK_EVENTS.includes(e.event)) return;
          setTimeout(() => {
            playerRef.current.play({ pack, event: e.event });
          }, i * 900);
        });
      } catch (_) {
        /* swallow — voice cues are best-effort */
      } finally {
        inFlightRef.current = false;
      }
    };

    // Kick off immediately so a freshly-recorded match doesn't have to
    // wait a full POLL_MS for its win/loss cue.
    poll();
    pollTimerRef.current = setInterval(poll, POLL_MS);
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [accountId]);
}
