import React, { useCallback, useEffect, useState } from 'react';
import { useSteamAuth } from '../context/SteamAuthContext';
import Dialog from '../components/Dialog';

function relativeTime(iso) {
  if (!iso) return 'Unknown';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'Unknown';
  const diff = Date.now() - then;
  if (diff < 0) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function SettingsSessions() {
  const { steamUser } = useSteamAuth() || {};
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [busyAll, setBusyAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/me/sessions', { credentials: 'include' });
      if (!r.ok) throw new Error('Could not load your sessions');
      const d = await r.json();
      setSessions(Array.isArray(d.sessions) ? d.sessions : []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (steamUser?.accountId) load(); }, [steamUser?.accountId, load]);

  const revokeOne = async (id) => {
    setBusyId(id);
    setError(null);
    try {
      const r = await fetch('/api/me/sessions/revoke', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid: id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Failed to sign out that device');
      if (d.signed_out) { window.location.href = '/?signed_out=1'; return; }
      await load();
    } catch (e) {
      setError(e.message);
    }
    setBusyId(null);
  };

  const revokeAll = async () => {
    setBusyAll(true);
    setError(null);
    try {
      const r = await fetch('/api/me/sessions/revoke-all', {
        method: 'POST',
        credentials: 'include',
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Failed to sign out everywhere');
      window.location.href = '/?signed_out=1';
    } catch (e) {
      setError(e.message);
      setBusyAll(false);
      setConfirmAllOpen(false);
    }
  };

  if (!steamUser?.accountId) {
    return <div><h2>Active sessions</h2><p>Sign in with Steam to view where your account is logged in.</p></div>;
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Active sessions</h2>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        These are the devices currently signed in to your account. If you see something you
        don&apos;t recognise, sign it out — and use <strong>Sign out everywhere</strong> if you
        think your account may be compromised. We never store your IP address or full browser
        details, only a rough device label and when it was last active.
      </p>

      {error && <div className="error-state" style={{ margin: '12px 0' }}>{error}</div>}

      {loading && <div className="loading">Loading\u2026</div>}

      {!loading && sessions.length === 0 && (
        <div style={{ color: 'var(--text-muted)', padding: '12px 0' }}>No active sessions found.</div>
      )}

      {!loading && sessions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {sessions.map((s) => (
            <div
              key={s.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', background: 'var(--bg-card)',
                border: '1px solid var(--border)', borderRadius: 10,
              }}
            >
              <div aria-hidden="true" style={{
                width: 32, height: 32, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-hover)', fontSize: 18,
              }}>🖥️</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                  {s.device}
                  {s.isCurrent && (
                    <span style={{
                      marginLeft: 8, fontSize: 11, fontWeight: 700, padding: '2px 8px',
                      borderRadius: 20, background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                      border: '1px solid rgba(34,197,94,0.3)',
                    }}>This device</span>
                  )}
                  {s.isSuperuser && (
                    <span style={{
                      marginLeft: 8, fontSize: 11, fontWeight: 700, padding: '2px 8px',
                      borderRadius: 20, background: 'rgba(245,158,11,0.15)', color: 'var(--amber, #f59e0b)',
                      border: '1px solid rgba(245,158,11,0.3)',
                    }}>Superuser</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Last active {relativeTime(s.lastSeenAt)}
                </div>
              </div>
              {!s.isCurrent && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => revokeOne(s.id)}
                  disabled={busyId === s.id}
                  aria-label={`Sign out ${s.device}`}
                  style={{ fontSize: 13 }}
                >
                  {busyId === s.id ? 'Signing out\u2026' : 'Sign out'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <button
          type="button"
          className="btn"
          style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
          onClick={() => setConfirmAllOpen(true)}
          disabled={busyAll}
          aria-label="Sign out of every device"
        >
          Sign out everywhere
        </button>
      )}

      <Dialog
        open={confirmAllOpen}
        onClose={() => { if (!busyAll) setConfirmAllOpen(false); }}
        label="Confirm sign out everywhere"
        backdropStyle={{ background: 'rgba(0,0,0,0.7)' }}
        contentStyle={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '24px 28px', maxWidth: 460, width: '100%',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Sign out everywhere?</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
          This ends every active session on all devices, including this one. You&apos;ll need to
          sign in with Steam again. Any stolen or lingering session will stop working immediately.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={() => setConfirmAllOpen(false)} disabled={busyAll}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
            onClick={revokeAll}
            disabled={busyAll}
          >
            {busyAll ? 'Signing out\u2026' : 'Sign out everywhere'}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
