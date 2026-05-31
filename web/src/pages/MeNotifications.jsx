import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSteamAuth } from '../context/SteamAuthContext';
import SignInPrompt from '../components/SignInPrompt';

// Task #407 — Notification preference centre v2. One row per catalogued
// event, two toggles each: Discord DM + Web Push. Reads /api/me/notification-events
// for the full matrix and writes single-cell updates to the same endpoint.
//
// Defaults are baked into the server-side catalogue; a row is only ever
// persisted when the user toggles something, so existing users see no
// behaviour change until they visit this page.

const CHANNEL_LABELS = {
  discord: 'Discord DM',
  push: 'Web push',
};

export default function MeNotifications() {
  const { steamUser } = useSteamAuth() || {};
  const [events, setEvents] = useState([]);
  const [channels, setChannels] = useState(['discord', 'push']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/me/notification-events', { credentials: 'include' });
      if (res.status === 401) { setError('Sign in with Steam to manage notifications.'); setLoading(false); return; }
      if (!res.ok) throw new Error('Failed to load preferences');
      const data = await res.json();
      setEvents(data.events || []);
      if (Array.isArray(data.channels) && data.channels.length) setChannels(data.channels);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { if (steamUser?.accountId) load(); }, [steamUser, load]);

  const toggleCell = async (eventKey, channel, nextEnabled) => {
    setSaving(true);
    setEvents(prev => prev.map(ev => (
      ev.key === eventKey
        ? { ...ev, channels: { ...ev.channels, [channel]: { ...(ev.channels?.[channel] || {}), enabled: nextEnabled, source: 'user' } } }
        : ev
    )));
    try {
      const res = await fetch('/api/me/notification-events', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: [{ event_key: eventKey, channel, enabled: nextEnabled }] }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Save failed');
      }
      const data = await res.json();
      setEvents(data.events || []);
    } catch (e) {
      setError(e.message);
      // Roll back on failure.
      load();
    }
    setSaving(false);
  };

  if (!steamUser?.accountId) {
    return <SignInPrompt title="Notifications" message="Sign in with Steam to manage your notification preferences." />;
  }

  return (
    <div className="container" style={{ maxWidth: 760, padding: '24px 16px' }}>
      <h1 style={{ marginBottom: 8 }}>Notifications</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Choose how you want to be notified for each event. Toggle Discord DM
        and Web Push independently — defaults match what you already receive.
      </p>
      <p style={{ color: 'var(--text-muted)', marginTop: 0, fontSize: 13 }}>
        Looking for the legacy single-toggle page (lobby chime, presence chip, push device setup)? It's still at <Link to="/settings/notifications">/settings/notifications</Link>.
      </p>

      {error && <div className="error-state" style={{ margin: '12px 0' }}>{error}</div>}
      {loading && <div className="loading">Loading preferences…</div>}

      {!loading && events.length > 0 && (
        <div role="table" aria-label="Notification preferences" style={{
          display: 'grid',
          gridTemplateColumns: `minmax(0,1fr) repeat(${channels.length}, minmax(110px, max-content))`,
          gap: '1px',
          background: 'var(--border)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          marginTop: 16,
          overflow: 'hidden',
        }}>
          <div role="row" style={{ display: 'contents' }}>
            <div role="columnheader" style={{ background: 'var(--bg-card)', padding: '10px 12px', fontWeight: 600 }}>Event</div>
            {channels.map(ch => (
              <div key={ch} role="columnheader" style={{ background: 'var(--bg-card)', padding: '10px 12px', fontWeight: 600, textAlign: 'center' }}>
                {CHANNEL_LABELS[ch] || ch}
              </div>
            ))}
          </div>
          {events.map(ev => (
            <div role="row" key={ev.key} style={{ display: 'contents' }}>
              <div role="cell" style={{ background: 'var(--bg-card)', padding: '12px' }}>
                <div style={{ fontWeight: 600 }}>{ev.label}</div>
                {ev.desc && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{ev.desc}</div>}
              </div>
              {channels.map(ch => {
                const cell = ev.channels?.[ch] || { enabled: false, default: false, source: 'default' };
                const inputId = `pref-${ev.key}-${ch}`;
                return (
                  <div role="cell" key={ch} style={{ background: 'var(--bg-card)', padding: '12px', textAlign: 'center' }}>
                    <label htmlFor={inputId} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: saving ? 'wait' : 'pointer' }}>
                      <input
                        id={inputId}
                        type="checkbox"
                        role="switch"
                        aria-checked={!!cell.enabled}
                        checked={!!cell.enabled}
                        disabled={saving}
                        onChange={(e) => toggleCell(ev.key, ch, e.target.checked)}
                        aria-label={`${ev.label} — ${CHANNEL_LABELS[ch] || ch}`}
                      />
                      <span style={{ fontSize: 13, color: cell.enabled ? 'var(--text)' : 'var(--text-muted)' }}>
                        {cell.enabled ? 'On' : 'Off'}
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 16 }}>
        Web push notifications include a one-tap "Unsubscribe" action that
        mutes that single event-channel combination instantly — no need to
        come back here.
      </p>
    </div>
  );
}
