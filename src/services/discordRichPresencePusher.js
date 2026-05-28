// Task #446 — Discord Rich Presence pusher worker.
//
// Walks `discord_rpc_connections` on a periodic tick, computes each opted-in
// user's current site presence via presenceService, and (when the admin
// feature flag `discord_rich_presence_enabled` is on) publishes the activity
// to Discord via the `users/@me/activities` endpoint, authenticated with the
// per-user OAuth token captured during the `?rpc=1` connect flow.
//
// Design choices:
//  - Tick-based (default 30s) + event-driven (subscribes to presenceService
//    `change` events for instant updates when someone enters a lobby).
//  - Per-user "last published state" dedup so we don't spam Discord every
//    tick when nothing has changed. Stored in-memory on the worker and
//    mirrored to `discord_rpc_connections.last_state` for the admin table.
//  - Default OFF: when the admin flag isn't `on` (or `preview`), the worker
//    still computes intended state and updates `last_state` for the admin
//    table, but does NOT actually call Discord. This keeps the backend
//    "built and ready" per the task contract while flag-gating real I/O.
//  - Graceful degradation: any per-user failure is logged + persisted to
//    `last_error` and never crashes the tick.
//
// NB: Discord's `rpc.activities.write` scope is application-whitelisted by
// Discord; for non-whitelisted apps the publish will 403. The worker handles
// that cleanly by recording the error and continuing. The opt-in card + admin
// flag + status table all keep functioning regardless.

const presenceService = require('./presenceService');
const db = require('../db');

const TICK_MS = parseInt(process.env.DISCORD_RPC_TICK_MS, 10) || 30_000;
const DISCORD_API = 'https://discord.com/api/v10';
const APP_ID = process.env.DISCORD_CLIENT_ID || null;

const _lastPublishedState = new Map(); // account_id -> JSON string of last published payload
let _flagCache = { state: 'off', fetchedAt: 0 };
const FLAG_CACHE_MS = 10_000;

async function _getFlagState() {
  const now = Date.now();
  if (now - _flagCache.fetchedAt < FLAG_CACHE_MS) return _flagCache.state;
  try {
    const flag = await db.getFeatureFlag('discord_rich_presence_enabled');
    _flagCache = { state: flag?.state || 'off', fetchedAt: now };
  } catch (_) {
    _flagCache = { state: 'off', fetchedAt: now };
  }
  return _flagCache.state;
}

// Map presenceService status → Discord activity payload.
// Discord activity types: 0=Playing, 2=Listening, 3=Watching, 5=Competing.
function _buildActivityPayload(presence) {
  if (!presence || presence.status === 'offline') return null;
  const base = {
    name: 'OCE Inhouse',
    type: 0, // Playing
    application_id: APP_ID,
  };
  switch (presence.status) {
    case 'in_game':
      return {
        ...base,
        details: presence.hero ? `In match as ${presence.hero}` : 'In match',
        state: presence.match_id ? `Match ${presence.match_id}` : 'Live match',
      };
    case 'in_lobby':
      return { ...base, details: 'In an inhouse lobby', state: 'Waiting to start' };
    case 'in_queue':
      return { ...base, details: 'Queued for inhouse', state: 'Looking for game' };
    case 'in_voice':
      return { ...base, details: 'On voice', state: 'In Discord voice' };
    case 'online':
      return { ...base, details: 'Browsing OCE Inhouse', state: 'Online' };
    default:
      return null;
  }
}

async function _publishToDiscord(conn, payload) {
  if (!conn.access_token) {
    throw new Error('no access_token on connection');
  }
  const body = { activities: payload ? [payload] : [] };
  const fetchFn = global.fetch || (await import('node-fetch')).default;
  const r = await fetchFn(`${DISCORD_API}/users/@me/activities`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    const err = new Error(`Discord ${r.status}: ${text.slice(0, 200)}`);
    err.status = r.status;
    throw err;
  }
  return true;
}

async function _publishOne(conn, { flagOn }) {
  const accountId = conn.account_id;
  let presence;
  try {
    presence = await presenceService.getPlayerPresence(accountId);
  } catch (_) {
    presence = { status: 'offline' };
  }
  const payload = _buildActivityPayload(presence);
  const stateKey = JSON.stringify({ s: presence?.status || 'offline', p: payload });
  const prev = _lastPublishedState.get(accountId);
  if (prev === stateKey) return { changed: false };

  if (!flagOn) {
    // Flag off — still update the bookkeeping so admins can see what WOULD
    // have been published, but never make the API call.
    _lastPublishedState.set(accountId, stateKey);
    await db.recordDiscordRpcPublish(accountId, {
      state: presence?.status || 'offline',
      ok: false,
      error: 'flag_off',
    }).catch(() => {});
    return { changed: true, skipped: true };
  }

  try {
    await _publishToDiscord(conn, payload);
    _lastPublishedState.set(accountId, stateKey);
    await db.recordDiscordRpcPublish(accountId, {
      state: presence?.status || 'offline',
      ok: true,
      error: null,
    }).catch(() => {});
    return { changed: true, published: true };
  } catch (err) {
    await db.recordDiscordRpcPublish(accountId, {
      state: presence?.status || 'offline',
      ok: false,
      error: (err.message || String(err)).slice(0, 500),
    }).catch(() => {});
    return { changed: true, error: err.message };
  }
}

let _tickInFlight = false;
async function tick() {
  if (_tickInFlight) return;
  _tickInFlight = true;
  try {
    const state = await _getFlagState();
    const flagOn = state === 'on';
    const conns = await db.listOptedInDiscordRpcConnections().catch(() => []);
    if (!conns.length) return;
    for (const c of conns) {
      try { await _publishOne(c, { flagOn }); } catch (_) {}
    }
  } catch (e) {
    console.warn('[DiscordRPC] tick error:', e.message);
  } finally {
    _tickInFlight = false;
  }
}

let _started = false;
let _timer = null;
function start() {
  if (_started) return;
  _started = true;
  // First tick 15s after start so DB init + bot connect have settled.
  setTimeout(() => { tick().catch(() => {}); }, 15_000).unref();
  _timer = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
  _timer.unref();

  // Event-driven nudge: when a presence change comes in, run a tick soon so
  // we don't wait the full interval for an "entered lobby" update to land.
  // Debounced to coalesce bursts (e.g. all 10 players entering a lobby).
  let _pending = null;
  presenceService.events.on('change', () => {
    if (_pending) return;
    _pending = setTimeout(() => {
      _pending = null;
      tick().catch(() => {});
    }, 2000);
    _pending.unref();
  });

  console.log(`[DiscordRPC] pusher started (tick=${TICK_MS}ms, app_id=${APP_ID ? 'set' : 'unset'})`);
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  _started = false;
}

// Surfaces both the cached flag state and the in-flight bookkeeping so
// the admin status route can show "what the worker thinks right now".
function getStatus() {
  return {
    started: _started,
    flag_state: _flagCache.state,
    flag_cached_at: _flagCache.fetchedAt || null,
    tick_ms: TICK_MS,
    tracked_users: _lastPublishedState.size,
    app_id_configured: !!APP_ID,
  };
}

module.exports = { start, stop, tick, getStatus, _buildActivityPayload };
