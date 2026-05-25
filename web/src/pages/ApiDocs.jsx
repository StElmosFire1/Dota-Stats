import React from 'react';
import { Link } from 'react-router-dom';

const Section = ({ id, title, children }) => (
  <section id={id} style={{ marginBottom: 28 }}>
    <h2 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>{title}</h2>
    {children}
  </section>
);

const Code = ({ children }) => (
  <pre style={{
    background: 'var(--ink-navy, #0d1424)',
    color: 'var(--parchment, #f5efe2)',
    padding: 12, borderRadius: 8, overflowX: 'auto', fontSize: 13,
  }}><code>{children}</code></pre>
);

const ENDPOINTS = [
  { method: 'GET', path: '/v1/status', desc: 'Service status + flag state. No auth.' },
  { method: 'GET', path: '/v1/me', desc: 'Inspect the API key being used.' },
  { method: 'GET', path: '/v1/matches', desc: 'List recorded matches. Query: limit (≤100), offset, season_id.' },
  { method: 'GET', path: '/v1/matches/:matchId', desc: 'Match detail (excludes internal-only fields).' },
  { method: 'GET', path: '/v1/leaderboard', desc: 'Top players by MMR. Query: limit (≤200), season_id.' },
  { method: 'GET', path: '/v1/profile/:accountId', desc: 'Player summary: rating, win/loss, PERF.' },
  { method: 'GET', path: '/v1/inhouse/status', desc: 'Current inhouse session state (FACEIT-style queue).' },
  { method: 'GET', path: '/v1/tournaments', desc: 'List tournaments + status.' },
  { method: 'GET', path: '/v1/tournaments/:id', desc: 'Tournament detail + bracket.' },
  { method: 'GET', path: '/v1/coaches', desc: 'Active coaches accepting bookings.' },
  { method: 'GET', path: '/v1/coaches/:id/availability', desc: 'Coach availability windows.' },
];

const EVENTS = [
  { name: 'match.ended', desc: 'A match was recorded and parsed. Payload includes the match summary + player slots.' },
  { name: 'lobby.full', desc: 'An inhouse lobby reached 10 players and is ready for the draft phase.' },
  { name: 'tournament.round_started', desc: 'A new tournament round bracket was published.' },
  { name: 'coaching.booked', desc: 'A coaching session was booked and paid.' },
];

export default function ApiDocs() {
  return (
    <div className="container" style={{ maxWidth: 920, padding: '24px 16px' }}>
      <header style={{ marginBottom: 18 }}>
        <h1>OCE Inhouse Public API (v1)</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Build stream-deck buttons, Discord bots in your own server, leaderboard mirrors and
          dashboards on top of the live OCE Inhouse data. The API is read-only today; mutations
          stay behind the website's own auth flows.
        </p>
        <p>
          Manage your keys and webhooks in <Link to="/settings/api">Settings → API &amp; webhooks</Link>.
        </p>
      </header>

      <Section id="auth" title="Authentication">
        <p>Every <code>/v1/*</code> call requires an API key, sent either as a Bearer token or in the <code>X-API-Key</code> header.</p>
        <Code>{`curl https://oceinhouse.gg/v1/leaderboard?limit=10 \\
  -H "Authorization: Bearer oi_fre_XXXXXXXXXXXXXXXXXXXX"`}</Code>
        <p>
          Keys are shown <strong>once</strong> at creation. If lost, revoke and create a new one.
        </p>
      </Section>

      <Section id="ratelimits" title="Rate limits">
        <table style={{ width: '100%', fontSize: 14 }}>
          <thead><tr><th style={{ textAlign: 'left' }}>Tier</th><th style={{ textAlign: 'left' }}>Per minute</th><th style={{ textAlign: 'left' }}>Per day (soft)</th></tr></thead>
          <tbody>
            <tr><td>Free</td><td>30</td><td>1,000</td></tr>
            <tr><td>Pro</td><td>120</td><td>50,000</td></tr>
          </tbody>
        </table>
        <p>Limit headers (<code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>, <code>X-RateLimit-Tier</code>) are returned on every response. Over-limit calls get HTTP 429 with <code>{`{"error":"rate_limited"}`}</code>.</p>
      </Section>

      <Section id="endpoints" title="Endpoints">
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: 6 }}>Method</th>
              <th style={{ padding: 6 }}>Path</th>
              <th style={{ padding: 6 }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {ENDPOINTS.map(e => (
              <tr key={e.path} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 6 }}><code>{e.method}</code></td>
                <td style={{ padding: 6 }}><code>{e.path}</code></td>
                <td style={{ padding: 6 }}>{e.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="example" title="Example: top 5 leaderboard">
        <Code>{`curl -s https://oceinhouse.gg/v1/leaderboard?limit=5 \\
  -H "Authorization: Bearer $OI_API_KEY" | jq

{
  "leaderboard": [
    { "account_id": "12345", "display_name": "Puppey",  "mmr": 2814, "wins": 47, "losses": 19, "games": 66 },
    ...
  ],
  "season_id": null,
  "limit": 5
}`}</Code>
      </Section>

      <Section id="webhooks" title="Outbound webhooks (Pro)">
        <p>
          Pro members can subscribe a URL to one or more events. We POST a JSON body whenever
          the event fires. Failed deliveries are retried with exponential backoff for ~7 hours
          (6 attempts: immediate, 30s, 2m, 10m, 1h, 6h).
        </p>
        <table style={{ width: '100%', fontSize: 14 }}>
          <thead>
            <tr><th style={{ textAlign: 'left' }}>Event</th><th style={{ textAlign: 'left' }}>Description</th></tr>
          </thead>
          <tbody>
            {EVENTS.map(e => (
              <tr key={e.name}><td><code>{e.name}</code></td><td>{e.desc}</td></tr>
            ))}
          </tbody>
        </table>

        <h3>Verifying signatures</h3>
        <p>
          We sign every request with an HMAC-SHA256 of <code>{`<timestamp>.<raw_body>`}</code> using
          your webhook's signing secret. Headers sent:
        </p>
        <ul>
          <li><code>X-OI-Signature: t=&lt;ms&gt;,v1=&lt;hex&gt;</code></li>
          <li><code>X-OI-Timestamp: &lt;ms&gt;</code></li>
          <li><code>X-OI-Event: &lt;event name&gt;</code></li>
          <li><code>X-OI-Delivery: &lt;numeric delivery id&gt;</code></li>
        </ul>
        <Code>{`// Node.js verification
const crypto = require('crypto');
function verify(req, secret) {
  const sig = req.headers['x-oi-signature'] || '';
  const m = /t=(\\d+),v1=([0-9a-f]+)/.exec(sig);
  if (!m) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(m[1] + '.' + req.rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(expected));
}`}</Code>
        <p>Reject any request older than ~5 minutes to mitigate replay attacks.</p>
      </Section>

      <Section id="errors" title="Errors">
        <p>All errors are JSON of the form <code>{`{ "error": "<code>", "message": "..." }`}</code>:</p>
        <ul>
          <li><code>missing_api_key</code> / <code>invalid_api_key</code> — 401</li>
          <li><code>public_api_disabled</code> / <code>public_api_preview</code> — 503</li>
          <li><code>rate_limited</code> — 429 (per-key window exceeded)</li>
          <li><code>ip_rate_limited</code> — 429 (raw-IP burst limit)</li>
          <li><code>not_found</code> — 404</li>
        </ul>
      </Section>

      <Section id="changelog" title="Changelog">
        <ul>
          <li><strong>v1 (2026-05)</strong> — initial release: 10 read endpoints + 4 webhook events. Behind <code>public_api</code> feature flag.</li>
        </ul>
      </Section>
    </div>
  );
}
