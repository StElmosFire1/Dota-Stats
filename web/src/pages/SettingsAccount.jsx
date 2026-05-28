import React, { useEffect, useState, useCallback } from 'react';
import { useSteamAuth } from '../context/SteamAuthContext';
import { getMeDiscordRpc, setMeDiscordRpcOptIn, disconnectMeDiscordRpc } from '../api';

export default function SettingsAccount() {
  const { steamUser } = useSteamAuth() || {};
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  // Task #446 — Discord Rich Presence connection state.
  const [rpc, setRpc] = useState(null);
  const [rpcLoading, setRpcLoading] = useState(true);
  const [rpcBusy, setRpcBusy] = useState(false);
  const [rpcMsg, setRpcMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (alive) { setMe(d); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const reloadRpc = useCallback(async () => {
    setRpcLoading(true);
    try {
      const data = await getMeDiscordRpc();
      setRpc(data);
    } catch (_) {
      setRpc(null);
    } finally {
      setRpcLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!steamUser?.accountId) { setRpcLoading(false); return; }
    reloadRpc();
  }, [steamUser?.accountId, reloadRpc]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dl = params.get('discord_link');
    if (dl === 'success') setMsg(params.get('already') === '1' ? 'Discord already linked.' : 'Discord connected.');
    else if (dl === 'error') setMsg(`Discord link failed: ${params.get('reason') || 'unknown error'}.`);

    const rc = params.get('rpc_connect');
    if (rc === 'success') setRpcMsg('Discord Rich Presence connected.');
    else if (rc === 'error') setRpcMsg(`Rich Presence connect failed: ${params.get('reason') || 'unknown error'}.`);
  }, []);

  if (!steamUser?.accountId) {
    return <div><h2>Linked accounts</h2><p>Sign in with Steam to manage your linked accounts.</p></div>;
  }

  const discordId = me?.discordId || me?.discord_id || null;
  const discordUsername = me?.discordUsername || me?.discord_username || null;

  const onToggleOptIn = async () => {
    if (!rpc?.connected || rpcBusy) return;
    setRpcBusy(true);
    try {
      await setMeDiscordRpcOptIn(!rpc.opted_in);
      await reloadRpc();
    } catch (e) {
      setRpcMsg(`Could not update preference: ${e.message}`);
    } finally {
      setRpcBusy(false);
    }
  };

  const onDisconnect = async () => {
    if (!rpc?.connected || rpcBusy) return;
    if (!window.confirm('Disconnect Discord Rich Presence? You can reconnect anytime.')) return;
    setRpcBusy(true);
    try {
      await disconnectMeDiscordRpc();
      setRpcMsg('Discord Rich Presence disconnected.');
      await reloadRpc();
    } catch (e) {
      setRpcMsg(`Could not disconnect: ${e.message}`);
    } finally {
      setRpcBusy(false);
    }
  };

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

      {/* Task #446 — Discord Rich Presence opt-in card. Requires Discord
          already linked. The pusher worker only publishes when the admin
          feature flag `discord_rich_presence_enabled` is on. */}
      <div style={{
        padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6, background: 'linear-gradient(135deg, #5865F2, #c5a975)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700,
          }} aria-hidden="true">RP</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Discord Rich Presence</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Show what you're doing on OCE Inhouse — queueing, in lobby, in match — on your Discord profile.
            </div>
          </div>
          {rpcLoading ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</span>
          ) : !discordId ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Link Discord first</span>
          ) : rpc?.connected ? (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={rpcBusy}
              className="btn"
              style={{ fontSize: 13 }}
              aria-label="Disconnect Discord Rich Presence"
            >
              Disconnect
            </button>
          ) : (
            <a
              href="/auth/discord-rpc"
              className="btn btn-primary"
              style={{ fontSize: 13 }}
              aria-label="Connect Discord Rich Presence"
            >
              Connect Rich Presence
            </a>
          )}
        </div>

        {rpcMsg && (
          <div role="status" style={{
            margin: '4px 0 10px', padding: '6px 10px',
            background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 6,
            fontSize: 12,
          }}>{rpcMsg}</div>
        )}

        {rpc?.connected && (
          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
              <button
                type="button"
                role="switch"
                aria-checked={!!rpc.opted_in}
                aria-label="Publish my presence to Discord"
                onClick={onToggleOptIn}
                disabled={rpcBusy}
                style={{
                  position: 'relative',
                  width: 38, height: 22, borderRadius: 22,
                  background: rpc.opted_in ? 'var(--accent)' : 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  cursor: rpcBusy ? 'wait' : 'pointer',
                  padding: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 2,
                  left: rpc.opted_in ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#fff', transition: 'left 120ms ease',
                }} aria-hidden="true" />
              </button>
              <span>{rpc.opted_in ? 'Publishing your presence to Discord' : 'Paused (still connected, not publishing)'}</span>
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {rpc.flag_state === 'on'
                ? 'Rich Presence is live for everyone.'
                : 'Rich Presence is currently disabled by the admin. Your opt-in is saved and will go live when the feature is turned on.'}
            </div>
            {rpc.last_state && (
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Last seen state: <code>{rpc.last_state}</code>
                {rpc.last_published_at && (
                  <> · published {new Date(rpc.last_published_at).toLocaleString()}</>
                )}
              </div>
            )}
            {rpc.last_error && rpc.last_error !== 'flag_off' && (
              <div style={{ fontSize: 12, marginTop: 4, color: 'var(--amber)' }}>
                Last error: {rpc.last_error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
