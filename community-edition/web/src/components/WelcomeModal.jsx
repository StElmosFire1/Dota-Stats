import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useFeatureFlag } from '../context/FeatureFlagsContext';
import Dialog from './Dialog';

const STORAGE_KEY = 'welcomeModalS10Dismissed_v1';

export default function WelcomeModal() {
  const enabled = useFeatureFlag('welcome_modal_s10');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      return;
    }
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (!dismissed) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [enabled]);

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* localStorage may be blocked */ }
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      labelledBy="welcome-modal-s10-title"
      backdropStyle={{ zIndex: 10000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
      contentStyle={{
        width: '100%', maxWidth: 540,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '28px 26px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(168,85,247,0.25)',
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#a855f7', marginBottom: 8 }}>
        ⚡ SEASON 10 IS LIVE
      </div>
      <h2 id="welcome-modal-s10-title" style={{ margin: '0 0 12px', fontSize: 26 }}>Welcome to a fresh start</h2>
      <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55 }}>
        The leaderboard has been reset and every player begins on the new MMR ladder.
        Tier badges, tournaments, and a redesigned profile experience are now unlocked.
      </p>
      <ul style={{ margin: '0 0 18px 18px', padding: 0, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7 }}>
        <li>New 8-tier MMR badges (everyone starts at <strong>Tier&nbsp;V</strong>)</li>
        <li>Tournament self-signup with Stripe entry fees</li>
        <li>MVP votes now show as match-level badges</li>
        <li>Refreshed home page and player profile charts</li>
      </ul>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button
          onClick={dismiss}
          style={{
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-muted)', borderRadius: 8,
            padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          Maybe later
        </button>
        <Link
          to="/patch-notes"
          onClick={dismiss}
          className="btn btn-primary"
          style={{ fontSize: 13, padding: '9px 16px' }}
        >
          Read patch notes
        </Link>
        <Link
          to="/leaderboard"
          onClick={dismiss}
          className="btn btn-primary"
          style={{
            fontSize: 13, padding: '9px 16px',
            background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
            borderColor: '#7c3aed',
          }}
        >
          Start the climb →
        </Link>
      </div>
    </Dialog>
  );
}
