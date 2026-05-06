import React, { useState, useEffect } from 'react';
import { useSteamAuth } from '../context/SteamAuthContext';

// First-login Discord ID onboarding modal (task 89).
//
// Shown to signed-in Steam users whose `nicknames.discord_id` is empty so
// the bot can DM them, mention them, and assign roles. Skipped entirely for
// players who joined via the Join-the-League form (their discord_id is
// already populated). The modal will re-show up to MAX_PROMPTS times across
// sessions; after that we stop nagging until the user updates their Discord
// ID from /settings/profile.
const SKIP_KEY = 'discordLinkModal:skipCount';
const SESSION_DISMISS_KEY = 'discordLinkModal:dismissedThisSession';
const MAX_PROMPTS = 3;

function getSkipCount() {
  try { return parseInt(localStorage.getItem(SKIP_KEY) || '0', 10) || 0; }
  catch { return 0; }
}
function bumpSkipCount() {
  try { localStorage.setItem(SKIP_KEY, String(getSkipCount() + 1)); } catch {}
}
function clearSkipCount() {
  try { localStorage.removeItem(SKIP_KEY); } catch {}
}

export default function DiscordLinkModal() {
  const { steamUser, refreshMe } = useSteamAuth() || {};
  const [open, setOpen] = useState(false);
  const [discordId, setDiscordId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // Decide whether to mount the modal whenever the auth payload changes.
  useEffect(() => {
    if (!steamUser || !steamUser.needs_discord_link) { setOpen(false); return; }
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(SESSION_DISMISS_KEY) === '1'; } catch {}
    if (dismissed) { setOpen(false); return; }
    if (getSkipCount() >= MAX_PROMPTS) { setOpen(false); return; }
    setOpen(true);
  }, [steamUser]);

  // Auto-clear toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const onSkip = () => {
    bumpSkipCount();
    try { sessionStorage.setItem(SESSION_DISMISS_KEY, '1'); } catch {}
    setOpen(false);
  };

  const onSave = async () => {
    const cleaned = discordId.trim();
    if (!/^\d{17,19}$/.test(cleaned)) {
      setError("That doesn't look right — Discord IDs are 17–19 digits.");
      return;
    }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/me/link-discord', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discord_id: cleaned }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Could not save your Discord ID.');
        setSaving(false);
        return;
      }
      clearSkipCount();
      try { sessionStorage.setItem(SESSION_DISMISS_KEY, '1'); } catch {}
      setOpen(false);
      setSaving(false);
      setToast('Discord linked. The bot can now DM you.');
      if (typeof refreshMe === 'function') {
        refreshMe().catch(() => {});
      }
    } catch (e) {
      setError(e.message || 'Network error. Try again.');
      setSaving(false);
    }
  };

  if (!open && !toast) return null;

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="discord-link-title"
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) onSkip(); }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderTop: '3px solid var(--accent, #c5a975)',
              borderRadius: 10,
              maxWidth: 460, width: '100%',
              padding: '22px 22px 18px',
              boxShadow: '0 18px 48px rgba(0,0,0,0.55)',
              color: 'var(--text-primary)',
            }}
          >
            <h2 id="discord-link-title" style={{ margin: '0 0 6px', fontSize: 20 }}>
              One last step — link your Discord
            </h2>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              We use your Discord ID to DM you match results, mention you in
              announcements, and assign your league roles. Without it, the bot
              can't reach you.
            </p>

            <label
              htmlFor="discord-id-input"
              style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}
            >
              Discord User ID
            </label>
            <input
              id="discord-id-input"
              type="text"
              inputMode="numeric"
              pattern="\d{17,19}"
              autoComplete="off"
              value={discordId}
              onChange={(e) => { setDiscordId(e.target.value.replace(/\D/g, '').slice(0, 19)); setError(null); }}
              placeholder="123456789012345678"
              disabled={saving}
              style={{
                width: '100%', padding: '9px 11px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--bg-primary, #0d1424)',
                color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit',
                letterSpacing: 0.4,
              }}
            />

            <div
              style={{
                marginTop: 12, padding: '10px 12px', borderRadius: 6,
                background: 'rgba(88,101,242,0.08)',
                border: '1px solid rgba(88,101,242,0.35)',
                fontSize: 12, lineHeight: 1.55, color: 'var(--text-muted)',
              }}
            >
              <strong style={{ color: 'var(--text-primary)' }}>How to find your ID:</strong> In Discord,
              click your profile → User Settings → Advanced → enable
              <em> Developer Mode</em> → right-click your name → <em>Copy User ID</em>.
            </div>

            {error && (
              <div style={{ marginTop: 10, color: '#ef4444', fontSize: 12 }}>{error}</div>
            )}

            <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <button
                type="button"
                onClick={onSkip}
                disabled={saving}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: 'var(--text-muted)', fontSize: 12,
                  textDecoration: 'underline', cursor: 'pointer',
                }}
              >
                Skip for now
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onSave}
                disabled={saving || !discordId}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 9001,
            background: '#0f3a1f', border: '1px solid #22c55e',
            color: '#d1fae5', borderRadius: 8,
            padding: '10px 14px', fontSize: 13,
            boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
