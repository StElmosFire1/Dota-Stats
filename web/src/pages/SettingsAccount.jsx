import React, { useEffect, useState } from 'react';
import { useSteamAuth } from '../context/SteamAuthContext';

export default function SettingsAccount() {
  const { steamUser } = useSteamAuth() || {};
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (alive) { setMe(d); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dl = params.get('discord_link');
    if (!dl) return;
    if (dl === 'success') setMsg(params.get('already') === '1' ? 'Discord already linked.' : 'Discord connected.');
    else if (dl === 'error') setMsg(`Discord link failed: ${params.get('reason') || 'unknown error'}.`);
  }, []);

  if (!steamUser?.accountId) {
    return <div><h2>Linked accounts</h2><p>Sign in with Steam to manage your linked accounts.</p></div>;
  }

  const discordId = me?.discordId || me?.discord_id || null;
  const discordUsername = me?.discordUsername || me?.discord_username || null;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Linked accounts</h2>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Your Steam sign-in identifies you across the site. Linking Discord lets the bot DM you with match summaries, MVP prompts, and lobby alerts.
      </p>

      {msg && (
        <div role="status" style={{
          margin: '12px 0', padding: '8px 12px',
          background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8,
          fontSize: 13,
        }}>{msg}</div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, marginBottom: 10,
      }}>
        <img src="https://store.steampowered.com/favicon.ico" alt="" style={{ width: 32, height: 32 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Steam</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {steamUser?.displayName || `Player ${steamUser?.accountId}`} ({steamUser?.steamId64 || steamUser?.accountId})
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 10px',
          borderRadius: 20, background: 'rgba(34,197,94,0.15)', color: '#22c55e',
          border: '1px solid rgba(34,197,94,0.3)',
        }}>✓ Linked</span>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, marginBottom: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 6, background: '#5865F2',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700,
        }} aria-hidden="true">D</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Discord</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {loading ? 'Loading\u2026' : discordId
              ? `${discordUsername ? discordUsername + ' · ' : ''}${discordId}`
              : 'Not linked yet'}
          </div>
        </div>
        {discordId ? (
          <a href="/auth/discord?return=settings" className="btn" style={{ fontSize: 13 }}>
            Reconnect
          </a>
        ) : (
          <a href="/auth/discord?return=settings" className="btn btn-primary" style={{ fontSize: 13 }}>
            Connect Discord
          </a>
        )}
      </div>
    </div>
  );
}
