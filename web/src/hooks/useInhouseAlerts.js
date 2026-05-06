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

const NOTIF_TITLES = {
  accept:        'Inhouse — accept phase open',
  captain:       'Inhouse — you are a captain',
  'your-pick':   'Inhouse — your pick',
  'match-ready': 'Inhouse — match is ready',
};

const NOTIF_BODIES = {
  accept:        'Click Accept in the lobby (60s window).',
  captain:       'Lobby filled — you are captaining a team.',
  'your-pick':   'It is your turn to draft a player.',
  'match-ready': 'Connect link is live — join the server now.',
};

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
  // Track previous values so we only fire on transitions, not every poll.
  const prev = useRef({
    status: null,
    sessionId: null,
    capForMe: false,
    pickerTeam: null,
    serverReady: false,
  });

  const setMuted = useCallback((v) => {
    setMutedState(v);
    writeMuted(v);
  }, []);

  const fire = useCallback((kind) => {
    // v5.92: the mute toggle ONLY silences the audible chime — browser
    // notifications still fire so a player who muted the page tab can
    // still see the OS-level toast for an accept/draft/match-ready event.
    if (!muted && typeof window !== 'undefined') {
      try {
        // Lazily create the AudioContext on first use — required by browser
        // autoplay policy (must be created/resumed in a user-gesture stack;
        // since the user toggled mute on or first interacted with the page
        // earlier, this typically succeeds on real interactions).
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (Ctor) {
          if (!audioCtxRef.current) audioCtxRef.current = new Ctor();
          const ctx = audioCtxRef.current;
          const ring = () => ringChurchBell(ctx, 0.7);
          if (ctx.state === 'suspended') {
            ctx.resume().then(ring).catch(() => {});
          } else {
            ring();
          }
        }
      } catch (_) { /* autoplay blocked / no Web Audio — fall through to notification */ }
    }
    // Browser notification (best-effort, always attempted).
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const send = () => {
        try {
          new Notification(NOTIF_TITLES[kind] || 'Inhouse alert', {
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
  }, [muted]);

  // v6.03 — let callers test the bell from the mute toggle's tooltip / a
  // "Test sound" button so they know what to listen for before a real event.
  const testChime = useCallback(() => {
    if (typeof window === 'undefined') return;
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

  return useMemo(
    () => ({ muted, setMuted, toggleMute: () => setMuted(!muted), testChime }),
    [muted, setMuted, testChime]
  );
}
