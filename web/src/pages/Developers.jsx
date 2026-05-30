import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

// Task #415 — manifest-driven developer portal. Same shape powers the
// human-readable docs table AND the live "Try it" runner so additions only
// need to land here.
const ENDPOINTS = [
  { id: 'status', method: 'GET', path: '/v1/status', auth: 'none',
    desc: 'Service status, current product version, supported events and scopes. No auth.',
    params: [] },
  { id: 'me', method: 'GET', path: '/v1/me', auth: 'key', scope: null,
    desc: 'Inspect the calling API key (label, tier, scopes, rate).',
    params: [] },
  { id: 'matches', method: 'GET', path: '/v1/matches', auth: 'key', scope: 'read:matches',
    desc: 'List recorded matches in reverse-chron order.',
    params: [
      { name: 'limit', type: 'number', default: 50, max: 100 },
      { name: 'offset', type: 'number', default: 0 },
      { name: 'season_id', type: 'number' },
    ] },
  { id: 'match', method: 'GET', path: '/v1/matches/:matchId', auth: 'key', scope: 'read:matches',
    desc: 'Match detail (excludes internal-only fields like replay paths).',
    params: [{ name: 'matchId', in: 'path', type: 'string', required: true }] },
  { id: 'leaderboard', method: 'GET', path: '/v1/leaderboard', auth: 'key', scope: 'read:leaderboard',
    desc: 'Top players by MMR.',
    params: [
      { name: 'limit', type: 'number', default: 50, max: 200 },
      { name: 'season_id', type: 'number' },
    ] },
  { id: 'profile', method: 'GET', path: '/v1/profile/:accountId', auth: 'key', scope: 'read:players',
    desc: 'Player profile: rating, win/loss, PERF.',
    params: [{ name: 'accountId', in: 'path', type: 'string', required: true }] },
  { id: 'teams', method: 'GET', path: '/v1/teams', auth: 'key', scope: 'read:teams',
    desc: 'List active teams with member counts.',
    params: [{ name: 'limit', type: 'number', default: 50, max: 100 }] },
  { id: 'team', method: 'GET', path: '/v1/teams/:id', auth: 'key', scope: 'read:teams',
    desc: 'Team detail including the current roster.',
    params: [{ name: 'id', in: 'path', type: 'number', required: true }] },
  { id: 'inhouse', method: 'GET', path: '/v1/inhouse/status', auth: 'key', scope: null,
    desc: 'Current inhouse session state (FACEIT-style queue).',
    params: [] },
  { id: 'tournaments', method: 'GET', path: '/v1/tournaments', auth: 'key', scope: null,
    desc: 'List tournaments + status.',
    params: [{ name: 'season_id', type: 'number' }] },
  { id: 'tournament', method: 'GET', path: '/v1/tournaments/:id', auth: 'key', scope: null,
    desc: 'Tournament detail + bracket.',
    params: [{ name: 'id', in: 'path', type: 'number', required: true }] },
  { id: 'coaches', method: 'GET', path: '/v1/coaches', auth: 'key', scope: null,
    desc: 'Active coaches accepting bookings.',
    params: [] },
  { id: 'availability', method: 'GET', path: '/v1/coaches/:id/availability', auth: 'key', scope: null,
    desc: 'Recurring availability slots for a coach.',
    params: [{ name: 'id', in: 'path', type: 'number', required: true }] },
  { id: 'webhooks-list', method: 'GET', path: '/v1/webhooks', auth: 'key', scope: 'write:webhooks',
    desc: 'List webhook subscriptions owned by the calling key\'s account. Pro-only — returns 403 pro_required for free-tier keys.',
    params: [] },
  { id: 'webhooks-create', method: 'POST', path: '/v1/webhooks', auth: 'key', scope: 'write:webhooks',
    desc: 'Create a webhook subscription for this account. Pro-only.',
    params: [
      { name: 'url', in: 'body', type: 'string', required: true },
      { name: 'events', in: 'body', type: 'csv', required: true,
        hint: 'Comma-separated, e.g. match.finalized,lobby.full' },
    ] },
];

const SCOPES = [
  { name: 'read', desc: 'Legacy catch-all (implies every read:* scope). Keys created before May 2026 default to this.' },
  { name: 'read:matches', desc: 'List + read matches.' },
  { name: 'read:players', desc: 'Read player profiles + stats.' },
  { name: 'read:leaderboard', desc: 'Read MMR + PERF leaderboard.' },
  { name: 'read:teams', desc: 'List + read teams and members.' },
  { name: 'write:webhooks', desc: 'Manage your account\'s webhook subscriptions via /v1/webhooks.' },
];

const EVENTS = [
  { name: 'match.finalized', desc: 'A recorded match has full parsed stats. Versioned payload — pin against `version: 1`. Recommended for new integrations.' },
  { name: 'match.ended', desc: 'Legacy event from Task #371 — still fires alongside match.finalized.' },
  { name: 'lobby.full', desc: 'Inhouse lobby reached 10 players.' },
  { name: 'tournament.round_started', desc: 'New tournament round bracket was published.' },
  { name: 'coaching.booked', desc: 'A coaching session was booked and paid.' },
];

// Official client libraries (Task #462). The call expression per endpoint id
// drives the "Use the SDK" sample rendered on each endpoint card below.
// Keyed by ENDPOINTS[].id — keep in lockstep when adding endpoints (the
// developerSdkSamples test fails otherwise).
const SDK_CALLS = {
  status:            { js: 'client.status()',                          py: 'client.status()' },
  me:                { js: 'client.me()',                              py: 'client.me()' },
  matches:           { js: 'client.matches({ limit: 50 })',           py: 'client.matches(limit=50)' },
  match:             { js: "client.match('7821345921')",              py: 'client.match("7821345921")' },
  leaderboard:       { js: 'client.leaderboard({ limit: 10 })',       py: 'client.leaderboard(limit=10)' },
  profile:           { js: "client.profile('76561198000000000')",     py: 'client.profile("76561198000000000")' },
  teams:             { js: 'client.teams({ limit: 50 })',             py: 'client.teams(limit=50)' },
  team:              { js: 'client.team(1)',                          py: 'client.team(1)' },
  inhouse:           { js: 'client.inhouseStatus()',                  py: 'client.inhouse_status()' },
  tournaments:       { js: 'client.tournaments()',                    py: 'client.tournaments()' },
  tournament:        { js: 'client.tournament(1)',                    py: 'client.tournament(1)' },
  coaches:           { js: 'client.coaches()',                        py: 'client.coaches()' },
  availability:      { js: 'client.coachAvailability(1)',             py: 'client.coach_availability(1)' },
  'webhooks-list':   { js: 'client.webhooks.list()',                  py: 'client.webhooks.list()' },
  'webhooks-create': {
    js: "client.webhooks.create({ url: 'https://example.com/hook', events: ['match.finalized'] })",
    py: 'client.webhooks.create(url="https://example.com/hook", events=["match.finalized"])',
  },
};

function sdkSamples(endpoint) {
  const call = SDK_CALLS[endpoint.id];
  if (!call) return null;
  const js = `import { OceInhouseClient } from '@oce-inhouse/sdk';
const client = new OceInhouseClient({ apiKey: 'oi_pro_…' });

const data = await ${call.js};`;
  const py = `from oce_inhouse import OceInhouseClient
client = OceInhouseClient(api_key="oi_pro_…")

data = ${call.py}`;
  return { js, py };
}

const Section = ({ id, title, children }) => (
  <section id={id} style={{ marginBottom: 32 }}>
    <h2 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>{title}</h2>
    {children}
  </section>
);

const Code = ({ children }) => (
  <pre style={{
    background: 'var(--ink-navy, #0d1424)', color: 'var(--parchment, #f5efe2)',
    padding: 12, borderRadius: 8, overflowX: 'auto', fontSize: 13,
  }}><code>{children}</code></pre>
);

function fillPath(path, values) {
  return path.replace(/:([a-zA-Z]+)/g, (_, k) => encodeURIComponent(values[k] ?? `:${k}`));
}

function SdkSample({ endpoint }) {
  const samples = sdkSamples(endpoint);
  if (!samples) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Use the SDK</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>TypeScript / Node</div>
      <Code>{samples.js}</Code>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 2px' }}>Python</div>
      <Code>{samples.py}</Code>
    </div>
  );
}

function TryIt({ endpoint }) {
  const [apiKey, setApiKey] = useState(() => {
    try { return localStorage.getItem('oi-dev-api-key') || ''; } catch { return ''; }
  });
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    try { if (apiKey) localStorage.setItem('oi-dev-api-key', apiKey); } catch {}
  }, [apiKey]);

  const pathParams = endpoint.params.filter(p => p.in === 'path');
  const queryParams = endpoint.params.filter(p => !p.in || p.in === 'query');
  const bodyParams = endpoint.params.filter(p => p.in === 'body');

  const builtUrl = useMemo(() => {
    let url = fillPath(endpoint.path, values);
    const qs = queryParams
      .filter(p => values[p.name] !== undefined && values[p.name] !== '')
      .map(p => `${encodeURIComponent(p.name)}=${encodeURIComponent(values[p.name])}`)
      .join('&');
    if (qs) url += `?${qs}`;
    return url;
  }, [endpoint, values, queryParams]);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const headers = {};
      if (endpoint.auth === 'key' && apiKey) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }
      let body;
      if (endpoint.method !== 'GET' && bodyParams.length) {
        const bodyObj = {};
        bodyParams.forEach(p => {
          const v = values[p.name];
          if (v === undefined || v === '') return;
          bodyObj[p.name] = p.type === 'csv'
            ? String(v).split(',').map(x => x.trim()).filter(Boolean)
            : v;
        });
        body = JSON.stringify(bodyObj);
        headers['Content-Type'] = 'application/json';
      }
      const t0 = performance.now();
      const r = await fetch(builtUrl, { method: endpoint.method, headers, body });
      const ms = Math.round(performance.now() - t0);
      const txt = await r.text();
      let parsed = txt;
      try { parsed = JSON.stringify(JSON.parse(txt), null, 2); } catch {}
      setResult({
        status: r.status,
        ok: r.ok,
        ms,
        rateLimit: r.headers.get('X-RateLimit-Limit'),
        rateRemaining: r.headers.get('X-RateLimit-Remaining'),
        body: parsed,
      });
    } catch (e) {
      setResult({ status: 0, ok: false, body: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      padding: 12, marginTop: 8, borderRadius: 8,
      background: 'var(--bg-hover)', border: '1px solid var(--border)', fontSize: 13,
    }}>
      <div style={{ marginBottom: 8 }}>
        <strong>Try it</strong>
        {endpoint.scope && (
          <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
            requires scope <code>{endpoint.scope}</code>
          </span>
        )}
      </div>

      {endpoint.auth === 'key' && (
        <label style={{ display: 'block', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>API key (paste once — stored in your browser):</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="oi_fre_… or oi_pro_…"
            aria-label="API key for try-it runner"
            style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid var(--border)' }}
          />
        </label>
      )}

      {[...pathParams, ...queryParams, ...bodyParams].map(p => (
        <label key={`${p.in || 'q'}-${p.name}`} style={{ display: 'block', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {p.name}{p.required ? ' *' : ''}
            {p.in === 'path' ? ' (path)' : p.in === 'body' ? ' (body)' : ' (query)'}
            {p.hint ? ` — ${p.hint}` : ''}
          </span>
          <input
            type={p.type === 'number' ? 'number' : 'text'}
            value={values[p.name] ?? ''}
            placeholder={p.default != null ? String(p.default) : ''}
            aria-label={`Value for ${p.name}`}
            onChange={(e) => setValues({ ...values, [p.name]: e.target.value })}
            style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid var(--border)' }}
          />
        </label>
      ))}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn primary" onClick={run} disabled={busy}>
          {busy ? 'Sending…' : `Send ${endpoint.method}`}
        </button>
        <code style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--text-muted)' }}>
          {endpoint.method} {builtUrl}
        </code>
      </div>

      {result && (
        <div role="status" aria-live="polite" style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>
            HTTP <strong style={{ color: result.ok ? 'var(--amber)' : 'var(--rose)' }}>{result.status}</strong>
            {result.ms != null && ` · ${result.ms}ms`}
            {result.rateLimit && ` · rate ${result.rateRemaining}/${result.rateLimit}`}
          </div>
          <Code>{result.body}</Code>
        </div>
      )}
    </div>
  );
}

export default function Developers() {
  const [open, setOpen] = useState(null);

  return (
    <div className="container" style={{ maxWidth: 1000, padding: '24px 16px' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>OCE Inhouse — Developer Portal</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Public API v2 — scoped keys, configurable per-key rate limits, signed outbound webhooks,
          and a live runner you can use without leaving the page.
        </p>
        <p style={{ fontSize: 14 }}>
          Manage your keys and subscriptions in <Link to="/settings/api">Settings → API &amp; webhooks</Link>.
          The legacy reference page is still available at <Link to="/api-docs">/api-docs</Link>.
        </p>
      </header>

      <Section id="getting-started" title="Getting started">
        <ol>
          <li>Sign in with Steam and open <Link to="/settings/api">Settings → API &amp; webhooks</Link>.</li>
          <li>Create a key — pick the scopes you actually need (least-privilege is enforced server-side).</li>
          <li>Copy the token (shown <strong>once</strong>) and paste it into the <em>Try it</em> field on any endpoint below.</li>
          <li>Call <code>/v1/*</code> with <code>Authorization: Bearer &lt;key&gt;</code> or <code>X-API-Key: &lt;key&gt;</code>.</li>
        </ol>
        <Code>{`curl https://oceinhouse.gg/v1/leaderboard?limit=10 \\
  -H "Authorization: Bearer oi_fre_XXXXXXXXXXXXXXXXXXXX"`}</Code>
      </Section>

      <Section id="client-libraries" title="Client libraries">
        <p>
          Official thin clients wrap every endpoint below with bearer auth, automatic retry on{' '}
          <code>429</code>, and a signed-webhook verifier. Each endpoint card has a copy-paste{' '}
          <em>Use the SDK</em> sample.
        </p>
        <p style={{ fontSize: 14, marginBottom: 4 }}><strong>TypeScript / Node</strong> (Node 18+):</p>
        <Code>{`npm install @oce-inhouse/sdk`}</Code>
        <p style={{ fontSize: 14, margin: '8px 0 4px' }}><strong>Python</strong> (3.8+, zero dependencies):</p>
        <Code>{`pip install oce-inhouse-sdk`}</Code>
      </Section>

      <Section id="auth-scopes" title="Authentication &amp; scopes">
        <p>Every request needs a key. Each key carries a set of scopes — endpoints check for the
        scope they require and reject with <code>403 insufficient_scope</code> otherwise.</p>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: 6 }}>Scope</th>
              <th style={{ padding: 6 }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {SCOPES.map(s => (
              <tr key={s.name} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 6 }}><code>{s.name}</code></td>
                <td style={{ padding: 6 }}>{s.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="rate-limits" title="Rate limits">
        <p>Defaults:</p>
        <ul>
          <li><strong>Anonymous (no key):</strong> 60 req/min per IP — applies to <code>/v1/status</code> only, so a Pro key can still burst at its full per-key budget from a single integration host.</li>
          <li><strong>Keyed, free tier:</strong> 60 req/min per key, 1,000/day.</li>
          <li><strong>Keyed, Pro tier:</strong> 600 req/min per key, 50,000/day.</li>
        </ul>
        <p>Every key carries an optional <code>rate_per_min</code> override — set it on the key in
        Settings to dial individual integrations up or down (hard-capped at 10,000/min).</p>
        <p>Every response includes <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>,
        <code>X-RateLimit-Tier</code>, <code>X-RateLimit-Daily-Limit</code>, and
        <code>X-RateLimit-Daily-Remaining</code>. Over-limit calls return <code>429 rate_limited</code>.</p>
      </Section>

      <Section id="endpoints" title="Endpoints">
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Click an endpoint to expand the params + live runner.
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {ENDPOINTS.map(e => {
            const isOpen = open === e.id;
            return (
              <li key={e.id} style={{
                marginBottom: 6, borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg-card)',
              }}>
                <button type="button"
                  aria-expanded={isOpen}
                  aria-label={`Toggle ${e.method} ${e.path}`}
                  onClick={() => setOpen(isOpen ? null : e.id)}
                  style={{
                    display: 'flex', width: '100%', gap: 10, alignItems: 'center',
                    padding: 10, background: 'transparent', border: 'none',
                    color: 'inherit', cursor: 'pointer', textAlign: 'left',
                  }}>
                  <span style={{
                    display: 'inline-block', minWidth: 56, textAlign: 'center',
                    fontWeight: 700, fontSize: 12, padding: '2px 6px',
                    borderRadius: 4, background: e.method === 'GET' ? 'var(--accent)' : 'var(--amber)',
                    color: 'var(--ink-navy)',
                  }}>{e.method}</span>
                  <code style={{ flex: 1 }}>{e.path}</code>
                  {e.scope && <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.scope}</code>}
                  <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 14, marginBottom: 8 }}>{e.desc}</div>
                    <SdkSample endpoint={e} />
                    <TryIt endpoint={e} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section id="webhooks" title="Outbound webhooks">
        <p>
          Pro members can subscribe a URL to one or more events. We POST a signed JSON body when the
          event fires. Failed deliveries are retried with exponential backoff for ~7 hours
          (6 attempts: immediate, 30s, 2m, 10m, 1h, 6h).
        </p>
        <table style={{ width: '100%', fontSize: 14 }}>
          <thead><tr style={{ textAlign: 'left' }}><th>Event</th><th>Description</th></tr></thead>
          <tbody>
            {EVENTS.map(e => (
              <tr key={e.name}><td><code>{e.name}</code></td><td>{e.desc}</td></tr>
            ))}
          </tbody>
        </table>

        <h3>Verifying signatures</h3>
        <p>Every request is signed with HMAC-SHA256 of <code>{`<timestamp>.<raw_body>`}</code>:</p>
        <ul>
          <li><code>X-OI-Signature: t=&lt;ms&gt;,v1=&lt;hex&gt;</code></li>
          <li><code>X-OI-Timestamp: &lt;ms&gt;</code></li>
          <li><code>X-OI-Event: &lt;event name&gt;</code></li>
          <li><code>X-OI-Delivery: &lt;numeric delivery id&gt;</code></li>
        </ul>
        <Code>{`const crypto = require('crypto');
function verify(req, secret) {
  const sig = req.headers['x-oi-signature'] || '';
  const m = /t=(\\d+),v1=([0-9a-f]+)/.exec(sig);
  if (!m) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(m[1] + '.' + req.rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(expected));
}`}</Code>
        <p>Reject any request older than ~5 minutes to mitigate replay attacks.</p>

        <h3><code>match.finalized</code> payload (version 1)</h3>
        <Code>{`{
  "version": 1,
  "match_id": 7821345921,
  "radiant_win": true,
  "duration": 2418,
  "season_id": 12,
  "patch": "7.36c",
  "recorded_at": "2026-05-27T09:14:22.000Z",
  "players": [
    {
      "account_id": "76561198000000000",
      "hero_id": 14, "team": "radiant", "slot": 0,
      "kills": 12, "deaths": 4, "assists": 9,
      "last_hits": 281, "denies": 14,
      "gpm": 612, "xpm": 740,
      "hero_damage": 31290, "tower_damage": 4120, "hero_healing": 0,
      "net_worth": 24800, "level": 25,
      "items": [73, 116, 250, 96, 137, 1]
    }
  ]
}`}</Code>
      </Section>

      <Section id="errors" title="Errors">
        <ul>
          <li><code>missing_api_key</code> / <code>invalid_api_key</code> — 401</li>
          <li><code>insufficient_scope</code> — 403 (key lacks the required scope)</li>
          <li><code>pro_required</code> — 403 (webhook management requires a Pro-tier key)</li>
          <li><code>public_api_disabled</code> / <code>public_api_preview</code> — 503</li>
          <li><code>rate_limited</code> — 429 (per-key window exceeded)</li>
          <li><code>ip_rate_limited</code> — 429 (raw-IP anon burst limit)</li>
          <li><code>not_found</code> — 404</li>
        </ul>
      </Section>

      <Section id="changelog" title="Changelog">
        <ul>
          <li><strong>v2 (2026-05)</strong> — scoped keys, per-key rate limits, <code>match.finalized</code> versioned event, <code>/v1/teams</code>, <code>/v1/webhooks</code>, developer portal with live runner. <code>/v1</code> URL is unchanged for back-compat.</li>
          <li><strong>v1 (2026-05)</strong> — initial release: 10 read endpoints + 4 webhook events.</li>
        </ul>
      </Section>
    </div>
  );
}
