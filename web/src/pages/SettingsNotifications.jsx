import React, { useEffect, useState, useCallback } from 'react';
import { useSteamAuth } from '../context/SteamAuthContext';
import { useFeatureFlag } from '../context/FeatureFlagsContext';
import { getMyPresenceVisibility, setMyPresenceVisibility } from '../api';

// v5.90 — added the missing labels (match_ready + the three coaching
// categories) and a smarter fallback so any future server-side category
// renders as a Title-Cased name instead of a blank row.
const CATEGORY_LABELS = {
  post_match_dm:              { title: 'Post-match summary',     desc: 'Card with your stats sent after each game.' },
  match_ready:                { title: 'Match ready',            desc: 'DM when an inhouse lobby is ready for you to join.' },
  mvp_vote:                   { title: 'MVP vote prompts',       desc: 'DM asking you to nominate a teammate as MVP.' },
  attitude_vote:              { title: 'Attitude rating prompts', desc: 'DM asking you to rate teammate attitude.' },
  hot_streak:                 { title: 'Hot-streak shoutouts',   desc: 'Announcement when you hit a 5- or 10-win streak.' },
  schedule_reminder:          { title: 'Game schedule reminders', desc: 'T-24h and T-1h reminders for scheduled games.' },
  weekly_recap:               { title: 'Weekly recap',           desc: 'Sunday-night digest of the week\u2019s games.' },
  coaching_booking_confirmed: { title: 'Coaching: booking confirmed', desc: 'DM when one of your coaching bookings is paid and locked in.' },
  coaching_session_reminder:  { title: 'Coaching: session reminder',  desc: 'DM ~1 hour before a scheduled coaching session.' },
  coaching_review_request:    { title: 'Coaching: review request',    desc: 'DM after a completed session asking you to leave a review.' },
  inhouse_pick_warning:       { title: 'Inhouse: pick warning',     desc: 'Chime + browser notification when you\u2019re the captain on the clock and the per-pick timer is about to auto-pick for you. Use the lead-time selector to control how early it fires.' },
  // Task #316 — engagement loop opt-ins.
  weekly_summary:             { title: 'Weekly inhouse summary',    desc: 'Sunday-evening DM + web push with your week of games (W/L, K/D/A, avg PERF).' },
  match_imminent_push:        { title: 'Match imminent push',       desc: 'Browser push ~5 min before lobby boot so you don\u2019t miss the accept phase.' },
};

function humaniseCategory(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function SettingsNotifications() {
  const { steamUser } = useSteamAuth() || {};
  const enabled = true;
  const pushEnabled = useFeatureFlag('web_push');

  const [prefs, setPrefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Web push state
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSub, setPushSub] = useState(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState(null);

  useEffect(() => {
    setPushSupported(typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window);
  }, []);

  const loadPrefs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/me/notifications', { credentials: 'include' });
      if (res.status === 401) { setError('Sign in with Steam to manage notifications.'); setLoading(false); return; }
      if (res.status === 404) { setError('Notification preferences are not enabled yet.'); setLoading(false); return; }
      if (!res.ok) throw new Error('Failed to load preferences');
      const data = await res.json();
      setPrefs(data.categories || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { if (enabled && steamUser?.accountId) loadPrefs(); }, [enabled, steamUser, loadPrefs]);

  // Detect existing push subscription on mount.
  useEffect(() => {
    if (!pushSupported || !pushEnabled) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        setPushSub(sub);
      } catch {}
    })();
  }, [pushSupported, pushEnabled]);

  // Task #205 — live presence chip visibility toggle.
  const [presenceVisible, setPresenceVisible] = useState(true);
  const [presenceLoaded, setPresenceLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getMyPresenceVisibility()
      .then(r => { if (!cancelled) { setPresenceVisible(r?.presence_visible !== false); setPresenceLoaded(true); } })
      .catch(() => { if (!cancelled) setPresenceLoaded(true); });
    return () => { cancelled = true; };
  }, []);
  const togglePresenceVisible = async (next) => {
    setPresenceVisible(next);
    try { await setMyPresenceVisibility(next); } catch { /* leave optimistic state */ }
  };

  const togglePref = async (category, nextEnabled) => {
    setSaving(true);
    try {
      const res = await fetch('/api/me/notifications', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: [{ category, enabled: nextEnabled }] }),
      });
      if (!res.ok) throw new Error('Save failed');
      const data = await res.json();
      setPrefs(data.categories || []);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  // Task #189 — persist a tunable value (e.g. inhouse_pick_warning lead
  // time in seconds) without changing the on/off state. The server merges
  // the value into the existing row, so passing the current `enabled`
  // here keeps the toggle untouched.
  const setPrefValue = async (category, currentEnabled, nextValue) => {
    setSaving(true);
    try {
      const res = await fetch('/api/me/notifications', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: [{ category, enabled: currentEnabled, value: nextValue }] }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Save failed');
      }
      const data = await res.json();
      setPrefs(data.categories || []);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const enablePush = async () => {
    setPushBusy(true); setPushMsg(null);
    try {
      const keyRes = await fetch('/api/web-push/public-key');
      if (keyRes.status === 503) throw new Error('Web push not yet configured by admin (VAPID keys missing).');
      if (!keyRes.ok) throw new Error('Could not load push public key');
      const { publicKey } = await keyRes.json();

      const reg = await navigator.serviceWorker.register('/sw.js');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Permission denied for notifications');

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const subRes = await fetch('/api/me/push/subscribe', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!subRes.ok) {
        const e = await subRes.json().catch(() => ({}));
        throw new Error(e.error || 'Subscribe failed');
      }
      setPushSub(sub);
      setPushMsg('Push notifications enabled.');
    } catch (e) { setPushMsg(e.message); }
    setPushBusy(false);
  };

  const testPush = async () => {
    setPushBusy(true); setPushMsg(null);
    try {
      const res = await fetch('/api/me/push/test', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Test send failed');
      }
      const data = await res.json();
      setPushMsg(`Test sent to ${data.sent} device(s).`);
    } catch (e) { setPushMsg(e.message); }
    setPushBusy(false);
  };

  const disablePush = async () => {
    if (!pushSub) return;
    setPushBusy(true); setPushMsg(null);
    try {
      const endpoint = pushSub.endpoint;
      await fetch('/api/me/push/subscriptions', {
        method: 'DELETE', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      try { await pushSub.unsubscribe(); } catch {}
      setPushSub(null);
      setPushMsg('Push notifications disabled.');
    } catch (e) { setPushMsg(e.message); }
    setPushBusy(false);
  };

  if (!enabled) {
    return (
      <div className="container" style={{ maxWidth: 720, padding: '24px 16px' }}>
        <h1>Notifications</h1>
        <p>Notification preferences are not enabled yet.</p>
      </div>
    );
  }

  if (!steamUser?.accountId) {
    return (
      <div className="container" style={{ maxWidth: 720, padding: '24px 16px' }}>
        <h1>Notifications</h1>
        <p>Sign in with Steam to manage your notification preferences.</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 720, padding: '24px 16px' }}>
      <h1 style={{ marginBottom: 8 }}>Notifications</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Choose which messages you want to receive from the inhouse bot.
      </p>

      {error && <div className="error-state" style={{ margin: '12px 0' }}>{error}</div>}
      {loading && <div className="loading">Loading preferences\u2026</div>}

      {!loading && prefs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          {prefs.map(p => {
            // Server returns { key, label, enabled, ... }; tolerate the
            // legacy `category` shape too just in case.
            const cat = p.key || p.category;
            const meta = CATEGORY_LABELS[cat] || { title: humaniseCategory(cat), desc: '' };
            return (
              <div key={cat} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 8, gap: 12, flexWrap: 'wrap',
              }}>
                <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                  <div style={{ fontWeight: 600 }}>{meta.title}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{meta.desc}</div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {/* Task #189 — tunable-value selector (e.g. pick-warning lead time). */}
                  {Array.isArray(p.value_options) && p.value_options.length > 0 && (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Lead time</span>
                      <select
                        value={p.value ?? p.value_default ?? p.value_options[0]}
                        disabled={saving || !p.enabled}
                        onChange={(e) => setPrefValue(cat, p.enabled, Number(e.target.value))}
                        aria-label={`${meta.title} lead time`}
                      >
                        {p.value_options.map(v => (
                          <option key={v} value={v}>{v}{p.value_unit || ''}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!p.enabled}
                      disabled={saving}
                      onChange={(e) => togglePref(cat, e.target.checked)}
                    />
                    <span style={{ fontSize: 13 }}>{p.enabled ? 'On' : 'Off'}</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section style={{ marginTop: 28 }}>
        <h2 style={{ marginBottom: 8 }}>Live status chip</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          Show a small live status pill on your public profile cover (in game,
          in lobby, in queue, in voice, online). Powered by Discord and Dota 2
          presence — no extra data is stored. Toggle off to keep your profile
          showing only static stats.
        </p>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: presenceLoaded ? 'pointer' : 'wait' }}>
          <input
            type="checkbox"
            checked={!!presenceVisible}
            disabled={!presenceLoaded}
            onChange={(e) => togglePresenceVisible(e.target.checked)}
          />
          <span style={{ fontSize: 14 }}>{presenceVisible ? 'Live status chip visible' : 'Live status chip hidden'}</span>
        </label>
      </section>

      {pushEnabled && (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ marginBottom: 8 }}>Push notifications</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
            Get browser push reminders for scheduled games and post-match recaps.
          </p>
          {!pushSupported && <div className="error-state">This browser does not support push notifications.</div>}
          {pushSupported && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {!pushSub && (
                <button className="btn btn-primary" onClick={enablePush} disabled={pushBusy}>
                  {pushBusy ? 'Working\u2026' : 'Enable push notifications'}
                </button>
              )}
              {pushSub && (
                <>
                  <button className="btn" onClick={testPush} disabled={pushBusy}>Send test</button>
                  <button className="btn" onClick={disablePush} disabled={pushBusy}>Disable</button>
                </>
              )}
              {pushMsg && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{pushMsg}</span>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
