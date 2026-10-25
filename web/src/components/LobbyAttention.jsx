import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSteamAuth } from '../context/SteamAuthContext';
import { lobbyAttention } from '../lib/lobbyAttention';
import { useInhouseAlerts } from '../hooks/useInhouseAlerts';

// Mounted outside routes so reminders survive navigation to another site page.
// Preferences are per-account, per-browser; no unsolicited sound or permission prompt.
export default function LobbyAttention() {
  const { steamUser } = useSteamAuth();
  const accountId = steamUser?.accountId;
  const storageKey = `oi.lobby-attention.${accountId}`;
  const [enabled, setEnabled] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState({ session: null, players: [], draft: null });
  const sounds = useInhouseAlerts({
    session: snapshot.session, players: snapshot.players, myAccountId: accountId ? Number(accountId) : null,
    draftStatus: snapshot.draft, enabled: enabled && !error, managed: true,
  });
  const soundRef = useRef(sounds);
  soundRef.current = sounds;
  const notification = useRef(null);
  const acknowledged = useRef(new Set());
  const lastKey = useRef(null);
  const lastSignal = useRef(0);
  const tabId = useRef(Math.random().toString(36).slice(2));
  const leaseKey = `${storageKey}.sound-owner`;
  const ackKey = `${storageKey}.ack`;

  useEffect(() => {
    try { setEnabled(localStorage.getItem(storageKey) === 'true'); } catch { setEnabled(false); }
    setNotice(null); setSnapshot({ session: null, players: [], draft: null });
    try {
      const saved = JSON.parse(localStorage.getItem(ackKey) || '[]');
      acknowledged.current = new Set(Array.isArray(saved) ? saved : []);
    } catch { acknowledged.current.clear(); }
    lastKey.current = null;
    const sync = (event) => {
      if (event.key === storageKey) setEnabled(event.newValue === 'true');
      if (event.key === ackKey) {
        try {
          const saved = JSON.parse(event.newValue || '[]');
          acknowledged.current = new Set(Array.isArray(saved) ? saved : []);
          setNotice(current => current && acknowledged.current.has(current.key) ? null : current);
        } catch { /* Ignore malformed storage events. */ }
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [storageKey, ackKey]);

  useEffect(() => {
    if (!accountId) return;
    let disposed = false;
    let polling = false;
    const controller = new AbortController();
    async function poll() {
      if (polling) return;
      polling = true;
      try {
        const r = await fetch('/api/inhouse/active', { credentials: 'include', cache: 'no-store', signal: controller.signal });
        if (!r.ok) throw new Error('Lobby updates unavailable. Retrying…');
        const { session, players = [] } = await r.json();
        const member = players.some(p => String(p.account_id) === String(accountId) && p.status !== 'declined');
        if (member && ['open', 'accepting'].includes(session?.status)) {
          // Keep website presence alive across SPA pages, not just /inhouse.
          await fetch('/api/inhouse/heartbeat', { method: 'POST', credentials: 'include', signal: controller.signal });
        }
        let draft = null;
        if (member && session?.status === 'drafting') {
          const d = await fetch(`/api/inhouse/${session.id}/draft-status`, { cache: 'no-store', signal: controller.signal });
          if (!d.ok) throw new Error('Draft updates unavailable. Retrying…');
          draft = await d.json();
        }
        if (disposed) return;
        setError('');
        setSnapshot({ session, players, draft });
        const next = lobbyAttention(session, players, accountId, draft);
        if (next && !acknowledged.current.has(next.key)) setNotice(next);
        else setNotice(null);
      } catch (e) { if (!disposed && e.name !== 'AbortError') setError(e.message); }
      finally { polling = false; }
    }
    poll();
    const timer = setInterval(poll, 8000);
    return () => { disposed = true; controller.abort(); clearInterval(timer); };
  }, [accountId]);

  useEffect(() => {
    if (!enabled || !notice || error) {
      notification.current?.close();
      return;
    }
    function signal() {
      // Stop repeats immediately after acknowledgement, even before React cleanup.
      if (acknowledged.current.has(notice.key)) return;
      const fresh = lastKey.current !== notice.key;
      if (!fresh && Date.now() - lastSignal.current < 20000) return;
      // Only one open tab should make sound / send OS notifications.
      try {
        const lease = JSON.parse(localStorage.getItem(leaseKey) || 'null');
        if (lease && lease.id !== tabId.current && lease.until > Date.now()) return;
        localStorage.setItem(leaseKey, JSON.stringify({ id: tabId.current, until: Date.now() + 25000 }));
      } catch { /* Storage blocked: reminders still work in this tab. */ }
      lastKey.current = notice.key;
      lastSignal.current = Date.now();
      // Reuse the existing bell / selected voice-pack implementation.
      soundRef.current.playReminder(notice.key.includes('-pick-') ? 'your-pick' : notice.key.endsWith('-started') ? 'match-ready' : 'accept');
      if ('Notification' in window && Notification.permission === 'granted' && (!document.hasFocus() || document.hidden)) {
        try {
          notification.current?.close();
          const n = new Notification('OCE Inhouse lobby', { body: notice.message, tag: 'oi-lobby', requireInteraction: true });
          n.onclick = () => { window.focus(); window.location.assign('/inhouse'); n.close(); };
          notification.current = n;
        } catch { /* Some mobile browsers do not support the constructor. */ }
      }
    }
    signal();
    const timer = setInterval(signal, 20000);
    return () => {
      clearInterval(timer); notification.current?.close();
      try {
        const lease = JSON.parse(localStorage.getItem(leaseKey) || 'null');
        if (lease?.id === tabId.current) localStorage.removeItem(leaseKey);
      } catch { /* Ignore unavailable storage. */ }
    };
  }, [enabled, notice?.key, error, leaseKey]);

  useEffect(() => () => {
    notification.current?.close();
  }, []);

  async function toggle() {
    const next = !enabled;
    if (next) {
      try {
        sounds.setMuted(false);
        sounds.testChime();
        if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
      } catch { setError('Desktop alerts or sound are unavailable. In-site reminders still work.'); }
    }
    setEnabled(next);
    try { localStorage.setItem(storageKey, String(next)); } catch { /* In-memory preference still works. */ }
  }
  if (!accountId) return null;
  return (
    <aside id="lobby-reminders" aria-label="Lobby reminders" style={{ position: 'fixed', bottom: 18, right: 18, zIndex: 1200, maxWidth: 'min(360px, calc(100vw - 36px))', padding: 14, borderRadius: 10, background: 'var(--bg-card, #172034)', color: 'var(--text-primary)', border: '1px solid var(--border)', boxShadow: '0 4px 24px #0005' }}>
      <button className="btn" type="button" aria-pressed={enabled} onClick={toggle}>Lobby reminders: {enabled ? 'on' : 'off'}</button>
      {enabled && <details style={{ fontSize: 12, marginTop: 8 }}><summary>Sound and browser permissions</summary><p>Sound repeats every 20 seconds until acknowledged or no longer needed. Keep this site open. After a refresh, <button type="button" onClick={sounds.testChime}>test / resume sound</button>. Browser and OS settings may limit background alerts.</p></details>}
      {enabled && 'Notification' in window && Notification.permission === 'denied' && <p style={{ fontSize: 12 }}>Desktop notifications are blocked. Allow them in your browser’s site permissions if wanted.</p>}
      {enabled && error && <p role="status">{error}</p>}
      {enabled && notice && <div role="alert">
        <p>{notice.message}</p>
        <Link to="/inhouse">Open lobby</Link>{' '}
        <button type="button" className="btn" onClick={() => {
          acknowledged.current.add(notice.key);
          try { localStorage.setItem(ackKey, JSON.stringify([...acknowledged.current].slice(-80))); } catch { /* In-memory acknowledgement still applies. */ }
          setNotice(null); notification.current?.close();
        }}>Acknowledge</button>
      </div>}
    </aside>
  );
}
