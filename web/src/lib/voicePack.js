// Task #217 — shared voice-pack playback helper. Originally inlined in
// useInhouseAlerts.js (Task #206); extracted so the new global
// useVoicePackEvents hook (post-match win/loss, first-blood,
// achievement-unlock) can reuse the exact same per-event audio cache +
// 404-fallback shape without copy/pasting the logic.
//
// Usage:
//   import { createVoicePackPlayer } from '../lib/voicePack';
//   const player = createVoicePackPlayer();        // once per hook instance
//   player.play({ pack: 'captain', event: 'win' }); // returns true on attempt
//
// The player keeps a per-`${pack}|${event}` HTMLAudioElement cache and a
// "failed" Set so a 404 / decode error on any single slot is recorded
// once and never retried — subsequent calls for that slot return false
// so callers can fall back to the church bell (or just no-op).

export const VOICE_PACK_EVENTS = [
  'match-start',
  'first-blood',
  'win',
  'loss',
  'level-up',
  'achievement-unlock',
];

export function voicePackUrl(pack, event) {
  if (!pack || !event) return null;
  return `/voice-packs/${encodeURIComponent(pack)}/${encodeURIComponent(event)}.mp3`;
}

export function createVoicePackPlayer() {
  const els = new Map();
  const failed = new Set();

  function play({ pack, event, volume = 0.85 }) {
    if (typeof window === 'undefined') return false;
    const url = voicePackUrl(pack, event);
    if (!url) return false;
    const key = `${pack}|${event}`;
    if (failed.has(key)) return false;
    try {
      let el = els.get(key);
      if (!el) {
        el = new Audio(url);
        el.preload = 'auto';
        el.volume = volume;
        el.addEventListener('error', () => { failed.add(key); });
        els.set(key, el);
      }
      try { el.currentTime = 0; } catch (_) { /* ignore — some browsers throw before metadata loads */ }
      const p = el.play();
      if (p && typeof p.then === 'function') {
        p.catch(() => { failed.add(key); });
      }
      return true;
    } catch (_) {
      failed.add(key);
      return false;
    }
  }

  function hasFailed({ pack, event }) {
    return failed.has(`${pack}|${event}`);
  }

  return { play, hasFailed };
}
