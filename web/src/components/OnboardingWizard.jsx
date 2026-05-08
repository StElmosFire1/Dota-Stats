import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSteamAuth } from '../context/SteamAuthContext';

const NOTIFICATION_LABELS = {
  post_match_dm:     { title: 'Post-match summary',       desc: 'DM with your stats after each game.' },
  mvp_vote:          { title: 'MVP vote prompts',         desc: 'DM asking you to nominate a teammate as MVP.' },
  attitude_vote:     { title: 'Attitude rating prompts',  desc: 'DM asking you to rate teammate attitude.' },
  hot_streak:        { title: 'Hot-streak shoutouts',     desc: 'Announcement when you hit a 5- or 10-win streak.' },
  schedule_reminder: { title: 'Game schedule reminders',  desc: 'T-24h and T-1h reminders for scheduled games.' },
  weekly_recap:      { title: 'Weekly recap',             desc: 'Sunday-night digest of the week\'s games.' },
};

export default function OnboardingWizard({ onComplete, onDismiss }) {
  const { steamUser } = useSteamAuth() || {};
  const [step, setStep] = useState(1);
  const [prefs, setPrefs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Build default prefs from NOTIFICATION_LABELS — used as fallback when the
  // notification_prefs feature flag is off (API returns 404) so the wizard
  // step is always interactive, not stuck on "Loading preferences…".
  const DEFAULT_PREFS = Object.keys(NOTIFICATION_LABELS).map(key => ({ category: key, key, enabled: true }));

  const loadPrefs = useCallback(async () => {
    try {
      const res = await fetch('/api/me/notifications', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const loaded = (data.categories || []).filter(c => NOTIFICATION_LABELS[c.category] || NOTIFICATION_LABELS[c.key]);
        setPrefs(loaded.length > 0 ? loaded : DEFAULT_PREFS);
      } else {
        // Feature flag off or unavailable — show static defaults so the step renders
        setPrefs(DEFAULT_PREFS);
      }
    } catch {
      setPrefs(DEFAULT_PREFS);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step === 2) loadPrefs();
  }, [step, loadPrefs]);

  const togglePref = async (category, nextEnabled) => {
    // Optimistically update local state so the checkbox feels responsive
    setPrefs(prev => prev.map(p => (p.category || p.key) === category ? { ...p, enabled: nextEnabled } : p));
    try {
      const res = await fetch('/api/me/notifications', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: [{ category, enabled: nextEnabled }] }),
      });
      if (res.ok) {
        const data = await res.json();
        const loaded = (data.categories || []).filter(c => NOTIFICATION_LABELS[c.category] || NOTIFICATION_LABELS[c.key]);
        if (loaded.length > 0) setPrefs(loaded);
      }
      // Non-ok (e.g. feature flag off): local optimistic state is good enough
    } catch { /* network error — optimistic state kept */ }
  };

  const finish = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/me/onboarding/complete', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }
      onComplete?.();
    } catch (e) { setError(e.message); setSaving(false); return; }
    setSaving(false);
  };

  const backdrop = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px',
  };

  const modal = {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 16, padding: '32px 36px', maxWidth: 520, width: '100%',
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
    position: 'relative',
  };

  const stepDots = (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 28 }}>
      {[1, 2, 3].map(s => (
        <div key={s} style={{
          width: s === step ? 24 : 8, height: 8, borderRadius: 4,
          background: s <= step ? 'var(--accent-blue, #3b82f6)' : 'var(--border)',
          transition: 'all 0.2s',
        }} />
      ))}
    </div>
  );

  return (
    <div
      style={backdrop}
      role="presentation"
      onClick={e => { if (e.target === e.currentTarget) onDismiss?.(); }}
      onKeyDown={e => { if (e.key === 'Escape') onDismiss?.(); }}
    >
      <div style={modal} role="dialog" aria-modal="true" aria-label="Welcome to OCE Inhouse">
        <button
          onClick={onDismiss}
          style={{
            position: 'absolute', top: 14, right: 16,
            background: 'transparent', border: 'none',
            color: 'var(--text-muted)', cursor: 'pointer',
            fontSize: 20, lineHeight: 1, padding: 4,
          }}
          aria-label="Close"
        >×</button>

        {stepDots}
        {error && (
          <div style={{ marginBottom: 16, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, fontSize: 13, color: '#f87171' }}>
            {error}
          </div>
        )}

        {step === 1 && (
          <div>
            <div style={{ fontSize: 28, marginBottom: 8, textAlign: 'center' }}>👋</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center' }}>
              Welcome to OCE Inhouse
            </h2>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>
              Let's get you set up in just a few steps.
            </p>

            <div style={{
              background: 'var(--bg-hover)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '16px 20px', marginBottom: 24,
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Step 1 — Steam Account
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img
                  src="https://store.steampowered.com/favicon.ico"
                  alt=""
                  style={{ width: 32, height: 32 }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
                    {steamUser?.displayName || `Player ${steamUser?.accountId}`}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Steam ID: {steamUser?.steamId64 || steamUser?.accountId}
                  </div>
                </div>
                <span style={{
                  marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '3px 10px',
                  borderRadius: 20, background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                  border: '1px solid rgba(34,197,94,0.3)',
                }}>
                  ✓ Linked
                </span>
              </div>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, textAlign: 'center' }}>
              Your Steam account is linked. This lets us match your in-game stats to your profile.
            </p>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: 15, fontWeight: 700 }}
              onClick={() => setStep(2)}
            >
              Next: Notifications →
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div style={{ fontSize: 28, marginBottom: 8, textAlign: 'center' }}>🔔</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center' }}>
              Notification preferences
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>
              Choose which Discord DMs you want to receive from the bot.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {prefs.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
                  Loading preferences…
                </div>
              )}
              {prefs.map(p => {
                const key = p.category || p.key;
                const meta = NOTIFICATION_LABELS[key];
                if (!meta) return null;
                return (
                  <label key={key} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 14px', background: 'var(--bg-hover)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={!!p.enabled}
                      disabled={saving}
                      onChange={e => togglePref(key, e.target.checked)}
                      style={{ marginTop: 2, flexShrink: 0 }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                        {meta.title}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {meta.desc}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn"
                style={{ flex: 1, padding: '10px' }}
                onClick={() => setStep(1)}
              >
                ← Back
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 2, padding: '10px', fontSize: 14, fontWeight: 700 }}
                onClick={() => setStep(3)}
              >
                Next: Finish →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>
              You're all set!
            </h2>
            <p style={{ margin: '0 0 28px', fontSize: 14, color: 'var(--text-secondary)' }}>
              Your account is linked and preferences are saved. Head to your profile to see your stats, or check the leaderboard.
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
              {steamUser?.accountId && (
                <Link
                  to={`/player/${steamUser.accountId}`}
                  className="btn btn-primary"
                  onClick={finish}
                  style={{ fontSize: 14 }}
                >
                  👤 My Profile
                </Link>
              )}
              <Link
                to="/leaderboard"
                className="btn"
                onClick={finish}
                style={{ fontSize: 14 }}
              >
                🏆 Leaderboard
              </Link>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: 15, fontWeight: 700 }}
              onClick={finish}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Go to my dashboard'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
