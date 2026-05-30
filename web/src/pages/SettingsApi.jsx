import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';

const EVENT_DESCRIPTIONS = {
  'match.ended': 'A match was recorded and parsed (legacy event, kept for back-compat).',
  'match.finalized': 'Match parsed with full stats — versioned, stable payload (recommended).',
  'lobby.full': 'An inhouse lobby reached 10 players.',
  'tournament.round_started': 'A new tournament round bracket went live.',
  'coaching.booked': 'A coaching session was booked and paid.',
};

const SCOPE_DESCRIPTIONS = {
  'read': 'Legacy catch-all read (implies every read:* scope).',
  'read:matches': 'List + read match details.',
  'read:players': 'Read player profiles and stats.',
  'read:leaderboard': 'Read MMR + PERF leaderboard.',
  'read:teams': 'List + read teams and members.',
  'write:webhooks': 'Create / delete webhook subscriptions on this account via /v1/webhooks.',
};

const DEFAULT_NEW_SCOPES = ['read:matches', 'read:leaderboard'];

function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

function fmtPrice(cents, currency = 'aud') {
  const n = (Number(cents) || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: (currency || 'aud').toUpperCase() }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

const QUOTA_TIER_LABELS = { boost_2k: '2,000 req/min', boost_10k: '10,000 req/min' };
function quotaTierLabel(id) { return QUOTA_TIER_LABELS[id] || id; }

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
  const [keyScopes, setKeyScopes] = useState(new Set(DEFAULT_NEW_SCOPES));
  const [keyRate, setKeyRate] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [editing, setEditing] = useState(null); // {id, scopes:Set, rate}
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
      const body = {
        label: keyLabel || 'Untitled key',
        scopes: Array.from(keyScopes),
      };
      if (keyRate.trim()) body.rate_per_min = parseInt(keyRate, 10) || null;
      const r = await fetch('/api/me/api-keys', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Failed to create key');
      setNewKey(data);
      setKeyLabel('');
      setKeyScopes(new Set(DEFAULT_NEW_SCOPES));
      setKeyRate('');
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

  const beginEdit = (k) => setEditing({
    id: k.id,
    scopes: new Set(k.scopes || ['read']),
    rate: k.rate_per_min != null ? String(k.rate_per_min) : '',
  });

  const saveEdit = async () => {
    if (!editing) return;
    const body = {
      scopes: Array.from(editing.scopes),
      rate_per_min: editing.rate.trim() ? parseInt(editing.rate, 10) : null,
    };
    const r = await fetch(`/api/me/api-keys/${editing.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d?.error || 'Failed to save');
      return;
    }
    setEditing(null);
    load();
  };

  const buyQuota = async (keyId, tierId) => {
    try {
      const r = await fetch(`/api/me/api-keys/${keyId}/quota-checkout`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: tierId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Failed to start checkout');
      if (data.url) window.location.href = data.url;
    } catch (e) {
      alert(e.message);
    }
  };

  const cancelQuota = async (keyId) => {
    if (!confirm('Cancel this key\u2019s quota bump? Its rate limit will drop back to the tier default at the end of the billing period.')) return;
    try {
      const r = await fetch(`/api/me/api-keys/${keyId}/quota-cancel`, {
        method: 'POST', credentials: 'include',
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Failed to cancel');
      load();
    } catch (e) {
      alert(e.message);
    }
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
  const knownScopes = keysData?.known_scopes || Object.keys(SCOPE_DESCRIPTIONS);
  const quotaTiers = keysData?.quota_tiers || [];
  const quotaPaymentsEnabled = !!keysData?.quota_payments_enabled;
  const usageMonth = keysData?.usage_month || new Date().toISOString().slice(0, 7);
  const tierDefaultPerMin = keysData?.tier_default_per_minute ?? (isPro ? 600 : 60);
  const activeKeys = keys.filter(k => !k.revoked_at);
  const totalMonthUsage = activeKeys.reduce((sum, k) => sum + (Number(k.usage_month) || 0), 0);
  const boostedKeys = activeKeys.filter(k => k.quota_tier).length;
  const subs = webhooksData?.subscriptions || [];
  const deliveries = webhooksData?.deliveries || [];
  const knownEvents = webhooksData?.known_events || Object.keys(EVENT_DESCRIPTIONS);

  const scopeToggle = (set, setter, scope) => (
    <label key={scope} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 10, fontSize: 13 }}>
      <input
        type="checkbox"
        checked={set.has(scope)}
        aria-label={`Scope ${scope}`}
        onChange={(e) => {
          const next = new Set(set);
          if (e.target.checked) next.add(scope); else next.delete(scope);
          setter(next);
        }}
      />
      <code>{scope}</code>
    </label>
  );

  return (
    <div>
      <header style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0 }}>Public API &amp; webhooks</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 6 }}>
          Build stream-deck buttons, Discord bots, leaderboard mirrors and dashboards on top of the
          OCE Inhouse data. <Link to="/developers">Open the developer portal →</Link>
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
          Default rate: {tierDefaultPerMin.toLocaleString()} req/min (set a per-key override below)
          {!isPro && (
            <> · <Link to="/pro">Upgrade to Pro</Link> for higher default quotas and webhooks.</>
          )}
        </div>

        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14,
        }}>
          <div style={{
            flex: 1, minWidth: 160, padding: 12, borderRadius: 8,
            background: 'var(--bg-hover)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Usage this month ({usageMonth})</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {totalMonthUsage.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              requests across {activeKeys.length} active key{activeKeys.length === 1 ? '' : 's'}
            </div>
          </div>
          <div style={{
            flex: 1, minWidth: 160, padding: 12, borderRadius: 8,
            background: 'var(--bg-hover)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Quota bumps active</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {boostedKeys}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {quotaPaymentsEnabled
                ? 'Bump a key\u2019s rate limit from its row below.'
                : 'Paid quota bumps are unavailable on this deployment.'}
            </div>
          </div>
        </div>

        {quotaPaymentsEnabled && quotaTiers.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Need more throughput? Paid quota tiers:{' '}
            {quotaTiers.map((t, i) => (
              <span key={t.id}>
                {i > 0 && ' · '}
                <strong>{t.label}</strong> for {fmtPrice(t.price_cents, t.currency)}/mo
              </span>
            ))}
            . Billed monthly, cancel any time — applies per key.
          </div>
        )}

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
            <div style={{ fontSize: 12, marginTop: 6 }}>
              Scopes: {(newKey.scopes || []).map(s => <code key={s} style={{ marginRight: 4 }}>{s}</code>)}
            </div>
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn" aria-label="Copy new API key" onClick={() => copyToClipboard(newKey.token)}>
                Copy
              </button>{' '}
              <button type="button" className="btn" onClick={() => setNewKey(null)}>
                I've saved it
              </button>
            </div>
          </div>
        )}

        <div style={{
          padding: 12, marginBottom: 14, borderRadius: 8,
          background: 'var(--bg-hover)', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <label style={{ flex: 2, minWidth: 200 }}>
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
            <label style={{ flex: 1, minWidth: 140 }}>
              <span className="visually-hidden">Custom rate per minute</span>
              <input
                type="number"
                min={1}
                max={10000}
                placeholder={`Rate/min (default ${isPro ? 600 : 60})`}
                value={keyRate}
                onChange={(e) => setKeyRate(e.target.value)}
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}
              />
            </label>
          </div>
          <div role="group" aria-label="Scopes for new key" style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Scopes:</div>
            {knownScopes.map(s => scopeToggle(keyScopes, setKeyScopes, s))}
          </div>
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
                <th style={{ padding: 6 }}>Scopes</th>
                <th style={{ padding: 6 }}>Rate/min</th>
                <th style={{ padding: 6 }}>This month</th>
                <th style={{ padding: 6 }}>Quota</th>
                <th style={{ padding: 6 }}>Last used</th>
                <th style={{ padding: 6 }}>Status</th>
                <th style={{ padding: 6 }} />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const isEditing = editing && editing.id === k.id;
                return (
                  <tr key={k.id} style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
                    <td style={{ padding: 6 }}>{k.label || '—'}</td>
                    <td style={{ padding: 6 }}><code>{k.prefix}…</code></td>
                    <td style={{ padding: 6 }}>{k.tier}</td>
                    <td style={{ padding: 6, fontSize: 12 }}>
                      {isEditing ? (
                        <div role="group" aria-label={`Scopes for key ${k.id}`}>
                          {knownScopes.map(s => (
                            <label key={s} style={{ display: 'block', fontSize: 12 }}>
                              <input
                                type="checkbox"
                                checked={editing.scopes.has(s)}
                                aria-label={`Scope ${s}`}
                                onChange={(e) => {
                                  const next = new Set(editing.scopes);
                                  if (e.target.checked) next.add(s); else next.delete(s);
                                  setEditing({ ...editing, scopes: next });
                                }}
                              /> <code>{s}</code>
                            </label>
                          ))}
                        </div>
                      ) : (
                        (k.scopes || []).map(s => <code key={s} style={{ marginRight: 4 }}>{s}</code>)
                      )}
                    </td>
                    <td style={{ padding: 6 }}>
                      {isEditing ? (
                        <input
                          type="number"
                          min={1}
                          max={10000}
                          value={editing.rate}
                          aria-label={`Rate per minute for key ${k.id}`}
                          onChange={(e) => setEditing({ ...editing, rate: e.target.value })}
                          style={{ width: 80, padding: 4 }}
                          placeholder={isPro ? '600' : '60'}
                        />
                      ) : (
                        k.rate_per_min ?? <span style={{ color: 'var(--text-muted)' }}>default</span>
                      )}
                    </td>
                    <td style={{ padding: 6, fontVariantNumeric: 'tabular-nums' }}>
                      {(k.usage_month ?? 0).toLocaleString()}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {(k.effective_per_minute ?? (isPro ? 600 : 60)).toLocaleString()}/min cap
                      </div>
                    </td>
                    <td style={{ padding: 6, fontSize: 12 }}>
                      {k.quota_tier ? (
                        <div>
                          <span style={{ color: 'var(--amber)', fontWeight: 600 }}>
                            {quotaTierLabel(k.quota_tier)}
                          </span>
                          {k.quota_status && k.quota_status !== 'active' && (
                            <span style={{ color: 'var(--rose)', marginLeft: 4 }}>({k.quota_status})</span>
                          )}
                          {!k.revoked_at && (
                            <div style={{ marginTop: 4 }}>
                              <button type="button" className="btn" style={{ fontSize: 11, padding: '2px 6px' }}
                                      aria-label={`Cancel quota bump for key ${k.label || k.id}`}
                                      onClick={() => cancelQuota(k.id)}>Cancel</button>
                            </div>
                          )}
                        </div>
                      ) : k.revoked_at ? (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      ) : !quotaPaymentsEnabled ? (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {quotaTiers.map(t => (
                            <button key={t.id} type="button" className="btn" style={{ fontSize: 11, padding: '2px 6px' }}
                                    aria-label={`Buy ${t.label} quota for key ${k.label || k.id} at ${fmtPrice(t.price_cents, t.currency)} per month`}
                                    onClick={() => buyQuota(k.id, t.id)}>
                              {t.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: 6 }}>{fmtDate(k.last_used_at)}</td>
                    <td style={{ padding: 6 }}>
                      {k.revoked_at
                        ? <span style={{ color: 'var(--text-muted)' }}>revoked</span>
                        : <span style={{ color: 'var(--amber)' }}>active</span>}
                    </td>
                    <td style={{ padding: 6, whiteSpace: 'nowrap' }}>
                      {!k.revoked_at && (
                        isEditing ? (
                          <>
                            <button type="button" className="btn primary" aria-label="Save key changes" onClick={saveEdit}>Save</button>{' '}
                            <button type="button" className="btn" aria-label="Cancel edit" onClick={() => setEditing(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="btn" aria-label={`Edit key ${k.label || k.id}`} onClick={() => beginEdit(k)}>Edit</button>{' '}
                            <button type="button" className="btn" aria-label={`Revoke key ${k.label || k.id}`} onClick={() => revokeKey(k.id)}>Revoke</button>
                          </>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
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
          HMAC-SHA256 — see the <Link to="/developers">developer portal</Link> for the exact verification snippet.
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
                aria-label="Webhook URL"
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
                      aria-label={`Event ${ev}`}
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
                                aria-label={s.active ? 'Pause webhook' : 'Resume webhook'}
                                onClick={() => toggleWebhook(s.id, !s.active)}>
                          {s.active ? 'Pause' : 'Resume'}
                        </button>
                        <button type="button" className="btn" aria-label="Delete webhook" onClick={() => deleteWebhook(s.id)}>
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
