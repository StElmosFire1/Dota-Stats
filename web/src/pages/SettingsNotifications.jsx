import React, { useEffect, useState, useCallback } from 'react';
import { useSteamAuth } from '../context/SteamAuthContext';
import { useFeatureFlag } from '../context/FeatureFlagsContext';

const CATEGORY_LABELS = {
  post_match_dm:     { title: 'Post-match summary',  desc: 'Card with your stats sent after each game.' },
  mvp_vote:          { title: 'MVP vote prompts',    desc: 'DM asking you to nominate a teammate as MVP.' },
  attitude_vote:     { title: 'Attitude rating prompts', desc: 'DM asking you to rate teammate attitude.' },
  hot_streak:        { title: 'Hot-streak shoutouts', desc: 'Announcement when you hit a 5- or 10-win streak.' },
  schedule_reminder: { title: 'Game schedule reminders', desc: 'T-24h and T-1h reminders for scheduled games.' },
  weekly_recap:      { title: 'Weekly recap',        desc: 'Sunday-night digest of the week\u2019s games.' },
};

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
  const enabled = useFeatureFlag('notification_prefs');
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
            const meta = CATEGORY_LABELS[p.category] || { title: p.category, desc: '' };
            return (
              <div key={p.category} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 8,
              }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{meta.title}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{meta.desc}</div>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!p.enabled}
                    disabled={saving}
                    onChange={(e) => togglePref(p.category, e.target.checked)}
                  />
                  <span style={{ fontSize: 13 }}>{p.enabled ? 'On' : 'Off'}</span>
                </label>
              </div>
            );
          })}
        </div>
      )}

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
