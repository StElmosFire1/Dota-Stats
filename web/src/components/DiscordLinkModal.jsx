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

// Map server-returned `?reason=...` codes from /auth/discord/callback to a
// human-friendly message. Codes mirror verifyAndConfirmDiscordId() plus the
// OAuth-specific failures (cancelled, bad_state, token_exchange, …).
export function oauthErrorMessage(code) {
  switch (code) {
    case 'cancelled':            return 'Discord sign-in was cancelled.';
    case 'oauth_disabled':       return 'Discord sign-in isn\'t configured on this site yet — paste your User ID below instead.';
    case 'bad_state':            return 'Discord sign-in expired. Please try again.';
    case 'token_exchange':
    case 'user_fetch':
    case 'oauth_error':          return 'Discord sign-in failed. Please try again.';
    case 'signed_out':           return 'Your Steam session expired. Sign in again, then re-try.';
    case 'already_linked_other': return 'Your account is already linked to a different Discord ID. Update it from Settings → Profile.';
    case 'discord_id_taken':     return 'That Discord account is already linked to another player. If this is your account, ask an admin to help reconcile it.';
    case 'dm_blocked':           return "We found your Discord account but couldn't DM you. Join the OCE Inhouse server and enable \"Direct Messages from server members\" in Privacy Settings, then try again.";
    case 'not_found':            return "We couldn't verify that Discord account. Try again, or paste your User ID below.";
    case 'not_ready':            return 'The Discord bot is starting up. Try again in a moment.';
    case 'verify_unavailable':   return 'Discord verification is unavailable right now. Try again in a moment.';
    case 'save_failed':
    case 'db_error':             return 'Could not save your Discord link. Try again in a moment.';
    default:                     return 'Could not link Discord. Please try again or paste your User ID below.';
  }
}

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

  // Read OAuth callback result from URL params (?discord_link=success|error&...).
  // The `/auth/discord/callback` route bounces the user back to `/` for the
  // modal flow with these params; surface the outcome as a toast/error and
  // strip the params so a refresh doesn't re-show them.
  //
  // IMPORTANT: This component is mounted globally in App.jsx, so it sees the
  // URL params on **every** route. The /settings/profile DiscordLinkSection
  // owns the callback UI when the user picked `return=settings`, so we MUST
  // bail out on any non-home path — otherwise the modal would race with and
  // strip params before the settings section can read them.
  useEffect(() => {
    if (window.location.pathname !== '/') return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get('discord_link');
    if (!result) return;
    const reason = params.get('reason') || '';
    const username = params.get('username') || '';
    const already = params.get('already') === '1';

    if (result === 'success') {
      clearSkipCount();
      try { sessionStorage.setItem(SESSION_DISMISS_KEY, '1'); } catch {}
      setOpen(false);
      setToast(
        already
          ? 'Your Discord is already linked.'
          : username
            ? `Discord linked to @${username}. Check your DMs for confirmation.`
            : 'Discord linked. Check your DMs for the confirmation message.'
      );
      if (typeof refreshMe === 'function') refreshMe().catch(() => {});
    } else if (result === 'error') {
      setOpen(true);
      setError(oauthErrorMessage(reason));
    }

    params.delete('discord_link');
    params.delete('reason');
    params.delete('username');
    params.delete('already');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);
  }, [refreshMe]);

  const onConnectOAuth = () => {
    window.location.assign('/auth/discord?return=home');
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
      setToast(
        body.alreadyLinked
          ? 'Your Discord is already linked.'
          : body.verified_username
            ? `Discord linked to @${body.verified_username}. Check your DMs for confirmation.`
            : 'Discord linked. Check your DMs for the confirmation message.'
      );
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

            {steamUser?.discord_oauth_enabled && (
              <>
                <button
                  type="button"
                  onClick={onConnectOAuth}
                  disabled={saving}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    width: '100%', padding: '10px 14px', borderRadius: 6,
                    background: '#5865F2', border: '1px solid #4752c4',
                    color: '#fff', fontSize: 14, fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer', marginBottom: 12,
                  }}
                >
                  <span aria-hidden="true">🔗</span> Connect with Discord
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  margin: '0 0 12px', color: 'var(--text-muted)', fontSize: 11,
                }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  or paste your User ID
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
              </>
            )}

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
