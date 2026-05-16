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

// v6.82 — trimmed from six to three slots. Voice packs are now a
// "lobby alerts only" cosmetic: they fire while the user is on /inhouse
// (ready-up, captain promotion, your-pick, pick-warning), never while
// the user is in a Dota dedicated-server game. The previous post-match
// hooks (`first-blood`, `win`, `loss`) and the cross-session
// `achievement-unlock` polling were dropped because (a) the dedicated
// server provisioning model means the Dota GC isn't watching most
// matches anymore so those events were going to be silent anyway, and
// (b) playing sounds through a background browser tab while the user
// is tabbed into Dota is just noise. The three kept slots are exactly
// the ones useInhouseAlerts.js maps lobby sub-events to:
//   match-start          ← 'accept', 'match-ready' (the ready-up chime)
//   level-up             ← 'your-pick', 'pick-warning'
//   achievement-unlock   ← 'captain' promotion
// Existing pack mp3 files for the removed slots are left in place on
// disk; they're simply orphaned. No client code or server queue
// consumer references them anymore.
export const VOICE_PACK_EVENTS = [
  'match-start',
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
