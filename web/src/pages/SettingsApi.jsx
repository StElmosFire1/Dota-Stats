import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';

const EVENT_DESCRIPTIONS = {
  'match.ended': 'A match was recorded and parsed.',
  'lobby.full': 'An inhouse lobby reached 10 players.',
  'tournament.round_started': 'A new tournament round bracket went live.',
  'coaching.booked': 'A coaching session was booked and paid.',
};

function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

function copyToClipboard(value) {
  try {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(value).catch(() => {});
    } else {
      const t = document.createElement('textarea');
      t.value = value;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      document.body.removeChild(t);
    }
  } catch {}
}

export default function SettingsApi() {
  const [keysData, setKeysData] = useState(null);
  const [webhooksData, setWebhooksData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newKey, setNewKey] = useState(null);
  const [keyLabel, setKeyLabel] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [whUrl, setWhUrl] = useState('');
  const [whEvents, setWhEvents] = useState(new Set());
  const [creatingWh, setCreatingWh] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kRes, wRes] = await Promise.all([
        fetch('/api/me/api-keys', { credentials: 'include' }),
        fetch('/api/me/webhooks', { credentials: 'include' }),
      ]);
      if (kRes.ok) setKeysData(await kRes.json());
      if (wRes.ok) setWebhooksData(await wRes.json());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createKey = async () => {
    setCreatingKey(true);
    try {
      const r = await fetch('/api/me/api-keys', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: keyLabel || 'Untitled key' }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Failed to create key');
      setNewKey(data);
      setKeyLabel('');
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setCreatingKey(false);
    }
  };

  const revokeKey = async (id) => {
    if (!confirm('Revoke this key? Any apps using it will stop working immediately.')) return;
    const r = await fetch(`/api/me/api-keys/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d?.error || 'Failed to revoke');
      return;
    }
    load();
  };

  const createWebhook = async () => {
    setCreatingWh(true);
    try {
      const events = Array.from(whEvents);
      if (!events.length) throw new Error('Select at least one event.');
      const r = await fetch('/api/me/webhooks', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: whUrl.trim(), events }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Failed to create webhook');
      setWhUrl('');
      setWhEvents(new Set());
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setCreatingWh(false);
    }
  };

  const toggleWebhook = async (id, active) => {
    await fetch(`/api/me/webhooks/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    load();
  };

  const deleteWebhook = async (id) => {
    if (!confirm('Delete this webhook? Past delivery logs will also be removed.')) return;
    await fetch(`/api/me/webhooks/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  if (loading) return <div className="loading" style={{ padding: 32 }}>Loading…</div>;
  if (error) return <div style={{ padding: 16, color: 'var(--rose)' }}>Error: {error}</div>;

  const state = keysData?.public_api_state || 'off';
  const isPro = !!keysData?.is_pro;
  const keys = keysData?.keys || [];
  const subs = webhooksData?.subscriptions || [];
  const deliveries = webhooksData?.deliveries || [];
  const knownEvents = webhooksData?.known_events || Object.keys(EVENT_DESCRIPTIONS);

  return (
    <div>
      <header style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0 }}>Public API &amp; webhooks</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 6 }}>
          Build stream-deck buttons, Discord bots, leaderboard mirrors and dashboards on top of the
          OCE Inhouse data. <Link to="/api-docs">Read the docs →</Link>
        </p>
        {state !== 'on' && (
          <div style={{
            padding: 10, marginTop: 8, borderRadius: 8,
            background: 'var(--bg-hover)', border: '1px solid var(--border)',
            fontSize: 13, color: 'var(--text-secondary)',
          }}>
            {state === 'preview'
              ? 'Public API is in preview. Only keys created by site admins can call /v1 right now — but you can already create keys here ready for launch.'
              : 'Public API is disabled on this deployment.'}
          </div>
        )}
      </header>

      <section style={{
        padding: 16, marginBottom: 18,
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      }}>
        <h3 style={{ marginTop: 0 }}>API keys</h3>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          Tier: <strong>{isPro ? 'Pro' : 'Free'}</strong>
          {' · '}
          {isPro ? '120 req/min · 50,000 req/day' : '30 req/min · 1,000 req/day'}
          {!isPro && (
            <> · <Link to="/pro">Upgrade to Pro</Link> for higher quotas and webhooks.</>
          )}
        </div>

        {newKey && (
          <div role="alert" aria-label="New API key created" style={{
            padding: 12, marginBottom: 12, borderRadius: 8,
            background: 'var(--amber)', color: 'var(--ink-navy)',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              Your new API key — copy it now. We won't show it again.
            </div>
            <code style={{
              display: 'block', padding: 8, background: 'rgba(0,0,0,0.15)',
              borderRadius: 4, fontSize: 13, wordBreak: 'break-all',
            }}>{newKey.token}</code>
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn" onClick={() => copyToClipboard(newKey.token)}>
                Copy
              </button>{' '}
              <button type="button" className="btn" onClick={() => setNewKey(null)}>
                I've saved it
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 220 }}>
            <span className="visually-hidden">Key label</span>
            <input
              type="text"
              placeholder="Key label (e.g. Stream Deck)"
              value={keyLabel}
              onChange={(e) => setKeyLabel(e.target.value)}
              maxLength={80}
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}
            />
          </label>
          <button type="button" className="btn primary" onClick={createKey} disabled={creatingKey}>
            {creatingKey ? 'Creating…' : 'Create key'}
          </button>
        </div>

        {keys.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No keys yet.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}>
                <th style={{ padding: 6 }}>Label</th>
                <th style={{ padding: 6 }}>Prefix</th>
                <th style={{ padding: 6 }}>Tier</th>
                <th style={{ padding: 6 }}>Usage</th>
                <th style={{ padding: 6 }}>Last used</th>
                <th style={{ padding: 6 }}>Status</th>
                <th style={{ padding: 6 }} />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 6 }}>{k.label || '—'}</td>
                  <td style={{ padding: 6 }}><code>{k.prefix}…</code></td>
                  <td style={{ padding: 6 }}>{k.tier}</td>
                  <td style={{ padding: 6, fontVariantNumeric: 'tabular-nums' }}>{k.usage_count}</td>
                  <td style={{ padding: 6 }}>{fmtDate(k.last_used_at)}</td>
                  <td style={{ padding: 6 }}>
                    {k.revoked_at
                      ? <span style={{ color: 'var(--text-muted)' }}>revoked</span>
                      : <span style={{ color: 'var(--amber)' }}>active</span>}
                  </td>
                  <td style={{ padding: 6 }}>
                    {!k.revoked_at && (
                      <button type="button" className="btn" onClick={() => revokeKey(k.id)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={{
        padding: 16,
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      }}>
        <h3 style={{ marginTop: 0 }}>
          Outbound webhooks {!isPro && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>(Pro)</span>}
        </h3>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          We send a signed POST to your URL when a subscribed event happens. Signatures use
          HMAC-SHA256 — see <Link to="/api-docs">/api-docs</Link> for the exact verification snippet.
        </div>

        {!isPro ? (
          <div style={{
            padding: 12, borderRadius: 8,
            background: 'var(--bg-hover)', border: '1px solid var(--border)',
          }}>
            Webhooks are a Pro perk. <Link to="/pro">Upgrade to Pro</Link> to send realtime events
            to your own services.
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              <input
                type="url"
                placeholder="https://your-service.example/oi-webhook"
                value={whUrl}
                onChange={(e) => setWhUrl(e.target.value)}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}
              />
              <div role="group" aria-label="Events">
                {knownEvents.map((ev) => (
                  <label key={ev} style={{ marginRight: 12, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={whEvents.has(ev)}
                      onChange={(e) => {
                        const next = new Set(whEvents);
                        if (e.target.checked) next.add(ev); else next.delete(ev);
                        setWhEvents(next);
                      }}
                    />{' '}
                    <code>{ev}</code>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                      {EVENT_DESCRIPTIONS[ev] ? `— ${EVENT_DESCRIPTIONS[ev]}` : ''}
                    </span>
                  </label>
                ))}
              </div>
              <button type="button" className="btn primary" onClick={createWebhook} disabled={creatingWh}>
                {creatingWh ? 'Creating…' : 'Add webhook'}
              </button>
            </div>

            {subs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No webhooks yet.</div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {subs.map((s) => (
                  <li key={s.id} style={{
                    padding: 12, marginBottom: 8, borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg-hover)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{s.url}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                          Events: {(s.events || []).map(e => <code key={e} style={{ marginRight: 6 }}>{e}</code>)}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                          Signing secret: <code>{s.secret}</code>{' '}
                          <button type="button" className="btn" aria-label="Copy secret"
                                  onClick={() => copyToClipboard(s.secret)}>Copy</button>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                          Last delivery: {fmtDate(s.last_delivery_at)}
                          {s.last_delivery_status != null && ` · HTTP ${s.last_delivery_status}`}
                          {s.last_delivery_error && (
                            <span style={{ color: 'var(--rose)' }}> · {s.last_delivery_error}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <button type="button" className="btn"
                                aria-pressed={s.active}
                                onClick={() => toggleWebhook(s.id, !s.active)}>
                          {s.active ? 'Pause' : 'Resume'}
                        </button>
                        <button type="button" className="btn" onClick={() => deleteWebhook(s.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {deliveries.length > 0 && (
              <details style={{ marginTop: 14 }}>
                <summary style={{ cursor: 'pointer' }}>Recent deliveries ({deliveries.length})</summary>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 8 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: 4 }}>Event</th>
                      <th style={{ padding: 4 }}>Status</th>
                      <th style={{ padding: 4 }}>Attempts</th>
                      <th style={{ padding: 4 }}>HTTP</th>
                      <th style={{ padding: 4 }}>When</th>
                      <th style={{ padding: 4 }}>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((d) => (
                      <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: 4 }}><code>{d.event}</code></td>
                        <td style={{ padding: 4 }}>{d.status}</td>
                        <td style={{ padding: 4 }}>{d.attempts}</td>
                        <td style={{ padding: 4 }}>{d.last_status_code ?? '—'}</td>
                        <td style={{ padding: 4 }}>{fmtDate(d.created_at)}</td>
                        <td style={{ padding: 4, color: d.last_error ? 'var(--rose)' : 'inherit' }}>
                          {d.last_error || ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </>
        )}
      </section>
    </div>
  );
}
