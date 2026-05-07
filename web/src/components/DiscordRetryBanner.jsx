import React, { useEffect, useState } from 'react';
import { useSteamAuth } from '../context/SteamAuthContext';

// Task #128 — site-wide banner shown to signed-in users whose Discord
// account is linked but who failed to auto-join the OCE Inhouse server
// (e.g. the bot was missing Manage Roles when they signed up). The OAuth
// access token is single-use and isn't stored, so we can't retry the join
// transparently — clicking *Reconnect with Discord* re-runs the OAuth flow
// and the callback retries `addUserToLeagueGuild`. The pending row is
// cleared automatically on the next successful join.
export default function DiscordRetryBanner() {
  const { steamUser } = useSteamAuth();
  const [pending, setPending] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!steamUser?.accountId) {
      setPending(null);
      return;
    }
    let alive = true;
    fetch('/api/me/discord-autojoin-status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (alive) setPending(d && d.pending ? d : null); })
      .catch(() => { if (alive) setPending(null); });
    return () => { alive = false; };
  }, [steamUser?.accountId]);

  if (!steamUser?.accountId || !pending || dismissed) return null;

  return (
    <div
      role="alert"
      style={{
        background: 'rgba(245, 158, 11, 0.12)',
        borderBottom: '1px solid var(--amber, #f59e0b)',
        color: 'var(--text, #f5efe2)',
        padding: '0.6rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap',
        fontSize: '0.92rem',
      }}
    >
      <span>
        <strong>We couldn't add you to the OCE Inhouse Discord server</strong>
        {' '}— click below to retry now that the bot is back online.
      </span>
      <a
        href="/auth/discord?return=settings"
        style={{
          background: 'var(--amber, #f59e0b)',
          color: '#0d1424',
          padding: '0.35rem 0.85rem',
          borderRadius: 4,
          fontWeight: 600,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Reconnect with Discord
      </a>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          background: 'transparent', border: 'none',
          color: 'var(--text-muted, #c5a975)',
          cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4,
        }}
      >×</button>
    </div>
  );
}
