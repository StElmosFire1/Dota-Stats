// v5.92 — useInhouseAlerts(): plays a short two-tone chime + fires a
// browser Notification whenever an inhouse session enters a state that
// needs the signed-in user's attention. Mute toggle is persisted in
// localStorage under `inhouse:muted`.
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

const SOUND_URL = '/sounds/inhouse-alert.mp3';
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

export function useInhouseAlerts({ session, players, myAccountId, draftStatus }) {
  const [muted, setMutedState] = useState(() => (typeof window !== 'undefined' ? readMuted() : false));
  const audioRef = useRef(null);
  // Track previous values so we only fire on transitions, not every poll.
  const prev = useRef({
    status: null,
    sessionId: null,
    capForMe: false,
    pickerTeam: null,
    serverReady: false,
  });

  // Pre-load audio element once.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const a = new Audio(SOUND_URL);
    a.preload = 'auto';
    a.volume = 0.7;
    audioRef.current = a;
    return () => { audioRef.current = null; };
  }, []);

  const setMuted = useCallback((v) => {
    setMutedState(v);
    writeMuted(v);
  }, []);

  const fire = useCallback((kind) => {
    // v5.92: the mute toggle ONLY silences the audible chime — browser
    // notifications still fire so a player who muted the page tab can
    // still see the OS-level toast for an accept/draft/match-ready
    // event. The toggle label in the lobby header makes this scope clear.
    const a = audioRef.current;
    if (a && !muted) {
      try { a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); }
      catch (_) { /* autoplay blocked, ignore */ }
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

  return useMemo(() => ({ muted, setMuted, toggleMute: () => setMuted(!muted) }), [muted, setMuted]);
}
