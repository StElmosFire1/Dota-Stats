import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSteamAuth } from '../context/SteamAuthContext';

const DISMISS_KEY = 'onboarding_nudge_dismissed_v1';
const HIDE_ON = ['/settings', '/inhouse'];

export default function OnboardingNudge({ onResume }) {
  const { steamUser, onboardingComplete } = useSteamAuth() || {};
  const location = useLocation();
  const [dismissed, setDismissed] = useState(() => {
    try { return !!localStorage.getItem(DISMISS_KEY); } catch { return false; }
  });
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!steamUser?.accountId || onboardingComplete !== false) return;
    fetch('/api/me/home', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStepIdx(d.onboarding_step_index || 0); })
      .catch(() => {});
  }, [steamUser?.accountId, onboardingComplete]);

  if (!steamUser?.accountId) return null;
  if (onboardingComplete !== false) return null;
  if (dismissed) return null;
  if (HIDE_ON.some(p => location.pathname.startsWith(p))) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label="Finish setting up your account"
      style={{
        margin: '12px auto 0', maxWidth: 1080, padding: '10px 14px',
        background: 'linear-gradient(90deg, rgba(245,158,11,0.10), rgba(245,158,11,0.04))',
        border: '1px solid rgba(245,158,11,0.4)',
        borderRadius: 10,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 18 }}>👋</span>
      <div style={{ flex: 1, minWidth: 220, fontSize: 13, color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--text-primary)' }}>Finish setting up your account</strong>
        {stepIdx > 0 ? ` — picking up at step ${stepIdx + 1} of 5.` : ' — takes about a minute.'}
      </div>
      <button type="button" className="btn btn-primary" style={{ fontSize: 13, padding: '6px 12px' }} onClick={onResume}>
        Resume tour
      </button>
      <Link to="/settings" className="btn" style={{ fontSize: 13, padding: '6px 12px' }}>
        Settings
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss reminder"
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 18, padding: 4, lineHeight: 1,
        }}
      >×</button>
    </div>
  );
}
