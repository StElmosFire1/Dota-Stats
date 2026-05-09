// v6.03 — useInhouseAlerts(): plays a longer, lower medieval-church-bell
// chime (synthesised via Web Audio API so we don't depend on shipping a
// large/licensed audio asset) + fires a browser Notification whenever an
// inhouse session enters a state that needs the signed-in user's attention.
// Mute toggle is persisted in localStorage under `inhouse:muted`.
//
// Trigger events (each fires exactly once per session per state change):
//   - 'accept'      — accept phase opened and the user is in the lobby
//   - 'captain'     — captain selection finished and the user is a captain
//   - 'your-pick'   — captain draft and it's the user's turn
//   - 'match-ready' — server provisioned / connect link is live
//
// Caller passes the latest `session`, `players`, `myAccountId`,
// `draftStatus` and we diff state across renders to detect transitions.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'inhouse:muted';

// v6.03 — bumped filename for cache-busting. Browsers caching the old
// `inhouse-alert.mp3` short ping will refetch the new bell asset because
// the URL changed. The mp3 is a 2.8s synthesised church-bell strike
// (six inharmonic sine partials, ~34 KB). The Web Audio synthesis below
// remains the authoritative path; the mp3 is used as a primary play
// target when HTMLAudioElement is available and the file loads cleanly.
const SOUND_URL = '/sounds/church-bell-v603.mp3';

// v6.62 / Task #206 — Voice Packs Pro SKU. Map each inhouse alert kind to
// the matching voice-pack event slot under
// `web/public/voice-packs/<pack>/<event>.mp3`. When the signed-in user has
// a Pro voice pack selected (`player_profiles.selected_voice_pack`), the
// matching pack mp3 plays instead of the default church bell. Any 404 /
// decode error falls back to the bell automatically (see fire() below).
const VOICE_PACK_EVENT_FOR_KIND = {
  'accept':       'match-start',
  'captain':      'achievement-unlock',
  'your-pick':    'level-up',
  'match-ready':  'match-start',
  'pick-warning': 'level-up',
};
function voicePackUrl(pack, event) {
  if (!pack || !event) return null;
  return `/voice-packs/${encodeURIComponent(pack)}/${encodeURIComponent(event)}.mp3`;
}

const NOTIF_TITLES = {
  accept:         'Inhouse — accept phase open',
  captain:        'Inhouse — you are a captain',
  'your-pick':    'Inhouse — your pick',
  'match-ready':  'Inhouse — match is ready',
  // Task #178 — fired before the per-pick auto-pick deadline so a captain
  // who tabbed away has a chance to come back before the ticker picks
  // for them. Title's lead-time digit is filled in dynamically from the
  // user's pref (Task #189).
  'pick-warning': 'Inhouse — pick warning',
};

const NOTIF_BODIES = {
  accept:         'Click Accept in the lobby (60s window).',
  captain:        'Lobby filled — you are captaining a team.',
  'your-pick':    'It is your turn to draft a player.',
  'match-ready':  'Connect link is live — join the server now.',
  'pick-warning': 'Pick now or the timer will auto-pick for you.',
};

// Task #178 — default pre-deadline lead time (ms) when the captain has
// not chosen a custom value via /settings/notifications. Task #189 lets
// users override this per account from {5, 10, 15, 20} seconds.
const DEFAULT_PICK_WARNING_LEAD_MS = 10000;
const ALLOWED_PICK_WARNING_LEADS_MS = [5000, 10000, 15000, 20000];

function readMuted() {
  try { return window.localStorage.getItem(STORAGE_KEY) === '1'; }
  catch (_) { return false; }
}

function writeMuted(v) {
  try { window.localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); }
  catch (_) { /* ignore */ }
}

// v6.03 — Synthesise a medieval church-bell strike at runtime via Web Audio.
// A real church bell has a fundamental ("hum tone") plus several inharmonic
// partials (prime, tierce, quint, nominal) that decay at different rates;
// approximating five sine partials with exponential amplitude envelopes
// gives the unmistakable bell timbre without needing a binary audio asset.
//
// Frequencies + relative amps tuned to read as "low, slow, slightly ominous"
// rather than the previous high-pitched ping. ~2.5s total ring-out.
function ringChurchBell(ctx, masterVolume = 0.7) {
  const now = ctx.currentTime;
  const fundamental = 196; // G3 — low, full church-bell register
  // Ratios roughly matching a real bronze bell's spectrum (hum, prime,
  // tierce minor-3rd, quint perfect-5th, nominal octave).
  const partials = [
    { ratio: 0.5,  amp: 0.55, decay: 2.6 }, // hum (sub-octave)
    { ratio: 1.0,  amp: 0.70, decay: 2.2 }, // prime / fundamental
    { ratio: 1.19, amp: 0.45, decay: 1.5 }, // minor-3rd tierce — gives the bell its dark colour
    { ratio: 1.50, amp: 0.40, decay: 1.4 }, // perfect-5th quint
    { ratio: 2.00, amp: 0.30, decay: 0.9 }, // nominal (octave) — strike clarity
    { ratio: 2.51, amp: 0.18, decay: 0.6 }, // upper inharmonic — adds the metallic edge
  ];
  const master = ctx.createGain();
  master.gain.value = masterVolume;
  master.connect(ctx.destination);

  for (const { ratio, amp, decay } of partials) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = fundamental * ratio;
    // Sharp strike attack (5ms) → exponential decay over `decay` seconds.
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(amp, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + decay + 0.05);
  }
  // Cleanup: disconnect the master when the longest partial finishes.
  setTimeout(() => { try { master.disconnect(); } catch (_) {} }, 3000);
}

export function useInhouseAlerts({ session, players, myAccountId, draftStatus }) {
  const [muted, setMutedState] = useState(() => (typeof window !== 'undefined' ? readMuted() : false));
  const audioCtxRef = useRef(null);
  // Lazy-loaded HTMLAudioElement for the shipped mp3; falls back to Web
  // Audio synthesis if the file fails to load (offline, blocked extension,
  // etc) so an alert always fires when not muted.
  const audioElRef = useRef(null);
  const audioElFailedRef = useRef(false);
  // v6.62 / Task #206 — per-event voice-pack HTMLAudioElement cache, keyed
  // by `${pack}|${event}`. Failed entries (404, decode error) are recorded
  // in voiceFailedRef so we don't keep retrying the same broken URL — the
  // next fire() for that kind silently falls back to the church bell.
  const voiceElsRef = useRef(new Map());
  const voiceFailedRef = useRef(new Set());
  const [voicePackId, setVoicePackId] = useState(null);
  // Track previous values so we only fire on transitions, not every poll.
  const prev = useRef({
    status: null,
    sessionId: null,
    capForMe: false,
    pickerTeam: null,
    serverReady: false,
  });
  // Task #178 — pick-warning bookkeeping. We schedule a one-shot timer
  // when the user is on the clock so the warning fires even if no poll
  // happens between now and T-10s. `pickWarningTimerRef` holds the
  // pending setTimeout id; `pickWarningFiredFor` tracks the deadline ISO
  // we already fired for so we never double-warn the same pick (e.g.
  // when /draft-status re-emits the same deadline).
  const pickWarningTimerRef = useRef(null);
  const pickWarningFiredFor = useRef(null);
  // Task #178 — user's opt-in/out pref for the pick warning. Tri-state:
  //   null  = pref not yet loaded for the signed-in user (suppress
  //           warning until we know — avoids firing for an opted-out
  //           captain whose page lands inside the warning window
  //           before /api/me/notifications resolves)
  //   true  = enabled (server-side default; also the value for
  //           anonymous viewers who can't be the captain anyway)
  //   false = explicit opt-out
  const [pickWarningEnabled, setPickWarningEnabled] = useState(
    () => (typeof window === 'undefined' ? true : null)
  );
  // Task #189 — user-tunable lead time (ms) for the pick warning. Loaded
  // alongside the on/off pref; defaults to 10s when the pref is missing
  // or out of range.
  const [pickWarningLeadMs, setPickWarningLeadMs] = useState(DEFAULT_PICK_WARNING_LEAD_MS);

  const setMuted = useCallback((v) => {
    setMutedState(v);
    writeMuted(v);
  }, []);

  const fire = useCallback((kind, opts) => {
    // v5.92: the mute toggle ONLY silences the audible chime — browser
    // notifications still fire so a player who muted the page tab can
    // still see the OS-level toast for an accept/draft/match-ready event.
    if (!muted && typeof window !== 'undefined') {
      // v6.62 / Task #206 — try the user's selected Pro voice pack first,
      // if any. Falls through to the church bell on any failure.
      const vEvent = VOICE_PACK_EVENT_FOR_KIND[kind];
      const vUrl = voicePackUrl(voicePackId, vEvent);
      const vKey = vUrl ? `${voicePackId}|${vEvent}` : null;
      if (vUrl && vKey && !voiceFailedRef.current.has(vKey)) {
        try {
          let el = voiceElsRef.current.get(vKey);
          if (!el) {
            el = new Audio(vUrl);
            el.preload = 'auto';
            el.volume = 0.85;
            el.addEventListener('error', () => { voiceFailedRef.current.add(vKey); });
            voiceElsRef.current.set(vKey, el);
          }
          el.currentTime = 0;
          const vp = el.play();
          if (vp && typeof vp.then === 'function') {
            vp.catch(() => { voiceFailedRef.current.add(vKey); });
          }
          // Voice pack played (or is in flight) — skip the bell so we
          // don't layer two sounds on top of each other.
          if (typeof window !== 'undefined' && 'Notification' in window) {
            // fall through to notification block below
          }
          // Continue past the bell branch to the notification block.
          // Use a labeled escape via early return-of-bell-block pattern:
        } catch (_) { voiceFailedRef.current.add(vKey); }
      }
      // Default chime path — runs when no voice pack is selected, the
      // selected pack file failed, or there's no event mapping for this
      // kind. The voice-pack branch above sets a "played" flag implicitly
      // by NOT marking failure; if it succeeded, skip the bell.
      const skipBell = vUrl && vKey && !voiceFailedRef.current.has(vKey);
      if (!skipBell) {
      // Try the shipped church-bell mp3 first. Web Audio synthesis is the
      // fallback — but ONLY runs from the play() promise's .catch() so a
      // successful HTMLAudio playback never layers a synthesised chime on
      // top of it. (Previous version triggered fallback eagerly when
      // play()'s promise hadn't resolved yet, causing doubled chimes.)
      const playWebAudioFallback = () => {
        try {
          const Ctor = window.AudioContext || window.webkitAudioContext;
          if (!Ctor) return;
          if (!audioCtxRef.current) audioCtxRef.current = new Ctor();
          const ctx = audioCtxRef.current;
          const ring = () => ringChurchBell(ctx, 0.7);
          if (ctx.state === 'suspended') ctx.resume().then(ring).catch(() => {});
          else ring();
        } catch (_) { /* no Web Audio — fall through to notification */ }
      };

      if (audioElFailedRef.current) {
        playWebAudioFallback();
      } else {
        try {
          if (!audioElRef.current) {
            audioElRef.current = new Audio(SOUND_URL);
            audioElRef.current.preload = 'auto';
            audioElRef.current.volume = 0.85;
            audioElRef.current.addEventListener('error', () => { audioElFailedRef.current = true; });
          }
          const el = audioElRef.current;
          el.currentTime = 0;
          const p = el.play();
          if (p && typeof p.then === 'function') {
            // Only fall back when play() actually rejects — never speculatively.
            p.catch(() => {
              audioElFailedRef.current = true;
              playWebAudioFallback();
            });
          }
          // If play() returned undefined (legacy browsers) it played
          // synchronously; no fallback needed.
        } catch (_) {
          audioElFailedRef.current = true;
          playWebAudioFallback();
        }
      }
      } // end !skipBell
    }
    // Browser notification (best-effort, always attempted).
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const title = (opts && opts.title) || NOTIF_TITLES[kind] || 'Inhouse alert';
      const send = () => {
        try {
          new Notification(title, {
            body: NOTIF_BODIES[kind] || '',
            tag: `inhouse-${kind}`,
            icon: '/favicon.png',
          });
        } catch (_) { /* ignore */ }
      };
      if (Notification.permission === 'granted') send();
      else if (Notification.permission === 'default') {
        Notification.requestPermission().then(p => { if (p === 'granted') send(); }).catch(() => {});
      }
    }
  }, [muted, voicePackId]);

  // v6.62 / Task #206 — load the signed-in user's selected voice pack
  // alongside the existing pick-warning pref load. Anonymous viewers (or
  // any failure path) leave voicePackId null, which keeps the default
  // church-bell chime active for everyone — no Pro entitlement check is
  // needed client-side because the server validates+gates the value at
  // POST /me/profile time, so a non-Pro user's saved pack is always null.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!myAccountId) { setVoicePackId(null); return; }
    let alive = true;
    fetch('/api/me/profile', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!alive) return;
        const v = data && data.customization && data.customization.selected_voice_pack;
        setVoicePackId(typeof v === 'string' && v ? v : null);
      })
      .catch(() => { if (alive) setVoicePackId(null); });
    return () => { alive = false; };
  }, [myAccountId]);

  // v6.03 — let callers test the bell from the mute toggle's tooltip / a
  // "Test sound" button so they know what to listen for before a real event.
  const testChime = useCallback(() => {
    if (typeof window === 'undefined') return;
    // Mirror fire()'s play strategy: shipped mp3 first, Web Audio fallback.
    if (!audioElFailedRef.current) {
      try {
        if (!audioElRef.current) {
          audioElRef.current = new Audio(SOUND_URL);
          audioElRef.current.preload = 'auto';
          audioElRef.current.volume = 0.85;
          audioElRef.current.addEventListener('error', () => { audioElFailedRef.current = true; });
        }
        audioElRef.current.currentTime = 0;
        const p = audioElRef.current.play();
        if (p && typeof p.then === 'function') p.catch(() => { audioElFailedRef.current = true; });
        return;
      } catch (_) { audioElFailedRef.current = true; }
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctor();
      const ctx = audioCtxRef.current;
      const ring = () => ringChurchBell(ctx, 0.7);
      if (ctx.state === 'suspended') ctx.resume().then(ring).catch(() => {});
      else ring();
    } catch (_) { /* ignore */ }
  }, []);

  // Task #178 — load the user's pick-warning pref once we know the
  // signed-in account. Defaults to true on any failure (404 if the route
  // is missing, 401 if the session expired between renders, network
  // error, …) so we fail open like the server-side helper does.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Anonymous viewers can't be a captain, so leave the gate open
    // (matches the server-side fail-open behaviour of
    // `db.isNotificationEnabled`).
    if (!myAccountId) {
      setPickWarningEnabled(true);
      setPickWarningLeadMs(DEFAULT_PICK_WARNING_LEAD_MS);
      return;
    }
    let alive = true;
    fetch('/api/me/notifications', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!alive) return;
        if (!data?.categories) {
          setPickWarningEnabled(true);
          setPickWarningLeadMs(DEFAULT_PICK_WARNING_LEAD_MS);
          return;
        }
        const row = data.categories.find(c =>
          (c.key || c.category) === 'inhouse_pick_warning'
        );
        // Missing row = server-side default (enabled). Explicit row
        // overrides with its boolean. Either way we now have a
        // definitive answer and the tri-state flips off `null`.
        setPickWarningEnabled(row ? !!row.enabled : true);
        // Task #189 — pick up the user-tunable lead time. Server returns
        // it as `value` (seconds) for tunable categories; we clamp to
        // the allowed set and fall back to 10s otherwise.
        const secs = row && row.value != null ? Number(row.value) * 1000 : DEFAULT_PICK_WARNING_LEAD_MS;
        setPickWarningLeadMs(
          ALLOWED_PICK_WARNING_LEADS_MS.includes(secs) ? secs : DEFAULT_PICK_WARNING_LEAD_MS
        );
      })
      .catch(() => {
        if (!alive) return;
        setPickWarningEnabled(true);
        setPickWarningLeadMs(DEFAULT_PICK_WARNING_LEAD_MS);
      });
    return () => { alive = false; };
  }, [myAccountId]);

  useEffect(() => {
    if (!session || !myAccountId) {
      prev.current = { status: null, sessionId: null, capForMe: false, pickerTeam: null, serverReady: false };
      return;
    }
    const inSession = (players || []).some(p => Number(p.account_id) === Number(myAccountId));
    const cap1 = Number(session.captain1_account_id) || 0;
    const cap2 = Number(session.captain2_account_id) || 0;
    const isCaptain = myAccountId === cap1 || myAccountId === cap2;
    const myCapTeam = myAccountId === cap1 ? 1 : myAccountId === cap2 ? 2 : null;
    const pickerTeam = draftStatus?.currentPickerTeam ?? null;
    const serverReady = !!(session.server_ip && session.match_password);

    // Reset diff baseline if we moved to a different session.
    if (prev.current.sessionId !== session.id) {
      prev.current = { status: session.status, sessionId: session.id, capForMe: isCaptain, pickerTeam, serverReady };
      return;
    }

    // accept phase opened (and user is in the lobby)
    if (session.status === 'accepting' && prev.current.status !== 'accepting' && inSession) {
      fire('accept');
    }
    // captains were selected and user is one of them
    if (session.status === 'drafting' && prev.current.status !== 'drafting' && isCaptain) {
      fire('captain');
    }
    // it's the user's turn to pick
    if (session.status === 'drafting' && myCapTeam !== null && pickerTeam === myCapTeam && prev.current.pickerTeam !== myCapTeam) {
      fire('your-pick');
    }
    // server ready / connect link is live (only alert players actually in the lobby)
    if (serverReady && !prev.current.serverReady && inSession) {
      fire('match-ready');
    }

    prev.current = { status: session.status, sessionId: session.id, capForMe: isCaptain, pickerTeam, serverReady };
  }, [session, players, myAccountId, draftStatus, fire]);

  // Task #178 — schedule a one-shot pre-deadline warning for the captain
  // on the clock. Runs whenever the deadline / picker / pref changes;
  // any stale timer is cleared first so a re-render after a fresh
  // /draft-status poll never stacks duplicate warnings.
  useEffect(() => {
    if (pickWarningTimerRef.current) {
      clearTimeout(pickWarningTimerRef.current);
      pickWarningTimerRef.current = null;
    }
    // Tri-state gate: null = pref not yet loaded, suppress until known.
    if (pickWarningEnabled !== true) return;
    if (!session || session.status !== 'drafting') return;
    if (!myAccountId) return;
    const cap1 = Number(session.captain1_account_id) || 0;
    const cap2 = Number(session.captain2_account_id) || 0;
    const myCapTeam = myAccountId === cap1 ? 1 : myAccountId === cap2 ? 2 : null;
    if (myCapTeam === null) return;
    const pickerTeam = draftStatus?.currentPickerTeam ?? null;
    if (pickerTeam !== myCapTeam) return;
    const deadlineRaw = draftStatus?.pickDeadlineAt;
    if (!deadlineRaw) return;
    const deadlineMs = new Date(deadlineRaw).getTime();
    if (!Number.isFinite(deadlineMs)) return;
    const deadlineKey = `${session.id}|${deadlineRaw}`;
    if (pickWarningFiredFor.current === deadlineKey) return;
    const fireAt = deadlineMs - pickWarningLeadMs;
    const delay = fireAt - Date.now();
    // Skip if the deadline is already past or so close that the
    // auto-pick is essentially imminent (<1s) — at that point the
    // ticker is about to take the turn and a warning is just noise.
    if (deadlineMs - Date.now() < 1500) return;
    const leadSecs = Math.round(pickWarningLeadMs / 1000);
    const trigger = () => {
      pickWarningTimerRef.current = null;
      pickWarningFiredFor.current = deadlineKey;
      fire('pick-warning', { title: `Inhouse — ${leadSecs}s left to pick` });
    };
    if (delay <= 0) {
      // Already inside the warning window (page just loaded with <10s
      // left, or the user re-tabbed in late). Fire immediately.
      trigger();
    } else {
      pickWarningTimerRef.current = setTimeout(trigger, delay);
    }
    return () => {
      if (pickWarningTimerRef.current) {
        clearTimeout(pickWarningTimerRef.current);
        pickWarningTimerRef.current = null;
      }
    };
  }, [session, myAccountId, draftStatus, pickWarningEnabled, pickWarningLeadMs, fire]);

  return useMemo(
    () => ({ muted, setMuted, toggleMute: () => setMuted(!muted), testChime }),
    [muted, setMuted, testChime]
  );
}
