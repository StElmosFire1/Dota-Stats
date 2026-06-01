// Twitch Helix client (app-access-token / client-credentials flow).
//
// Used by the "Live now" hub (full edition) to detect which inhouse players
// are currently streaming. Read-only: we only ever call GET /helix/streams.
// Credentials come from the TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET secrets;
// when either is missing the module degrades gracefully (isConfigured()===false,
// getLiveStreams()==={}) so the rest of the app keeps working.

const fetch = require('node-fetch');

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const HELIX_STREAMS = 'https://api.twitch.tv/helix/streams';
const MAX_LOGINS_PER_CALL = 100; // Twitch hard limit for user_login params
const REQUEST_TIMEOUT_MS = 8000; // bound each call so a hung socket can't stall the poll

// fetch() with an AbortController timeout so the poller never blocks
// indefinitely on a slow/hung Twitch response.
async function fetchT(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

let _token = null;
let _tokenExpiresAt = 0;

function isConfigured() {
  return !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}

// Coerce a user-supplied value into a canonical Twitch login (lower-case,
// [a-z0-9_], 3-25 chars). Accepts a bare login or a full twitch.tv URL.
// Returns null for anything that can't be a valid login.
function normalizeLogin(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/twitch\.tv\/([A-Za-z0-9_]+)/i);
  if (m) s = m[1];
  s = s.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (s.length < 3 || s.length > 25) return null;
  return s;
}

async function getAppToken() {
  const now = Date.now();
  if (_token && now < _tokenExpiresAt - 60_000) return _token;
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) throw new Error('twitch_not_configured');
  const url = `${TOKEN_URL}?client_id=${encodeURIComponent(id)}`
    + `&client_secret=${encodeURIComponent(secret)}`
    + `&grant_type=client_credentials`;
  const r = await fetchT(url, { method: 'POST' });
  if (!r.ok) throw new Error(`twitch_token_http_${r.status}`);
  const j = await r.json();
  if (!j || !j.access_token) throw new Error('twitch_token_missing');
  _token = j.access_token;
  _tokenExpiresAt = now + (Number(j.expires_in) || 3600) * 1000;
  return _token;
}

// Given an array of logins (or URLs), returns a map keyed by canonical login
// containing only the channels that are CURRENTLY LIVE. Channels that are
// offline simply don't appear in the result.
async function getLiveStreams(logins) {
  if (!isConfigured()) return {};
  const clean = [...new Set((logins || []).map(normalizeLogin).filter(Boolean))];
  if (!clean.length) return {};
  const token = await getAppToken();
  const id = process.env.TWITCH_CLIENT_ID;
  const out = {};
  for (let i = 0; i < clean.length; i += MAX_LOGINS_PER_CALL) {
    const chunk = clean.slice(i, i + MAX_LOGINS_PER_CALL);
    const qs = chunk.map((l) => `user_login=${encodeURIComponent(l)}`).join('&');
    const r = await fetchT(`${HELIX_STREAMS}?${qs}`, {
      headers: { 'Client-Id': id, Authorization: `Bearer ${token}` },
    });
    if (r.status === 401) {
      // token went stale early — refresh once and retry this chunk
      _token = null;
      const t2 = await getAppToken();
      const r2 = await fetchT(`${HELIX_STREAMS}?${qs}`, {
        headers: { 'Client-Id': id, Authorization: `Bearer ${t2}` },
      });
      if (!r2.ok) throw new Error(`twitch_streams_http_${r2.status}`);
      collect(await r2.json(), out);
      continue;
    }
    if (!r.ok) throw new Error(`twitch_streams_http_${r.status}`);
    collect(await r.json(), out);
  }
  return out;
}

function collect(json, out) {
  for (const s of (json && json.data) || []) {
    const login = String(s.user_login || '').toLowerCase();
    if (!login) continue;
    out[login] = {
      login,
      userName: s.user_name || s.user_login,
      title: s.title || '',
      gameName: s.game_name || '',
      viewerCount: Number(s.viewer_count) || 0,
      startedAt: s.started_at || null,
      // {width}x{height} placeholders — the client substitutes a real size.
      thumbnailUrl: s.thumbnail_url || '',
      language: s.language || '',
    };
  }
}

module.exports = { isConfigured, getAppToken, getLiveStreams, normalizeLogin };
