const BASE = '/api';

// ── Superuser auto-recovery (Task #91) ──────────────────────────────────────
// All admin/superuser-gated calls funnel through superuserFetch() so a
// dropped session (HTTP 401, or 403 with the literal `session` sentinel) can
// transparently re-prompt the operator via SuperuserContext + SuperuserModal,
// retry the original request once on success, and otherwise surface a
// clear "session expired" error to the caller. SuperuserContext registers
// its handler at mount via setSuperuserReauthHandler().
let _superuserReauthHandler = null;
export function setSuperuserReauthHandler(fn) {
  _superuserReauthHandler = typeof fn === 'function' ? fn : null;
}

function _superuserHeaderName(headers) {
  if (!headers) return null;
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === 'x-superuser-key') return k;
  }
  return null;
}

// Centralised wrapper for any admin/superuser-gated request. Mirrors the
// ergonomics of the inline `fetch + json + throw` pattern used throughout
// this file but adds the auto-recovery loop. Pass a string body (already
// JSON-encoded) or omit the body entirely; callers that send FormData should
// not use this helper.
export async function superuserFetch(url, options = {}) {
  const headerName = _superuserHeaderName(options.headers);
  // Accept either a path like '/admin/foo' or an already-prefixed BASE + path
  // so callers refactored from `fetch(BASE + '/x', …)` don't have to drop the
  // BASE concatenation.
  const fullUrl = url.startsWith(BASE) || /^https?:/i.test(url) ? url : BASE + url;
  const doFetch = (extraInit = {}) => fetch(fullUrl, {
    credentials: 'same-origin',
    ...options,
    ...extraInit,
    headers: { ...(options.headers || {}), ...(extraInit.headers || {}) },
  });

  let res = await doFetch();
  // 401 = browser session expired (server returns it for missing key OR the
  // `session` sentinel header without a valid cookie). 403 is treated the
  // same way only when we're using the session sentinel — a wrong literal
  // header from a script should not trigger a UI re-prompt.
  const looksLikeSessionDrop =
    res.status === 401 ||
    (res.status === 403 && headerName && options.headers[headerName] === 'session');
  if (looksLikeSessionDrop && _superuserReauthHandler) {
    let ok = false;
    try { ok = await _superuserReauthHandler(); } catch (_) { ok = false; }
    if (ok) res = await doFetch();
  }
  return res;
}

// JSON convenience wrapper: parses the response, surfaces a friendly
// "session expired" message when re-auth was declined, and rethrows the
// server's `error` field for any other failure.
export async function superuserJson(url, {
  method = 'GET',
  body,
  superuserKey,
  headers = {},
} = {}) {
  const finalHeaders = { ...headers };
  if (superuserKey) finalHeaders['x-superuser-key'] = superuserKey;
  let payload;
  if (body !== undefined && body !== null) {
    if (typeof body === 'string' || body instanceof FormData) {
      payload = body;
    } else {
      payload = JSON.stringify(body);
      if (!_findHeader(finalHeaders, 'content-type')) {
        finalHeaders['Content-Type'] = 'application/json';
      }
    }
  }
  const res = await superuserFetch(url, { method, headers: finalHeaders, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(data.error || 'Superuser session expired — please log in again.');
    }
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

// Task #439 — Match Insights v2 helpers (admin-only).
export async function getMatchInsights(superuserKey, matchId) {
  return superuserJson(`/admin/match-insights/${encodeURIComponent(matchId)}`, { superuserKey });
}
export async function startMatchInsightsBackfill(superuserKey, limit = 200) {
  return superuserJson('/admin/match-insights/backfill', {
    method: 'POST', superuserKey, body: { limit },
  });
}
export async function getMatchInsightsBackfillStatus(superuserKey) {
  return superuserJson('/admin/match-insights/backfill/status', { superuserKey });
}
export function matchInsightsWardHeatmapUrl(superuserKey, matchId) {
  const q = new URLSearchParams({ superuser_key: superuserKey || '' });
  return `/api/admin/match-insights/${encodeURIComponent(matchId)}/ward-heatmap.png?${q.toString()}`;
}

// Task #441 — Weekly Rivals.
export async function getMyRival() {
  const res = await fetch(BASE + '/me/rival', { credentials: 'same-origin' });
  if (!res.ok) return { rival: null };
  return res.json();
}
export async function getAdminRivals(superuserKey, weekStart = null) {
  const qs = weekStart ? `?week_start=${encodeURIComponent(weekStart)}` : '';
  return superuserJson(`/admin/rivals${qs}`, { superuserKey });
}
export async function regenerateRivals(superuserKey, force = false) {
  return superuserJson('/admin/rivals/regenerate', {
    method: 'POST', superuserKey, body: { force },
  });
}
export async function repairRival(superuserKey, accountId) {
  return superuserJson('/admin/rivals/repair', {
    method: 'POST', superuserKey, body: { account_id: accountId },
  });
}
export async function setRivalExempt(superuserKey, accountId, exempt) {
  return superuserJson('/admin/rivals/exempt', {
    method: 'POST', superuserKey, body: { account_id: accountId, exempt: !!exempt },
  });
}

// ── Task #664 — Lootbox & collection (full edition only) ────────────────────
// Published odds come from GET /lootbox/catalog (the server catalog is the
// single source of truth — the UI never hardcodes drop rates).
export async function getLootboxCatalog() {
  const res = await fetch(BASE + '/lootbox/catalog', { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed to load lootbox catalog');
  return res.json();
}
export async function getLootboxMe() {
  const res = await fetch(BASE + '/lootbox/me', { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed to load lootbox status');
  return res.json();
}
export async function getLootboxCollection() {
  const res = await fetch(BASE + '/lootbox/collection', { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed to load collection');
  return res.json();
}
async function _lootboxPost(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Request failed');
  return data;
}
export async function openLootbox(boxId) {
  return _lootboxPost('/lootbox/open', { boxId });
}
export async function claimFreeLootbox() {
  return _lootboxPost('/lootbox/free', {});
}
export async function redeemWildcard(sku) {
  return _lootboxPost('/lootbox/wildcard/redeem', { sku });
}
export async function equipCosmetic(kind, value) {
  return _lootboxPost('/lootbox/equip', { kind, value });
}

// Task #492 — AI agent traffic report (superuser).
export async function getAgentTrafficReport(superuserKey, days = 7) {
  const qs = days ? `?days=${encodeURIComponent(days)}` : '';
  return superuserJson(`/admin/agent-traffic-report${qs}`, { superuserKey });
}

// Task #491 — Brand-asset hotlink report (superuser).
export async function getAssetHotlinkReport(superuserKey, days = 7) {
  const qs = days ? `?days=${encodeURIComponent(days)}` : '';
  return superuserJson(`/admin/asset-hotlink-report${qs}`, { superuserKey });
}

// Admin Twitch links — list and set/clear a player's linked channel (superuser).
export async function getTwitchLinks(superuserKey) {
  return superuserJson('/admin/twitch/links', { superuserKey });
}
export async function setTwitchLink(accountId, twitchLogin, superuserKey) {
  return superuserJson('/admin/twitch/link', {
    method: 'POST',
    body: { account_id: accountId, twitch_login: twitchLogin },
    superuserKey,
  });
}

// Task #497 — Lockdown gate runtime toggle (superuser).
export async function getLockdownState(superuserKey) {
  return superuserJson('/admin/lockdown', { superuserKey });
}
// Task #498 — Lockdown access log (who tried to reach the site while gated).
export async function getLockdownAttempts(superuserKey, days = 7) {
  const qs = days ? `?days=${encodeURIComponent(days)}` : '';
  return superuserJson(`/admin/lockdown-attempts${qs}`, { superuserKey });
}
export async function setLockdownState(superuserKey, enabled) {
  return superuserJson('/admin/lockdown', {
    superuserKey,
    method: 'PUT',
    body: { enabled: !!enabled },
  });
}
// Task #507 — historical audit trail of lockdown/unlock flips.
export async function getLockdownAudit(superuserKey, limit = 20) {
  const qs = limit ? `?limit=${encodeURIComponent(limit)}` : '';
  return superuserJson(`/admin/lockdown-audit${qs}`, { superuserKey });
}

// Task #425 — Feature health dashboard helpers.
export async function getFeatureHealth(superuserKey) {
  return superuserJson('/admin/feature-health', { superuserKey });
}
export async function runFeatureHealth(superuserKey, key = null) {
  return superuserJson('/admin/feature-health/run', {
    method: 'POST',
    superuserKey,
    body: key ? { key } : {},
  });
}

// Task #426 — Browser smoke run helpers.
export async function listBrowserSmokeRuns(superuserKey) {
  return superuserJson('/admin/smoke/runs', { superuserKey });
}
export async function getBrowserSmokeRun(superuserKey, id) {
  return superuserJson(`/admin/smoke/runs/${encodeURIComponent(id)}`, { superuserKey });
}
export async function triggerBrowserSmokeRun(superuserKey) {
  return superuserJson('/admin/smoke/run', { method: 'POST', superuserKey, body: {} });
}
export async function approveBrowserSmokeBaseline(superuserKey, runId, stepKey) {
  return superuserJson(
    `/admin/smoke/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepKey)}/approve-baseline`,
    { method: 'POST', superuserKey, body: {} }
  );
}
export function browserSmokeImageUrl(superuserKey, relPath) {
  // Image route is superuser-gated but <img> can't send custom headers, so
  // we pass the key as a query param (the requireSuperuser middleware
  // accepts ?superuser_key= in addition to the header).
  const q = new URLSearchParams({ path: relPath, superuser_key: superuserKey || '' });
  return `/api/admin/smoke/image?${q.toString()}`;
}

// Task #297 — superuser one-click "provision & connect" diagnostic helpers.
// `runInhouseDiagProvision` creates a synthetic flagged session and pushes
// the real RCON match-password to the configured dedicated server, returning
// the steam://connect link inline. `cleanupInhouseDiag` deletes the row.
export async function runInhouseDiagProvision(superuserKey) {
  const r = await superuserFetch('/admin/inhouse/diag-provision', {
    method: 'POST',
    headers: { 'x-superuser-key': superuserKey },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Failure responses now include the synthetic session row (with
    // status=server_failed + notes) and its sessionId so the UI can both
    // surface the failure detail and offer Cleanup. Attach all of that to
    // the thrown error so callers don't need a parallel out-of-band channel.
    const err = new Error(d.error || `Diagnostic provisioning failed: ${r.status}`);
    err.rcon = d.rcon || null;
    err.session = d.session || null;
    err.sessionId = d.sessionId || null;
    throw err;
  }
  return d;
}

export async function cleanupInhouseDiag(sessionId, superuserKey) {
  const r = await superuserFetch(`/admin/inhouse/diag-cleanup/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: { 'x-superuser-key': superuserKey },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Diagnostic cleanup failed: ${r.status}`);
  return d;
}

// `pushInhouseServerPassword` re-pushes a match password to the dedicated
// server over RCON WITHOUT creating a synthetic diagnostic session. Pass
// `{ sessionId }` to re-push a real session's stored password, `{ password }`
// to push a custom one, or neither to push a freshly generated test password.
// Returns the same live-RCON `serverStatus` readout the diag-provision route does.
export async function pushInhouseServerPassword({ sessionId = null, password = null } = {}, superuserKey) {
  const body = {};
  if (sessionId != null) body.sessionId = sessionId;
  if (password) body.password = password;
  const r = await superuserFetch('/admin/inhouse/rcon-push-password', {
    method: 'POST',
    headers: { 'x-superuser-key': superuserKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(d.error || `RCON password push failed: ${r.status}`);
    err.rcon = d.rcon || null;
    err.serverStatus = d.serverStatus || null;
    throw err;
  }
  return d;
}

function _findHeader(headers, name) {
  const lower = name.toLowerCase();
  return Object.keys(headers).some(k => k.toLowerCase() === lower);
}

// ── Smurf detector (advisory, Task #408) ──────────────────────────────────
export async function getSmurfWatch({ includeAcknowledged = false, threshold = null, superuserKey } = {}) {
  const qs = new URLSearchParams();
  if (includeAcknowledged) qs.set('include_acknowledged', '1');
  if (threshold != null) qs.set('threshold', String(threshold));
  const q = qs.toString();
  return superuserJson(`/admin/smurf-watch${q ? `?${q}` : ''}`, { superuserKey });
}

export async function setSmurfThreshold(value, superuserKey) {
  return superuserJson('/admin/smurf-watch/threshold', {
    method: 'POST', body: { value }, superuserKey,
  });
}

export async function recomputeSmurfWatch(superuserKey) {
  return superuserJson('/admin/smurf-watch/recompute', { method: 'POST', superuserKey });
}

export async function acknowledgeSmurfAccount(accountId, note, superuserKey) {
  return superuserJson(`/admin/smurf-watch/${encodeURIComponent(accountId)}/acknowledge`, {
    method: 'POST', body: { note: note || '' }, superuserKey,
  });
}

export async function getSmurfAccountDetail(accountId, superuserKey) {
  return superuserJson(`/admin/smurf-watch/${encodeURIComponent(accountId)}`, { superuserKey });
}

// ── Feature flags ──────────────────────────────────────────────────────────
export async function getFeatureFlags(superuserKey) {
  const headers = {};
  if (superuserKey) headers['x-superuser-key'] = superuserKey;
  const res = await superuserFetch(BASE + '/feature-flags', { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}

export async function getAdminFeatureFlags(superuserKey) {
  const res = await superuserFetch(BASE + '/admin/feature-flags', {
    headers: { 'x-superuser-key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}

export async function setFeatureFlag({ key, state, description }, superuserKey) {
  const res = await superuserFetch(BASE + '/admin/feature-flags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ key, state, description }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}

// Ops log buffer — filtered live snapshot of the in-memory ring buffer (superuser).
export async function getAdminOpsLogs(superuserKey, source) {
  const qs = source ? `?source=${encodeURIComponent(source)}` : '';
  return superuserJson(`/admin/ops/logs${qs}`, { superuserKey });
}

// Ops history — persisted 1-minute samples for sparklines (superuser).
export async function getAdminOpsHistory(superuserKey, hours = 24) {
  return superuserJson(`/admin/ops/history?hours=${encodeURIComponent(hours)}`, { superuserKey });
}

// Lootbox seasonal-set management (superuser).
export async function getLootboxAdminSets(superuserKey) {
  return superuserJson('/admin/lootbox/sets', { superuserKey });
}
export async function retireLootboxSet(superuserKey, setId, retired) {
  return superuserJson('/admin/lootbox/sets/retire', {
    method: 'POST', superuserKey, body: { setId, retired: !!retired },
  });
}
export async function createLootboxSet(superuserKey, { name, description, itemSkus }) {
  return superuserJson('/admin/lootbox/sets', {
    method: 'POST', superuserKey,
    body: { name, description, itemSkus },
  });
}

// Lootbox Lab — superuser-only dry-run tools.
export async function lootboxLabInspect(superuserKey, boxId) {
  return superuserJson(`/admin/lootbox/lab/inspect?boxId=${encodeURIComponent(boxId)}`, { superuserKey });
}
export async function lootboxLabSimulate(superuserKey, { boxId, count = 1, forceRarity = null, forceSku = null }) {
  return superuserJson('/admin/lootbox/lab/simulate', {
    method: 'POST', superuserKey,
    body: { boxId, count, forceRarity, forceSku },
  });
}

// Task #446 — Discord Rich Presence
export async function getMeDiscordRpc() {
  const res = await fetch(BASE + '/me/discord-rpc', { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}
export async function setMeDiscordRpcOptIn(optedIn) {
  const res = await fetch(BASE + '/me/discord-rpc/opt-in', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ opted_in: !!optedIn }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}
export async function disconnectMeDiscordRpc() {
  const res = await fetch(BASE + '/me/discord-rpc/disconnect', {
    method: 'POST',
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}
export async function getAdminDiscordRichPresence(superuserKey) {
  const res = await superuserFetch(BASE + '/admin/discord-rich-presence', {
    headers: { 'x-superuser-key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}

export async function launchSeason10(superuserKey) {
  const res = await superuserFetch(BASE + '/admin/launch-season-10', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ confirmation: 'LAUNCH SEASON 10' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}

export async function setMatchReplayPath(matchId, replayPath, superuserKey) {
  const res = await superuserFetch(`${BASE}/admin/matches/${matchId}/set-replay-path`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-superuser-key': superuserKey,
    },
    body: JSON.stringify({ replay_path: replayPath }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to set replay path');
  return data;
}

export async function getMatchReplayStatus(superuserKey, limit = 100, offset = 0) {
  const res = await superuserFetch(`${BASE}/admin/matches/replay-status?limit=${limit}&offset=${offset}`, {
    headers: { 'x-superuser-key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}

export async function triggerMissingDMs(matchId, superuserKey) {
  const res = await superuserFetch(`${BASE}/admin/matches/${matchId}/trigger-dms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ missingOnly: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}

export async function getPatchNotes() {
  return fetchJson('/patch-notes');
}

export async function getPatchNote(id) {
  return fetchJson(`/patch-notes/${id}`);
}

export async function createPatchNote({ version, title, content, author }, superuserKey) {
  const res = await superuserFetch(BASE + '/patch-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': superuserKey },
    body: JSON.stringify({ version, title, content, author }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create patch note');
  return data;
}

export async function updatePatchNote(id, { version, title, content, author }, superuserKey) {
  const res = await superuserFetch(BASE + `/patch-notes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': superuserKey },
    body: JSON.stringify({ version, title, content, author }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update patch note');
  return data;
}

export async function deletePatchNote(id, superuserKey) {
  const res = await superuserFetch(BASE + `/patch-notes/${id}`, {
    method: 'DELETE',
    headers: { 'X-Superuser-Key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete patch note');
  return data;
}

async function fetchJson(url) {
  // For tournament endpoints we explicitly opt out of the HTTP cache because
  // service workers / CDNs that pre-cached a listing before v5.77's
  // server-side `Cache-Control: no-store` shipped will otherwise keep
  // serving deleted rows, leading to "click → Tournament not found"
  // mismatches between the listing and the detail page.
  const init = /\/(tournaments|weekend-tournaments)(\b|\/)/.test(url)
    ? { cache: 'no-store' }
    : undefined;
  const res = await fetch(BASE + url, init);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `Request failed: ${res.status}`);
    err.status = res.status;
    // Pro Tier paywall — backend returns 402 with { paywall:true, feature, signed_in }.
    // Pages catch this and render <PaywallCard /> instead of an error toast.
    if (res.status === 402 && data.paywall) {
      err.paywall = true;
      err.feature = data.feature || null;
      err.signedIn = Boolean(data.signed_in);
    }
    // Cross-table tournament redirect hint (bracket → weekend, etc.).
    // Backend returns 404 with { redirect, kind } when the id exists in a
    // sibling table; pages can catch and navigate without an extra round-trip.
    if (data && data.redirect) {
      err.redirect = data.redirect;
      err.kind = data.kind || null;
    }
    throw err;
  }
  return res.json();
}

// Pro Tier API helpers. getProStatus() is safe to call when signed-out
// (returns is_pro:false, gate_on:flag-state) and never 404s.
export async function getProStatus() {
  return fetchJson('/pro/status');
}
export async function getGiftHistory() {
  return fetchJson('/me/gifts');
}
export async function getProPricing() {
  return fetchJson('/pro/pricing');
}

// Task #613 — in-website notification center (bell + feed).
export async function getNotificationFeed({ before = null, limit = 30 } = {}) {
  const qs = new URLSearchParams();
  if (before != null) qs.set('before', String(before));
  if (limit != null) qs.set('limit', String(limit));
  const res = await fetch(BASE + '/me/notification-feed' + (qs.toString() ? `?${qs}` : ''), {
    credentials: 'include',
  });
  if (res.status === 401) return { items: [], unreadCount: 0, unauthenticated: true };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load notifications');
  return data; // { items, unreadCount }
}

export async function getNotificationUnreadCount() {
  const res = await fetch(BASE + '/me/notification-feed/unread-count', { credentials: 'include' });
  if (res.status === 401) return { count: 0, unauthenticated: true };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load unread count');
  return data; // { count }
}

export async function markNotificationRead(id) {
  const res = await fetch(BASE + `/me/notification-feed/${id}/read`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to mark read');
  return data; // { ok, unreadCount }
}

export async function markAllNotificationsRead() {
  const res = await fetch(BASE + '/me/notification-feed/read-all', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to mark all read');
  return data; // { ok, marked, unreadCount }
}
export async function getProMembers() {
  return fetchJson('/pro/members');
}
export async function createProCheckout(plan = 'monthly') {
  // Task #318 — accepts 'monthly' (default) or 'lifetime'.
  const res = await fetch(BASE + '/pro/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ plan }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Checkout failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data; // { url, plan }
}

// Task #318 — Stripe customer portal (manage card / invoices).
export async function openProPortal() {
  const res = await fetch(BASE + '/pro/portal', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to open portal');
  return data;
}

export async function cancelProSubscription({ reason, comment, winbackOffered }) {
  const res = await fetch(BASE + '/pro/cancel', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, comment, winback_offered: !!winbackOffered }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to cancel');
  return data;
}

export async function resumeProSubscription() {
  const res = await fetch(BASE + '/pro/resume', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to resume');
  return data;
}

export async function acceptProWinback({ reason }) {
  const res = await fetch(BASE + '/pro/winback', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to apply offer');
  return data;
}

function seasonParam(seasonId) {
  return seasonId ? `&season_id=${encodeURIComponent(seasonId)}` : '';
}

export async function getMatches(limit = 50, offset = 0, seasonId = null) {
  return fetchJson(`/matches?limit=${limit}&offset=${offset}${seasonParam(seasonId)}`);
}

export async function getMatch(matchId) {
  return fetchJson(`/matches/${matchId}`);
}

// Task #588 — unified command-palette search. Single bounded endpoint backing
// the header ⌘K palette across players, coaches, teams and tournaments. Heroes
// are matched client-side from the static registry (heroNames.js).
export async function globalSearch(q) {
  return fetchJson(`/search?q=${encodeURIComponent(q)}`);
}

// Task #272 — one-click "Post to #highlights" from the match share popover.
// Server gates by signed-in + viewer-was-in-match + Discord-linked, and
// rate-limits per-user-per-match.
// Task #314 — post-match QOL bundle.
export async function getNemesisSpotlight(matchId) {
  const r = await fetch(`${BASE}/matches/${encodeURIComponent(matchId)}/nemesis-spotlight`, { credentials: 'include' });
  if (r.status === 401) return { spotlight: null };
  if (!r.ok) throw new Error('Failed to fetch nemesis spotlight');
  return r.json();
}

export function recapCardUrl(matchId, { size = 'og', variant = 'classic', download = false } = {}) {
  const q = new URLSearchParams({ size, variant });
  if (download) q.set('download', '1');
  return `${BASE}/matches/${encodeURIComponent(matchId)}/recap-card.png?${q.toString()}`;
}

export async function shareRecapCardToDiscord(matchId, { size = 'og', variant = 'classic' } = {}) {
  const r = await fetch(`${BASE}/matches/${encodeURIComponent(matchId)}/share-recap-card`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ size, variant }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Failed to post recap card');
  return data;
}

export async function postMatchToDiscord(matchId) {
  const res = await fetch(BASE + `/matches/${encodeURIComponent(matchId)}/share-to-discord`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed: ${res.status}`);
    err.status = res.status;
    err.code = data.code || null;
    throw err;
  }
  return data;
}

export async function deleteMatch(matchId, uploadKey, reason) {
  const res = await fetch(BASE + `/matches/${matchId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'X-Upload-Key': uploadKey,
    },
    body: JSON.stringify({ reason }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete match');
  return data;
}

export async function updateMatchMeta(matchId, { patch, seasonId, date }, uploadKey) {
  const res = await fetch(BASE + `/matches/${matchId}/meta`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Upload-Key': uploadKey,
    },
    body: JSON.stringify({ patch, seasonId, date }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update match');
  return data;
}

export async function getLeaderboard(limit = 50, seasonId = null) {
  return fetchJson(`/leaderboard?limit=${limit}${seasonParam(seasonId)}`);
}

export async function getImpactScores(seasonId = null) {
  return fetchJson(`/impact-scores${seasonId ? `?season_id=${seasonId}` : ''}`);
}

export async function getPlayer(accountId, seasonId = null) {
  return fetchJson(`/players/${accountId}${seasonId ? `?season_id=${seasonId}` : ''}`);
}

export async function getAllPlayers(seasonId = null) {
  return fetchJson(`/players?x=1${seasonParam(seasonId)}`);
}

// Task #442 — Detailed head-to-head used by the `/h2h/:a/:b` page. The
// server endpoint is Pro-paywalled like the in-app head-to-head tab, so
// callers should treat a thrown `{ paywall: true }` error the same way
// the existing PlayerTools tab does.
export async function getH2HDetailed(a, b, seasonId = null) {
  const qs = seasonId ? `?season_id=${encodeURIComponent(seasonId)}` : '';
  return fetchJson(`/h2h/${encodeURIComponent(a)}/${encodeURIComponent(b)}${qs}`);
}

export async function getHeroStats(seasonId = null) {
  return fetchJson(`/heroes?x=1${seasonParam(seasonId)}`);
}

export async function getHeroTierList(seasonId = null, patch = null) {
  const qs = new URLSearchParams();
  if (seasonId) qs.set('season', String(seasonId));
  if (patch) qs.set('patch', String(patch));
  const q = qs.toString();
  return fetchJson(`/heroes/tier-list${q ? `?${q}` : ''}`);
}

// Task #382 — Hero meta v2.
export async function getAvailableHeroPatches(seasonId = null) {
  const q = seasonId ? `?season=${seasonId}` : '';
  return fetchJson(`/heroes/patches${q}`);
}

export async function getHeroSynergyMatrix(seasonId = null, patch = null) {
  const qs = new URLSearchParams();
  if (seasonId) qs.set('season', String(seasonId));
  if (patch) qs.set('patch', String(patch));
  const q = qs.toString();
  return fetchJson(`/heroes/synergy-matrix${q ? `?${q}` : ''}`);
}

export async function getHeroCounterScores({ enemies, position, seasonId, patch } = {}) {
  const qs = new URLSearchParams();
  qs.set('enemies', (enemies || []).join(','));
  if (position) qs.set('position', String(position));
  if (seasonId) qs.set('season', String(seasonId));
  if (patch) qs.set('patch', String(patch));
  return fetchJson(`/heroes/counter-scores?${qs}`);
}

export async function getHeroPatchTrends(heroId, { limit = 8, seasonId = null } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (seasonId) qs.set('season', String(seasonId));
  return fetchJson(`/heroes/${heroId}/patch-trends?${qs}`);
}

// Task #409 — patch diff + draft trainer.
export async function getHeroPatchDiff({ from, to, seasonId } = {}) {
  const qs = new URLSearchParams();
  qs.set('from', String(from));
  qs.set('to', String(to));
  if (seasonId) qs.set('season', String(seasonId));
  return fetchJson(`/heroes/patch-diff?${qs}`);
}

export async function simulateDraftPick({ allies, enemies, bans, action = 'pick', position = null, seasonId = null } = {}) {
  const r = await fetch('/api/heroes/draft-trainer/simulate-pick', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allies, enemies, bans, action, position, season_id: seasonId }),
  });
  if (!r.ok) throw new Error('Failed to simulate pick');
  return r.json();
}

export async function saveDraftTrainerRun({ side, picksA, picksB, bans, predictedAdvantage } = {}) {
  const r = await fetch('/api/heroes/draft-trainer/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ side, picks_a: picksA, picks_b: picksB, bans, predicted_advantage: predictedAdvantage }),
  });
  if (!r.ok) {
    if (r.status === 401) throw new Error('Sign in to save trainer runs');
    throw new Error('Failed to save trainer run');
  }
  return r.json();
}

export async function getDraftTrainerAccuracy(accountId) {
  return fetchJson(`/player/${accountId}/draft-trainer-accuracy`);
}

export async function getPlayerHeroSuggestions(accountId, seasonId = null) {
  const q = seasonId ? `?season=${seasonId}` : '';
  return fetchJson(`/player/${accountId}/hero-suggestions${q}`);
}

// Task #203 — Magazine v3 stat panels (full edition only).
export async function getPlayerTimeOfDay(accountId, seasonId = null) {
  const q = seasonId ? `?season=${seasonId}` : '';
  return fetchJson(`/players/${accountId}/time-of-day${q}`);
}
// Task #377 — seasonal item-purchase benchmarks (position-locked).
export async function getSeasonalItemBenchmarks(seasonId = null) {
  const r = await fetch(`/api/seasons/${seasonId == null ? 'all' : seasonId}/item-benchmarks`);
  if (!r.ok) throw new Error('Failed to load seasonal item benchmarks');
  return r.json();
}

export async function getPlayerItemBenchmarks(accountId, seasonId = null) {
  const qs = seasonId != null ? `?season=${seasonId}` : '';
  const r = await fetch(`/api/players/${accountId}/item-benchmarks${qs}`);
  if (!r.ok) throw new Error('Failed to load player item benchmarks');
  return r.json();
}

// Task #378 — Pro replay browser.
export async function getProMatches(filters = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v == null || v === '') continue;
    qs.set(k, String(v));
  }
  const r = await fetch(`/api/pro-matches${qs.toString() ? `?${qs}` : ''}`, { credentials: 'same-origin' });
  if (r.status === 404) throw new Error('Pro replay browser is disabled');
  if (r.status === 403) throw new Error('Pro replay browser is in preview — superuser only');
  if (!r.ok) throw new Error('Failed to load pro matches');
  return r.json();
}
export async function getProMatchLeagues() {
  const r = await fetch('/api/pro-matches/leagues', { credentials: 'same-origin' });
  if (!r.ok) throw new Error('Failed to load pro leagues');
  return r.json();
}
export async function getProMatchPatches() {
  const r = await fetch('/api/pro-matches/patches', { credentials: 'same-origin' });
  if (!r.ok) throw new Error('Failed to load pro patches');
  return r.json();
}
export async function getProMatch(matchId) {
  const r = await fetch(`/api/pro-matches/${matchId}`, { credentials: 'same-origin' });
  if (!r.ok) throw new Error('Failed to load pro match');
  return r.json();
}

export async function getPlayerHeroItems(accountId) {
  return fetchJson(`/players/${accountId}/hero-items`);
}
export async function getPlayerSeasonWrapped(accountId, seasonId = null) {
  return fetchJson(`/players/${accountId}/season-wrapped${seasonId ? `/${seasonId}` : ''}`);
}
// Task #443 — Personal Season Wrapped slideshow.
export async function getSeasonWrappedCards(accountId, seasonId = null) {
  return fetchJson(seasonId
    ? `/wrapped/${seasonId}/${accountId}`
    : `/wrapped/${accountId}`);
}
export async function getMyLatestWrapped() {
  return fetchJson('/wrapped/me/latest');
}
export async function getPlayerHallOfFamePlaques(accountId) {
  return fetchJson(`/players/${accountId}/hall-of-fame`);
}

export async function getAdminHeroTierOverrides(seasonId, superuserKey) {
  const q = seasonId ? `?season=${seasonId}` : '';
  const res = await superuserFetch(BASE + `/admin/heroes/tier-overrides${q}`, {
    headers: { 'x-superuser-key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}

export async function setAdminHeroTierOverride({ season_id, hero_id, tier }, superuserKey) {
  const res = await superuserFetch(BASE + '/admin/heroes/tier-overrides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ season_id, hero_id, tier }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}

export async function deleteAdminHeroTierOverride(heroId, seasonId, superuserKey) {
  const q = seasonId ? `?season=${seasonId}` : '';
  const res = await superuserFetch(BASE + `/admin/heroes/tier-overrides/${heroId}${q}`, {
    method: 'DELETE',
    headers: { 'x-superuser-key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}

export async function getHeroPlayers(heroId, seasonId = null) {
  return fetchJson(`/heroes/${heroId}/players?x=1${seasonParam(seasonId)}`);
}

export async function getOverallStats(seasonId = null) {
  return fetchJson(`/overall-stats?x=1${seasonParam(seasonId)}`);
}

export async function getPositionStats(position, minGames = 1, seasonId = null) {
  return fetchJson(`/position-stats/${position}?min_games=${minGames}${seasonParam(seasonId)}`);
}

export async function getPlayerPositionProfiles(seasonId = null) {
  return fetchJson(`/player-profiles/positions?x=1${seasonParam(seasonId)}`);
}

export async function getPlayerHeroProfiles(seasonId = null) {
  return fetchJson(`/player-profiles/heroes?x=1${seasonParam(seasonId)}`);
}

export async function getSynergy(seasonId = null) {
  return fetchJson(`/synergy?x=1${seasonParam(seasonId)}`);
}

export async function getSynergyHeatmap(seasonId = null) {
  return fetchJson(`/synergy/heatmap?x=1${seasonParam(seasonId)}`);
}

export async function getEnemySynergyHeatmap(seasonId = null) {
  return fetchJson(`/enemy-synergy/heatmap?x=1${seasonParam(seasonId)}`);
}

export async function clearMatchFileHash(matchId, uploadKey) {
  const res = await fetch(BASE + `/matches/${matchId}/clear-hash`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Upload-Key': uploadKey,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to clear file hash');
  return data;
}

export async function updatePlayerPosition(matchId, slot, position, uploadKey) {
  const res = await fetch(BASE + `/matches/${matchId}/position`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Upload-Key': uploadKey,
    },
    body: JSON.stringify({ slot, position }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update position');
  return data;
}

export async function getPlayerHeroes(accountId) {
  return fetchJson(`/players/${accountId}/heroes`);
}

export async function getPlayerPositions(accountId, seasonId = null) {
  return fetchJson(`/players/${accountId}/positions${seasonId ? `?season_id=${seasonId}` : ''}`);
}

export async function getNicknames() {
  return fetchJson('/nicknames');
}

export async function setNickname(accountId, nickname, superuserKey) {
  const res = await superuserFetch(BASE + `/nicknames/${accountId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Superuser-Key': superuserKey,
    },
    body: JSON.stringify({ nickname }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to set nickname');
  return data;
}

// Task 114 — Discord ID collision reconciliation (superuser-only).
export async function getDiscordIdCollisions(superuserKey) {
  const res = await superuserFetch(BASE + '/admin/discord-id-collisions', {
    headers: { 'x-superuser-key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load Discord ID collisions');
  return data;
}

export async function resolveDiscordIdCollision(discordId, keepAccountId, superuserKey) {
  const res = await superuserFetch(BASE + '/admin/discord-id-collisions/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ discord_id: discordId, keep_account_id: keepAccountId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to resolve collision');
  return data;
}

export async function enforceDiscordIdUniqueIndex(superuserKey) {
  const res = await superuserFetch(BASE + '/admin/discord-id-collisions/enforce-index', {
    method: 'POST',
    headers: { 'x-superuser-key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to enforce index');
  return data;
}

// Task #265 — Founders Pass cap-race refund audit log (superuser-only).
export async function getFoundersRingRefunds(superuserKey, { limit = 200 } = {}) {
  const res = await superuserFetch(BASE + `/admin/founders-ring-refunds?limit=${limit}`, {
    headers: { 'x-superuser-key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load Founders Pass refunds');
  return data;
}

// Task #274 — superuser one-click retry of a stuck refund_failed row.
// On Stripe failure the server returns 502 with { error, refund } so the UI
// can refresh the row in place with the new error_message; surface that
// payload by attaching it to the thrown Error.
export async function retryFoundersRingRefund(id, superuserKey) {
  const res = await superuserFetch(BASE + `/admin/founders-ring-refunds/${id}/retry`, {
    method: 'POST',
    headers: { 'x-superuser-key': superuserKey },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Failed to retry refund');
    err.refund = data.refund || null;
    throw err;
  }
  return data;
}

// Task #138 — Discord auto-join failure queue (superuser-only).
export async function getDiscordAutoJoinFailures(superuserKey) {
  const res = await superuserFetch(BASE + '/admin/discord-autojoin-failures', {
    headers: { 'x-superuser-key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load Discord auto-join failures');
  return data;
}

export async function clearDiscordAutoJoinFailure({ discord_id, account_id }, superuserKey) {
  const res = await superuserFetch(BASE + '/admin/discord-autojoin-failures/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ discord_id, account_id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to clear failure');
  return data;
}

export async function setPlayerDiscordId(accountId, discordId, superuserKey) {
  const res = await superuserFetch(BASE + `/players/${accountId}/discord`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Superuser-Key': superuserKey,
    },
    body: JSON.stringify({ discord_id: discordId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to set Discord ID');
  return data;
}

export async function getSeasons() {
  return fetchJson('/seasons');
}

export async function createSeason(name, uploadKey) {
  const res = await fetch(BASE + '/seasons', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Upload-Key': uploadKey,
    },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create season');
  return data;
}

export async function activateSeason(id, uploadKey) {
  const url = id === null ? '/seasons/none/activate' : `/seasons/${id}/activate`;
  const res = await fetch(BASE + url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Upload-Key': uploadKey,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to activate season');
  return data;
}

const CHUNK_SIZE = 2 * 1024 * 1024;
const PARALLEL_UPLOADS = 1;

export async function uploadReplayChunked(file, uploadKey, onProgress, patch = null) {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  onProgress({ phase: 'init', percent: 0, detail: 'Starting upload...' });

  const initRes = await fetch(BASE + '/upload/init', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Upload-Key': uploadKey,
    },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      totalChunks,
      patch: patch || null,
    }),
  });
  const initData = await initRes.json();
  if (!initRes.ok) throw new Error(initData.error || 'Failed to initialize upload');

  const { jobId } = initData;

  let completedChunks = 0;
  const totalMB = (file.size / (1024 * 1024)).toFixed(1);

  const uploadChunk = async (i) => {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      try {
        const formData = new FormData();
        formData.append('chunk', chunk, `chunk_${i}.bin`);
        const chunkRes = await fetch(BASE + `/upload/chunk/${jobId}`, {
          method: 'POST',
          headers: {
            'X-Upload-Key': uploadKey,
            'X-Chunk-Index': String(i),
          },
          body: formData,
        });
        if (!chunkRes.ok) {
          const responseText = await chunkRes.text().catch(() => '');
          let errMsg = `Chunk ${i} upload failed (HTTP ${chunkRes.status})`;
          try { errMsg = JSON.parse(responseText).error || errMsg; } catch {}
          if (!errMsg.includes(responseText) && responseText && responseText.length < 200) {
            errMsg += `: ${responseText}`;
          }
          throw new Error(errMsg);
        }
        break;
      } catch (err) {
        attempts++;
        if (attempts >= maxAttempts) throw err;
        await new Promise(r => setTimeout(r, 1000 * attempts));
      }
    }

    completedChunks++;
    const percent = Math.round((completedChunks / totalChunks) * 90);
    const uploadedMB = (Math.min(completedChunks * CHUNK_SIZE, file.size) / (1024 * 1024)).toFixed(1);
    onProgress({
      phase: 'uploading',
      percent,
      detail: `Uploading ${uploadedMB}/${totalMB} MB (${percent}%)`,
      chunksUploaded: completedChunks,
      totalChunks,
    });
  };

  for (let batch = 0; batch < totalChunks; batch += PARALLEL_UPLOADS) {
    const promises = [];
    for (let j = 0; j < PARALLEL_UPLOADS && batch + j < totalChunks; j++) {
      promises.push(uploadChunk(batch + j));
    }
    await Promise.all(promises);
  }

  onProgress({ phase: 'assembling', percent: 92, detail: 'Assembling file...' });

  const completeRes = await fetch(BASE + `/upload/complete/${jobId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Upload-Key': uploadKey,
    },
  });
  const completeData = await completeRes.json();
  if (!completeRes.ok) throw new Error(completeData.error || 'Failed to complete upload');

  onProgress({ phase: 'processing', percent: 95, detail: 'Parsing replay...' });

  return { jobId };
}

export async function getUploadStatus(jobId) {
  return fetchJson(`/upload/status/${jobId}`);
}

// Task #315 — Player-uploaded replay fallback. Same chunked shape as
// uploadReplayChunked but auth is the Steam session cookie + a server-side
// match-participation check. The match id is part of the URL so the server
// can verify the parsed .dem belongs to this match before recording.
export async function submitPlayerReplayChunked(matchId, file, onProgress) {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const safeId = encodeURIComponent(String(matchId));
  onProgress?.({ phase: 'init', percent: 0, detail: 'Starting upload...' });
  const initRes = await fetch(BASE + `/matches/${safeId}/replay-submit/init`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, fileSize: file.size, totalChunks }),
  });
  const initData = await initRes.json();
  if (!initRes.ok) throw new Error(initData.error || 'Failed to initialize upload');
  const { jobId } = initData;
  let completedChunks = 0;
  const totalMB = (file.size / (1024 * 1024)).toFixed(1);
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    let attempts = 0;
    while (attempts < 3) {
      try {
        const fd = new FormData();
        fd.append('chunk', chunk, `chunk_${i}.bin`);
        const cr = await fetch(BASE + `/matches/${safeId}/replay-submit/chunk/${jobId}`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'X-Chunk-Index': String(i) },
          body: fd,
        });
        if (!cr.ok) {
          let msg = `Chunk ${i} failed (HTTP ${cr.status})`;
          try { msg = (await cr.json()).error || msg; } catch (_) {}
          throw new Error(msg);
        }
        break;
      } catch (err) {
        attempts++;
        if (attempts >= 3) throw err;
        await new Promise((r) => setTimeout(r, 1000 * attempts));
      }
    }
    completedChunks++;
    const percent = Math.round((completedChunks / totalChunks) * 90);
    const uploadedMB = (Math.min(completedChunks * CHUNK_SIZE, file.size) / (1024 * 1024)).toFixed(1);
    onProgress?.({ phase: 'uploading', percent, detail: `Uploading ${uploadedMB}/${totalMB} MB (${percent}%)` });
  }
  onProgress?.({ phase: 'assembling', percent: 92, detail: 'Assembling file...' });
  const cr = await fetch(BASE + `/matches/${safeId}/replay-submit/complete/${jobId}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
  });
  const cd = await cr.json();
  if (!cr.ok) throw new Error(cd.error || 'Failed to complete upload');
  onProgress?.({ phase: 'processing', percent: 95, detail: 'Parsing replay...' });
  return { jobId };
}

// Pro-gated minimap timeline payload for the 2D replay viewer.
export async function getReplayTimeline(matchId) {
  return fetchJson(`/matches/${encodeURIComponent(String(matchId))}/replay-timeline`);
}

// Task #411 — admin: re-detect team fights for every match with a stored
// game_timeline that has no match_fights rows yet. Backfill runs in the
// background; poll `getReplayFightsBackfillStatus` until phase === 'complete'.
export async function backfillReplayFights(superuserKey, opts = {}) {
  return fetchJson(`/admin/replays/backfill-fights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ limit: opts.limit || 2000 }),
  });
}
export async function getReplayFightsBackfillStatus(superuserKey) {
  return fetchJson(`/admin/replays/backfill-fights-status`, {
    headers: { 'x-superuser-key': superuserKey },
  });
}

export async function getDuplicateMatches(adminKey) {
  return fetchJson(`/admin/duplicate-matches`, {
    headers: { 'x-admin-key': adminKey },
  });
}

export async function getPlayerRatingHistory(accountId) {
  return fetchJson(`/players/${accountId}/rating-history`);
}

export async function getPlayerV3ModifierHistory(accountId) {
  return fetchJson(`/players/${accountId}/v3-modifier-history`);
}

export async function getPlayerAchievements(accountId) {
  return fetchJson(`/players/${accountId}/achievements`);
}

// Task #448 — anniversary ribbon (today's first-inhouse-match anniversary).
export async function getPlayerAnniversary(accountId) {
  return fetchJson(`/player/${accountId}/anniversary`);
}

export async function getAchievementLeaderboard(limit = 25) {
  return fetchJson(`/achievement-leaderboard?limit=${limit}`);
}

export async function getReferralLeaderboard(limit = 10) {
  return fetchJson(`/leaderboard/referrals?limit=${limit}`);
}

export async function recomputeAchievements(superuserKey) {
  const res = await superuserFetch(BASE + '/admin/recompute-achievements', {
    method: 'POST',
    headers: { 'x-superuser-key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to recompute achievements');
  return data;
}

export async function getHeadToHead(a, b, seasonId = null) {
  const sp = seasonId ? `&season_id=${encodeURIComponent(seasonId)}` : '';
  return fetchJson(`/head-to-head?a=${a}&b=${b}${sp}`);
}

export async function getPlayerRivals(accountId, seasonId = null, minTotal = 2) {
  const qs = new URLSearchParams();
  if (seasonId) qs.set('season_id', seasonId);
  if (minTotal != null) qs.set('min_total', String(minTotal));
  const tail = qs.toString() ? `?${qs}` : '';
  return fetchJson(`/players/${accountId}/rivals${tail}`);
}

export async function getPlayerComparison(a, b, seasonId = null) {
  const sp = seasonId ? `&season_id=${encodeURIComponent(seasonId)}` : '';
  return fetchJson(`/compare?a=${a}&b=${b}${sp}`);
}

export async function getDraftSuggestions(params) {
  const qs = new URLSearchParams();
  if (params.allies?.length) qs.set('allies', params.allies.join(','));
  if (params.enemies?.length) qs.set('enemies', params.enemies.join(','));
  if (params.banned?.length) qs.set('banned', params.banned.join(','));
  if (params.position) qs.set('position', params.position);
  if (params.seasonId) qs.set('season_id', params.seasonId);
  return fetchJson(`/draft-assistant?${qs}`);
}

export async function getPredictions(seasonId) {
  return fetchJson(`/predictions/${seasonId}`);
}

export async function getPredictionAccuracy(seasonId) {
  return fetchJson(`/predictions/${seasonId}/accuracy`);
}

export async function savePrediction(seasonId, predictorName, predictions) {
  const res = await fetch(BASE + `/predictions/${seasonId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ predictor_name: predictorName, predictions }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save');
  return data;
}

export async function getWeeklyRecap(seasonId = null) {
  const sp = seasonId ? `?season_id=${encodeURIComponent(seasonId)}` : '';
  return fetchJson(`/weekly-recap${sp}`);
}

export async function getSeasonBuyins(seasonId) {
  return fetchJson(`/seasons/${seasonId}/buyins`);
}

export async function setSeasonBuyinAmount(seasonId, amountCents, uploadKey) {
  const res = await fetch(BASE + `/seasons/${seasonId}/buyin-amount`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-upload-key': uploadKey },
    body: JSON.stringify({ amount_cents: amountCents }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to set buy-in amount');
  return data;
}

export async function createBuyinCheckout(seasonId, displayName, accountId) {
  const res = await fetch(BASE + `/buyin/create-checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ season_id: seasonId, display_name: displayName, account_id: accountId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create checkout');
  return data;
}

export async function confirmBuyinSession(sessionId) {
  return fetchJson(`/buyin/confirm?session_id=${encodeURIComponent(sessionId)}`);
}

export async function deleteSeasonApi(seasonId, superuserKey) {
  const res = await superuserFetch(BASE + `/seasons/${seasonId}`, {
    method: 'DELETE',
    headers: { 'x-superuser-key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete season');
  return data;
}

export async function getSeasonPayouts(seasonId) {
  return fetchJson(`/seasons/${seasonId}/payouts`);
}

export async function addSeasonPayout(seasonId, categoryType, label, amountCents, notes, uploadKey, payoutMode, amountPercent) {
  const res = await fetch(BASE + `/seasons/${seasonId}/payouts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-upload-key': uploadKey },
    body: JSON.stringify({
      category_type: categoryType,
      label,
      amount_cents: amountCents,
      notes,
      payout_mode: payoutMode || 'cents',
      amount_percent: amountPercent || 0,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to add payout category');
  return data;
}

export async function getMultiKillStats(seasonId = null) {
  const params = new URLSearchParams();
  if (seasonId) params.set('season', seasonId);
  return fetchJson(`/multikills${params.toString() ? '?' + params.toString() : ''}`);
}

export async function getMostImproved(days = 30, seasonId = null) {
  const sp = seasonId ? `&season_id=${seasonId}` : '';
  return fetchJson(`/most-improved?days=${days}${sp}`);
}

export async function getBestAndFairest(seasonId = null, minRatings = 3) {
  const sp = seasonId ? `&season_id=${seasonId}` : '';
  return fetchJson(`/best-and-fairest?min_ratings=${minRatings}${sp}`);
}

export async function getPudgeGames(seasonId = null) {
  return fetchJson(`/pudge-stats/games?x=1${seasonParam(seasonId)}`);
}

export async function getHeroMeta(seasonId = null) {
  return fetchJson(`/hero-meta?x=1${seasonParam(seasonId)}`);
}

export async function getMatchPredictions(matchId) {
  return fetchJson(`/matches/${matchId}/predictions`);
}

export async function submitMatchPrediction(matchId, predictorName, predictedWinner, predictorAccountId) {
  const res = await fetch(BASE + `/match-predictions/${matchId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ predictor_name: predictorName, predicted_winner: predictedWinner, predictor_account_id: predictorAccountId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to submit prediction');
  return data;
}

// Task #449 — Match prediction game.
export async function getOpenPredictionWindows() {
  const r = await fetch(BASE + '/predictions/open', { credentials: 'same-origin' });
  if (!r.ok) throw new Error('Failed to load open predictions');
  return r.json();
}
export async function submitMatchPick(matchId, predictedWinner) {
  const r = await fetch(BASE + '/predictions', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ match_id: matchId, predicted_winner: predictedWinner }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Failed to submit prediction');
  return data;
}
export async function getMyPredictions() {
  const r = await fetch(BASE + '/predictions/me', { credentials: 'same-origin' });
  if (r.status === 401) throw new Error('Sign in with Steam to view your predictions.');
  if (!r.ok) throw new Error('Failed to load your predictions');
  return r.json();
}
export async function getPredictionLeaderboard(type = 'accuracy') {
  const r = await fetch(BASE + '/predictions/leaderboard?type=' + encodeURIComponent(type), { credentials: 'same-origin' });
  if (!r.ok) throw new Error('Failed to load leaderboard');
  return r.json();
}

export async function getPlayerPredictionStats(accountId) {
  return fetchJson(`/players/${accountId}/predictions`);
}

export async function deleteSeasonPayout(seasonId, payoutId, uploadKey) {
  const res = await fetch(BASE + `/seasons/${seasonId}/payouts/${payoutId}`, {
    method: 'DELETE',
    headers: { 'x-upload-key': uploadKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete payout');
  return data;
}

export async function setPayoutWinner(seasonId, payoutId, winnerAccountId, winnerDisplayName, uploadKey) {
  const res = await fetch(BASE + `/seasons/${seasonId}/payouts/${payoutId}/winner`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-upload-key': uploadKey },
    body: JSON.stringify({ winner_account_id: winnerAccountId, winner_display_name: winnerDisplayName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to set winner');
  return data;
}

export async function getSteamUser() {
  return fetchJson('/auth/me');
}

export async function steamLogout() {
  const res = await fetch(BASE + '/auth/logout', { method: 'POST' });
  return res.ok;
}

export async function getHomeStats(seasonId = null) {
  return fetchJson(`/home-stats${seasonId ? `?season_id=${seasonId}` : ''}`);
}

export async function getLatestRecap() {
  return fetchJson('/latest-recap');
}

export async function getPlayerNemesis(accountId) {
  return fetchJson(`/player/${accountId}/nemesis`);
}

export async function getPlayerWardPlacements(accountId, seasonId = null) {
  const q = seasonId ? `?season_id=${seasonId}` : '';
  return fetchJson(`/players/${accountId}/ward-placements${q}`);
}

export async function getAllWardPlacements(seasonId = null) {
  const q = seasonId ? `?season_id=${seasonId}` : '';
  return fetchJson(`/ward-placements${q}`);
}

export async function getPlayerHeroCounters(accountId, seasonId = null) {
  const q = seasonId ? `?season_id=${seasonId}` : '';
  return fetchJson(`/players/${accountId}/hero-counters${q}`);
}

export async function getPlayerStreak(accountId) {
  return fetchJson(`/players/${accountId}/streak`);
}

// Task #190 — captain auto-pick stats across last N completed sessions where
// this account was a captain. Returns { sessionsConsidered, picks, autoPicks,
// ratio, perSession }.
export async function getCaptainAutoPickStats(accountId, limit = 5) {
  return fetchJson(`/inhouse/captain-stats/${accountId}?limit=${limit}`);
}

export async function getDraftStats(seasonId = null) {
  const q = seasonId ? `?season_id=${seasonId}` : '';
  return fetchJson(`/draft-stats${q}`);
}

export async function getPersonalRecords(seasonId = null) {
  const q = seasonId ? `?season_id=${seasonId}` : '';
  return fetchJson(`/records${q}`);
}

export async function getSeasonPlayerRecords(seasonId = null) {
  const q = seasonId ? `?season_id=${seasonId}` : '';
  return fetchJson(`/season-player-records${q}`);
}

export async function getFirstBloodStats(seasonId = null) {
  const q = seasonId ? `?season_id=${seasonId}` : '';
  return fetchJson(`/first-blood-stats${q}`);
}

export async function getHeroSkillBuilds(heroId, seasonId = null) {
  const q = seasonId ? `?season_id=${seasonId}` : '';
  return fetchJson(`/heroes/${heroId}/skill-builds${q}`);
}

export async function getPlayerDurationStats(accountId, seasonId = null) {
  const q = seasonId ? `?season_id=${seasonId}` : '';
  return fetchJson(`/players/${accountId}/duration-stats${q}`);
}

export async function getComebackMatches(seasonId = null) {
  const q = seasonId ? `?season_id=${seasonId}` : '';
  return fetchJson(`/comeback-matches${q}`);
}

export async function getPudgeStats(seasonId = null) {
  const q = seasonId ? `?season_id=${seasonId}` : '';
  return fetchJson(`/pudge-stats${q}`);
}

export async function getSocialGraph(seasonId = null, minGames = 3) {
  const q = new URLSearchParams({ min_games: minGames, ...(seasonId ? { season_id: seasonId } : {}) });
  return fetchJson(`/social-graph?${q}`);
}

export async function getPlayerConnections(accountId, seasonId = null) {
  const q = seasonId ? `?season_id=${seasonId}` : '';
  return fetchJson(`/player-connections/${accountId}${q}`);
}

export async function getPlayerForm(seasonId = null) {
  const q = seasonId ? `?season_id=${seasonId}` : '';
  return fetchJson(`/player-form${q}`);
}

export async function getPositionAverages(seasonId = null) {
  const q = seasonId ? `?season_id=${seasonId}` : '';
  return fetchJson(`/position-averages${q}`);
}

export async function getHeroMatchups(heroId, seasonId = null) {
  const q = new URLSearchParams({ hero_id: heroId, ...(seasonId ? { season_id: seasonId } : {}) });
  return fetchJson(`/hero-matchups?${q}`);
}

export async function getHeroRecentMatches(heroId, seasonId = null, limit = 10) {
  const q = new URLSearchParams({ limit, ...(seasonId ? { season_id: seasonId } : {}) });
  return fetchJson(`/heroes/${heroId}/recent-matches?${q}`);
}

export async function getSchedule() {
  return fetchJson('/schedule');
}

export async function createScheduledGame(scheduledAt, note, superuserKey) {
  const res = await superuserFetch(BASE + '/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': superuserKey },
    body: JSON.stringify({ scheduled_at: scheduledAt, note }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to schedule game');
  return data;
}

export async function cancelScheduledGame(id, superuserKey) {
  const res = await superuserFetch(BASE + `/schedule/${id}`, {
    method: 'DELETE',
    headers: { 'X-Superuser-Key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to cancel game');
  return data;
}

export async function getScheduleRsvps(gameId) {
  return fetchJson(`/schedule/${gameId}/rsvps`);
}

export async function rsvpScheduledGame(gameId, status) {
  const res = await fetch(BASE + `/schedule/${gameId}/rsvp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update RSVP');
  return data;
}

export async function removeRsvp(gameId) {
  const res = await fetch(BASE + `/schedule/${gameId}/rsvp`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to remove RSVP');
  return data;
}

export async function getPlayerCommunityRatings(accountId) {
  return fetchJson(`/ratings/player/${accountId}`);
}

export async function getMatchRatings(matchId) {
  return fetchJson(`/ratings/match/${matchId}`);
}

export async function getStoredReplays(superuserKey) {
  const res = await superuserFetch(BASE + '/replays/stored', {
    headers: { 'x-superuser-key': superuserKey },
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Request failed: ${res.status}`); }
  return res.json();
}

export async function extendReplayExpiry(matchId, days, superuserKey) {
  const res = await superuserFetch(BASE + `/replays/${matchId}/extend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ days }),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Request failed: ${res.status}`); }
  return res.json();
}


export async function getPlayerAlly(accountId, seasonId = null) {
  const url = `/player/${accountId}/ally${seasonId ? `?season=${seasonId}` : ''}`;
  return fetchJson(url);
}

export async function getPlayerWinRateHistory(accountId, seasonId = null) {
  const url = `/player/${accountId}/win-rate-history${seasonId ? `?season=${seasonId}` : ''}`;
  return fetchJson(url);
}

export async function getHallOfFame(seasonId = null) {
  const url = `/hall-of-fame${seasonId ? `?season=${seasonId}` : ''}`;
  return fetchJson(url);
}

export async function getPlayerBenchmarks(seasonId = null) {
  const url = `/benchmarks${seasonId ? `?season=${seasonId}` : ''}`;
  return fetchJson(url);
}

export async function getTournaments(seasonId = null) {
  const url = `/tournaments${seasonId ? `?season=${seasonId}` : ''}`;
  return fetchJson(url);
}

export async function getTournamentById(id) {
  return fetchJson(`/tournaments/${id}`);
}

export async function createTournament(data, superuserKey) {
  const res = await superuserFetch(BASE + '/tournaments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify(data),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
  return res.json();
}

export async function addTournamentParticipant(tournamentId, accountId, superuserKey) {
  const res = await superuserFetch(BASE + `/tournaments/${tournamentId}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ accountId }),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
  return res.json();
}

export async function removeTournamentParticipant(tournamentId, accountId, superuserKey) {
  const res = await superuserFetch(BASE + `/tournaments/${tournamentId}/participants/${accountId}`, {
    method: 'DELETE',
    headers: { 'x-superuser-key': superuserKey },
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
  return res.json();
}

export async function generateTournamentBracket(tournamentId, superuserKey) {
  const res = await superuserFetch(BASE + `/tournaments/${tournamentId}/generate`, {
    method: 'POST',
    headers: { 'x-superuser-key': superuserKey },
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
  return res.json();
}

export async function setTournamentMatchWinner(matchId, winnerId, superuserKey) {
  const res = await superuserFetch(BASE + `/tournament-matches/${matchId}/winner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ winnerId }),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
  return res.json();
}

export async function clearTournamentMatchWinner(matchId, superuserKey) {
  const res = await superuserFetch(BASE + `/tournament-matches/${matchId}/winner`, {
    method: 'DELETE',
    headers: { 'x-superuser-key': superuserKey },
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
  return res.json();
}

export async function linkTournamentMatch(matchId, inhouseMatchId, superuserKey) {
  const res = await superuserFetch(BASE + `/tournament-matches/${matchId}/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ inhouseMatchId }),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
  return res.json();
}

export async function reseedTournamentParticipants(tournamentId, orderedAccountIds, superuserKey) {
  const res = await superuserFetch(BASE + `/tournaments/${tournamentId}/reseed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ orderedAccountIds }),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
  return res.json();
}

// Task #412 — Tournament v2 client helpers
export async function getTournamentStandings(tournamentId) {
  return fetchJson(`/tournaments/${tournamentId}/standings`);
}
export async function getTournamentCheckIns(tournamentId) {
  return fetchJson(`/tournaments/${tournamentId}/checkins`);
}
export async function checkInToTournament(tournamentId) {
  const res = await fetch(BASE + `/tournaments/${tournamentId}/checkin`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Check-in failed');
  return d;
}
export async function advanceSwissRound(tournamentId, superuserKey) {
  const res = await superuserFetch(BASE + `/tournaments/${tournamentId}/advance-swiss-round`, {
    method: 'POST', headers: { 'x-superuser-key': superuserKey },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed to advance round');
  return d;
}
export async function getTournamentPrizeSplits(tournamentId) {
  return fetchJson(`/tournaments/${tournamentId}/prize-splits`);
}
export async function setTournamentPrizeSplits(tournamentId, splits, superuserKey) {
  const res = await superuserFetch(BASE + `/tournaments/${tournamentId}/prize-splits`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ splits }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed to save prize splits');
  return d;
}
export async function getTournamentPayouts(tournamentId) {
  return fetchJson(`/tournaments/${tournamentId}/payouts`);
}
export async function finalizeTournamentPayouts(tournamentId, superuserKey) {
  const res = await superuserFetch(BASE + `/tournaments/${tournamentId}/finalize-payouts`, {
    method: 'POST', headers: { 'x-superuser-key': superuserKey },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed to finalize payouts');
  return d;
}

// Task #453 — pay tournament winners via Stripe Connect.
export async function transferTournamentPayouts(tournamentId, superuserKey, includeFailed = false) {
  const res = await superuserFetch(BASE + `/tournaments/${tournamentId}/payouts/transfer`, {
    method: 'POST',
    headers: { 'x-superuser-key': superuserKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ includeFailed }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed to pay winners');
  return d;
}
export async function retryTournamentPayout(tournamentId, payoutId, superuserKey) {
  const res = await superuserFetch(BASE + `/tournaments/${tournamentId}/payouts/${payoutId}/retry`, {
    method: 'POST', headers: { 'x-superuser-key': superuserKey },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed to retry transfer');
  return d;
}
export async function getMyPayoutAccount() {
  return fetchJson('/me/payout-account');
}
export async function getMyPayouts() {
  return fetchJson('/me/payouts');
}
// Task #615 — flag a prize that the receipt marked paid but never arrived.
export async function reportPayoutProblem(payoutId, message = '') {
  const res = await fetch(BASE + `/me/payouts/${payoutId}/report`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed to submit report');
  return d;
}
export async function startPayoutOnboarding(country = 'AU') {
  const res = await fetch(BASE + '/me/payout-account/onboard', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ country }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed to start onboarding');
  return d;
}
export async function getFailedTournamentPayouts(superuserKey) {
  return superuserJson('/admin/tournament-payouts/failed', { superuserKey });
}
export async function getPayoutsAwaitingConnect(superuserKey) {
  return superuserJson('/admin/tournament-payouts/awaiting-connect', { superuserKey });
}
export async function getPaidPayoutReceipts(superuserKey) {
  return superuserJson('/admin/tournament-payouts/paid-receipts', { superuserKey });
}
// Task #630 — re-trigger the one-shot "prize landed" receipt for a single paid payout.
export async function resendPayoutReceipt(payoutId, superuserKey) {
  const res = await superuserFetch(BASE + `/admin/tournament-payouts/${payoutId}/resend-receipt`, {
    method: 'POST', headers: { 'x-superuser-key': superuserKey },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed to resend receipt');
  return d;
}
// Task #652 — resend the "prize landed" receipt for every currently-unsent paid payout.
export async function resendAllPayoutReceipts(superuserKey) {
  const res = await superuserFetch(BASE + `/admin/tournament-payouts/resend-all-receipts`, {
    method: 'POST', headers: { 'x-superuser-key': superuserKey },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed to resend receipts');
  return d;
}
export async function retryFailedTournamentPayout(payoutId, superuserKey) {
  const res = await superuserFetch(BASE + `/admin/tournament-payouts/${payoutId}/retry`, {
    method: 'POST', headers: { 'x-superuser-key': superuserKey },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed to retry transfer');
  return d;
}

export async function deleteTournament(id, superuserKey) {
  const res = await superuserFetch(BASE + `/tournaments/${id}`, {
    method: 'DELETE',
    headers: { 'x-superuser-key': superuserKey },
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
  return res.json();
}

export async function getPlayerRanks() {
  return fetchJson('/ranks');
}

export async function triggerRankSync(superuserKey) {
  // v5.90 — explicitly include credentials so the session cookie is sent
  // even if BASE is ever switched to a cross-origin URL. The header is kept
  // as a fallback for non-browser callers. Surface a clearer message on 403
  // (session expired) so the user knows to re-log-in instead of seeing the
  // generic "Invalid superuser key" string.
  const res = await superuserFetch(BASE + '/ranks/sync', {
    method: 'POST',
    credentials: 'include',
    headers: { 'x-superuser-key': superuserKey || '' },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    throw new Error('Superuser session expired — log out and back in via the 🛡️ Superuser button, then try again.');
  }
  if (!res.ok) throw new Error(data.error || 'Failed to start sync');
  return data;
}

export async function setManualRank(accountId, rankTier, leaderboardRank, superuserKey) {
  const res = await superuserFetch(BASE + '/ranks/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ accountId, rankTier, leaderboardRank }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to set rank');
  return data;
}

export async function clearPlayerRank(accountId, superuserKey) {
  const res = await superuserFetch(BASE + `/ranks/${accountId}`, {
    method: 'DELETE',
    headers: { 'x-superuser-key': superuserKey },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to clear rank');
  return data;
}

export async function getSignupRequests(superuserKey, status = null) {
  const url = BASE + `/admin/signups` + (status ? `?status=${status}` : '');
  const res = await superuserFetch(url, { headers: { 'x-superuser-key': superuserKey } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to fetch signups');
  return data;
}

export async function getWeekendTournaments() {
  return fetchJson('/weekend-tournaments');
}

export async function getWeekendTournament(id) {
  return fetchJson(`/weekend-tournaments/${id}`);
}

export async function createWeekendTournament(data, superuserKey) {
  const res = await superuserFetch(BASE + '/weekend-tournaments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify(data),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed');
  return d;
}

export async function updateWeekendTournament(id, data, superuserKey) {
  const res = await superuserFetch(BASE + `/weekend-tournaments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify(data),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed');
  return d;
}

export async function announceWeekendTournament(id, superuserKey) {
  const res = await superuserFetch(BASE + `/weekend-tournaments/${id}/announce`, {
    method: 'POST',
    headers: { 'x-superuser-key': superuserKey },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed');
  return d;
}

// ── Pre-match mood & form widget (Task #444) ───────────────────────────────
export async function getPlayerFormSummary(accountId) {
  return fetchJson(`/player/${encodeURIComponent(accountId)}/form-summary`);
}

// ── Profile chart v2 (1.4) ──────────────────────────────────────────────────
export async function getPlayerMatchStatsHistory(accountId, seasonId = null) {
  const url = `/player/${encodeURIComponent(accountId)}/match-stats-history${seasonId ? `?season=${seasonId}` : ''}`;
  return fetchJson(url);
}

// ── Multi-tier seasons (1.6) ────────────────────────────────────────────────
export async function getSeasonTiers(seasonId) {
  return fetchJson(`/seasons/${seasonId}/tiers`);
}
export async function ensureSeasonTiers(seasonId, superuserKey) {
  const res = await superuserFetch(BASE + `/seasons/${seasonId}/tiers/ensure`, {
    method: 'POST',
    headers: { 'x-superuser-key': superuserKey },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed');
  return d;
}
export async function updateSeasonTier(seasonId, tierNumber, fields, superuserKey) {
  const res = await superuserFetch(BASE + `/seasons/${seasonId}/tiers/${tierNumber}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify(fields),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed');
  return d;
}
export async function placeAllPlayersInTiers(seasonId, force, superuserKey) {
  const res = await superuserFetch(BASE + `/seasons/${seasonId}/tiers/place-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ force: !!force }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed');
  return d;
}
export async function getSeasonTierPlayers(seasonId, tierNumber) {
  return fetchJson(`/seasons/${seasonId}/tiers/${tierNumber}/players`);
}
export async function overridePlayerTier(seasonId, accountId, tierNumber, superuserKey) {
  const res = await superuserFetch(BASE + `/seasons/${seasonId}/tiers/override`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ accountId, tierNumber }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed');
  return d;
}

// ── Tournament self-signup (1.7) ────────────────────────────────────────────
export async function getTournamentEntries(tournamentId, paidOnly = false) {
  return fetchJson(`/tournaments/${tournamentId}/entries${paidOnly ? '?paidOnly=1' : ''}`);
}
export async function getTournamentEligibility(tournamentId, accountId) {
  const q = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
  return fetchJson(`/tournaments/${tournamentId}/eligibility${q}`);
}
export async function createTournamentCheckout(tournamentId, accountId, displayName) {
  const res = await fetch(BASE + `/tournaments/${tournamentId}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ accountId, displayName }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed');
  return d;
}
export async function confirmTournamentEntry(tournamentId, sessionId) {
  return fetchJson(`/tournaments/${tournamentId}/entry/confirm?session_id=${encodeURIComponent(sessionId)}`);
}
// v5.92 — unified self-register endpoint. Server dispatches to free-signup or
// Stripe checkout based on the tournament's entry_fee_cents. Returns
// { url } (redirect to Stripe) for paid events or { ok, entry } for free.
export async function registerForTournament(tournamentId, accountId, displayName) {
  const res = await fetch(BASE + `/tournaments/${tournamentId}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ accountId, displayName }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed to register');
  return d;
}
// v5.92 — withdraw from a tournament that hasn't started. Issues a Stripe
// refund for paid entries.
export async function withdrawFromTournament(tournamentId, accountId) {
  const res = await fetch(BASE + `/tournaments/${tournamentId}/withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ accountId }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Failed to withdraw');
  return d;
}

export async function updateSignupRequest(id, { status, adminNotes }, superuserKey) {
  const res = await superuserFetch(BASE + `/admin/signups/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ status, adminNotes }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update signup');
  return data;
}

export async function getSeasonSummary(seasonId) {
  return fetchJson(`/seasons/${seasonId}/summary`);
}

export async function setSeasonEndConditions(seasonId, { end_date, match_count_limit }, uploadKey) {
  const res = await fetch(BASE + `/seasons/${seasonId}/end-conditions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Upload-Key': uploadKey },
    body: JSON.stringify({ end_date: end_date || null, match_count_limit: match_count_limit || null }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update end conditions');
  return data;
}

export async function closeSeasonApi(seasonId, superuserKey) {
  const res = await superuserFetch(BASE + `/seasons/${seasonId}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to close season');
  return data;
}

export async function rolloverSeasonApi(seasonId, superuserKey) {
  const res = await superuserFetch(BASE + `/seasons/${seasonId}/rollover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to roll over season');
  return data;
}

export async function undoSeasonRolloverApi(seasonId, superuserKey) {
  const res = await superuserFetch(BASE + `/seasons/${seasonId}/undo-rollover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to undo rollover');
  return data;
}

export async function setSeasonNextTemplateApi(seasonId, template, superuserKey) {
  const res = await superuserFetch(BASE + `/seasons/${seasonId}/next-template`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ template }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to set next-season template');
  return data;
}

export async function reannounceSeasonApi(seasonId, superuserKey) {
  const res = await superuserFetch(BASE + `/seasons/${seasonId}/announce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to repost announcement');
  return data;
}

// ── Gift purchasing ─────────────────────────────────────────────────────────
export async function createGiftProCheckout(recipientAccountId) {
  const res = await fetch(BASE + '/gift/pro', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipientAccountId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create gift checkout');
  return data;
}

export async function createGiftSeasonPassCheckout(recipientAccountId) {
  const res = await fetch(BASE + '/gift/season-pass', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipientAccountId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create gift checkout');
  return data;
}

// ── Profile frame purchases ──────────────────────────────────────────────────
export async function getOwnedFrames() {
  const res = await fetch(BASE + '/me/frames', { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to fetch owned frames');
  return data.owned_frames || [];
}

export async function purchaseFrameCheckout(frameId) {
  const res = await fetch(BASE + `/frames/${frameId}/checkout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Failed to create frame checkout');
    if (res.status === 402) err.paywall = true;
    if (data.already_owned) err.already_owned = true;
    throw err;
  }
  return data;
}

// ── Scouting report ─────────────────────────────────────────────────────────
// v5.86 — accepts an optional superuser key so owner can preview the AI Scout
// report without a Pro subscription. Falls back to credentials only when no
// key is supplied.
export async function getScoutingReport(playerId, superuserKey = null) {
  const headers = {};
  if (superuserKey) headers['x-superuser-key'] = superuserKey;
  const res = await fetch(BASE + `/player/${playerId}/scouting-report`, {
    credentials: 'include',
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    if (res.status === 402) err.paywall = true;
    throw err;
  }
  return data;
}

// =============================================================================
// Task #157 — Magazine v3 monetization helpers.
// All paths surface 402 paywall errors as `err.paywall = true` via the
// existing fetchJson convention so callers can render the Pro upsell card.
// =============================================================================
async function _getJson(path) {
  const res = await fetch(BASE + path, { credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    if (res.status === 402) err.paywall = true;
    if (data?.feature) err.feature = data.feature;
    throw err;
  }
  return data;
}
async function _postJson(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    if (res.status === 402) err.paywall = true;
    throw err;
  }
  return data;
}

// Task #450 — Inhouse coin betting (full markets).
export const getInhouseMarkets = (matchId) => _getJson(`/inhouse/${encodeURIComponent(matchId)}/markets`);
export const placeInhouseBet = (marketId, outcomeId, stake) =>
  _postJson(`/inhouse/markets/${encodeURIComponent(marketId)}/bet`, { outcomeId, stake });
export const getMyBettingStats = () => _getJson('/me/betting-stats');
export const getPlayerBettingStats = (accountId) => _getJson(`/player/${encodeURIComponent(accountId)}/betting-stats`);
export const adminSetBettingPaused = (paused, superuserKey) =>
  superuserJson('/admin/betting/pause', { method: 'POST', body: { paused }, superuserKey });
export const adminVoidBetMarket = (marketId, superuserKey) =>
  superuserJson(`/admin/betting/markets/${encodeURIComponent(marketId)}/void`, { method: 'POST', superuserKey });
export const adminSettleBetMarket = (marketId, outcomeId, superuserKey) =>
  superuserJson(`/admin/betting/markets/${encodeURIComponent(marketId)}/settle`, { method: 'POST', body: { outcomeId }, superuserKey });
export const adminCreateCustomMarket = (matchId, payload, superuserKey) =>
  superuserJson(`/admin/inhouse/${encodeURIComponent(matchId)}/markets/custom`, { method: 'POST', body: payload, superuserKey });

// Task #384 — Coaching v2: group sessions, async VOD review, earnings.
export const listOpenGroupSessions = () => _getJson('/group-sessions');
export const getGroupSession = (id) => _getJson(`/group-sessions/${id}`);
export const joinGroupSession = (id) => _postJson(`/group-sessions/${id}/join`, {});
export const listMyGroupSeats = () => _getJson('/me/coaching/group-seats');
export const listMyCoachGroupSessions = () => _getJson('/me/coach/group-sessions');
export const createGroupSession = (payload) => _postJson('/me/coach/group-sessions', payload);
export const cancelGroupSession = (id) => _postJson(`/me/coach/group-sessions/${id}/cancel`, {});
export const completeGroupSession = (id) => _postJson(`/me/coach/group-sessions/${id}/complete`, {});
export const requestVodReview = (coachId, payload) => _postJson(`/coaches/${coachId}/vod-review`, payload);
export const listMyVodReviews = () => _getJson('/me/coaching/vod');
export const getVodReview = (id) => _getJson(`/vod-reviews/${id}`);
export const addVodNote = (id, payload) => _postJson(`/vod-reviews/${id}/notes`, payload);
export const deleteVodNote = async (reviewId, noteId) => {
  const res = await fetch(`${BASE}/vod-reviews/${reviewId}/notes/${noteId}`, { method: 'DELETE', credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed');
  return data;
};
export const deliverVodReview = (id) => _postJson(`/vod-reviews/${id}/deliver`, {});
export const refundVodReview = (id) => _postJson(`/vod-reviews/${id}/refund`, {});
export const uploadVodReplay = async (id, file) => {
  const fd = new FormData();
  fd.append('replay', file);
  const res = await fetch(`${BASE}/vod-reviews/${id}/upload-replay`, { method: 'POST', credentials: 'same-origin', body: fd });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
};
export const getCoachEarnings = (ym) => _getJson('/me/coach/earnings' + (ym ? `?ym=${ym}` : ''));

// Task #413 — Coaching v3: recurring student plans.
export const listMyCoachPlans = () => _getJson('/coach/plans');
export const createCoachPlan = (payload) => _postJson('/coach/plans', payload);
export const updateCoachPlan = async (id, patch) => {
  const res = await fetch(`${BASE}/coach/plans/${id}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed');
  return data;
};
export const publishCoachPlan = (id) => _postJson(`/coach/plans/${id}/publish`, {});
export const listCoachPlansPublic = (coachId) => _getJson(`/coaches/${coachId}/plans`);
export const subscribeCoachPlan = (coachId, planId) =>
  _postJson(`/coaches/${coachId}/plans/${planId}/subscribe`, {});
export const listMyPlanSubscriptions = () => _getJson('/me/coaching/plan-subscriptions');
export const listMyCoachPlanSubscribers = () => _getJson('/me/coach/plan-subscribers');
export const cancelPlanSubscription = (id) =>
  _postJson(`/me/coaching/plan-subscriptions/${id}/cancel`, {});

// Convenience overloads — pass `{ usePlan: true }` to redeem against the
// student's active subscription quota rather than paying via Stripe.
export const bookCoachWithPlan = (coachId, payload) =>
  _postJson(`/coaches/${coachId}/book`, { ...payload, use_plan: true });
export const joinGroupSessionWithPlan = (id) =>
  _postJson(`/group-sessions/${id}/join`, { use_plan: true });
export const requestVodReviewWithPlan = (coachId, payload) =>
  _postJson(`/coaches/${coachId}/vod-review`, { ...payload, use_plan: true });

// Task #314 / v7.34 — Founders Ring catalog.
export const listMyFounderRings = () => _getJson('/me/founder-rings');
export const setEquippedFounderRing = (sku) => _postJson('/me/equipped-ring', { sku });
export const buyFounderRingCheckout = (slug) =>
  _postJson('/shop/founders-ring/checkout', { slug });
// Generic coin spend (already enforced server-side against COIN_PRICES). Used
// by the shop's "Buy with coins" alt-buy path for founder rings.
export const spendCoinsOnSku = (sku) => _postJson('/coins/spend', { sku });

export const getReplayQuota = () => _getJson('/me/replay-quota');
export const getWeeklyReport = () => _getJson('/me/weekly-report');
export const getCoachRecommendations = () => _getJson('/me/coach-recommendations');
// Task #628 — PERF Growth Coach (own-profile-or-superuser).
export const getPlayerPerfGrowth = (accountId) =>
  _getJson(`/player/${encodeURIComponent(accountId)}/perf-growth`);
export const getMyPerks = () => _getJson('/me/perks');

// Task #650 — currently-live inhouse game(s) still inside the pickable
// window (not started, or under 5 minutes of in-game time) for the Pickem
// "Live now" section.
export const getPickableLiveGames = () => _getJson('/inhouse/pickable-live');
export const getActivePickemSeason = () => _getJson('/pickem/active-season');
export const getPickemLeaderboard = (seasonId) =>
  _getJson('/pickem/leaderboard' + (seasonId ? `?season_id=${seasonId}` : ''));
export const getMyPickemPicks = () => _getJson('/pickem/me');
// Round-8: optional side-bet dimensions. Each is nullable — caller may
// pass undefined/null to skip a dimension while still picking the winner.
//   pickedFirstBlood        : 'radiant' | 'dire'   (+5 pts)
//   pickedTotalKillsBucket  : 'under' | 'over'     (+5 pts, boundary 50)
//   pickedDurationTier      : 'short' | 'medium' | 'long'  (+5 pts)
export const submitPickemPick = (
  matchRef, pickedWinner,
  {
    pickedFirstBlood = null, pickedTotalKillsBucket = null,
    pickedDurationTier = null, pickedFirstTower = null,
    // Task #316 — prop bets v2 (per reviewer): MVP team / comeback / first Rosh.
    pickedMvpTeam = null, pickedComeback = null, pickedFirstRosh = null,
  } = {},
) =>
  _postJson('/pickem/pick', {
    matchRef, pickedWinner,
    pickedFirstBlood, pickedTotalKillsBucket, pickedDurationTier,
    pickedFirstTower,
    pickedMvpTeam, pickedComeback, pickedFirstRosh,
  });

// Task #316 — engagement loop helpers.
export const getCoinPacks = () => _getJson('/coins/packs');
export const buyCoinPack = (pack) => _postJson('/coins/buy', { pack });
export const getMyHeroMastery = () => _getJson('/hero-mastery/me');
export const getPlayerHeroMastery = (accountId) => _getJson(`/hero-mastery/player/${accountId}`);
export const getHeroMasteryLeaderboard = (params = {}) => {
  const q = new URLSearchParams();
  if (params.heroId)   q.set('hero_id',  params.heroId);
  if (params.position) q.set('position', params.position);
  if (params.limit)    q.set('limit',    params.limit);
  const qs = q.toString();
  return _getJson('/hero-mastery/leaderboard' + (qs ? `?${qs}` : ''));
};
export const placeMatchWager = (matchRef, side, stake) =>
  _postJson(`/predictions/${encodeURIComponent(matchRef)}/wager`, { side, stake });
export const getMatchWagers = (matchRef) =>
  _getJson(`/predictions/${encodeURIComponent(matchRef)}/wager`);

export const getPlayerSponsorships = (accountId) =>
  _getJson(`/players/${accountId}/sponsorships`);
export const getPlayerVerifiedBadges = (accountId) =>
  _getJson(`/players/${accountId}/verified-badges`);
export const getMySponsorshipInbox = () => _getJson('/me/sponsorships/inbox');
// Task #342 — buyer-scoped sponsorship-order telemetry (impressions/clicks/CTR).
export const getMySponsorshipOrders = () => _getJson('/me/sponsorship-orders');
export const acceptSponsorship = (id) => _postJson(`/sponsorships/${id}/accept`);
export const declineSponsorship = (id) => _postJson(`/sponsorships/${id}/decline`);
export const createSponsorshipCheckout = (payload) =>
  _postJson('/sponsorships/checkout', payload);

// Task #205 — live presence chip for /players/:id v3 cover.
export const getPlayerPresence = (accountId) =>
  _getJson(`/players/${accountId}/presence`).catch(() => ({ status: 'offline' }));
// Task #213 — bulk live-presence rollup for the /players "Live now" tab.
export const getLivePresences = () =>
  _getJson('/presence/live').catch(() => ({ players: [] }));

// Task #227 — cheap count-only variant powering the global nav "Live now"
// badge. Soft-fails to { count: 0 } so a missing endpoint or transient
// error never breaks navigation.
export const getLivePresenceCount = () =>
  _getJson('/presence/live/count').catch(() => ({ count: 0 }));
export const getMyPresenceVisibility = () =>
  _getJson('/me/presence-visibility').catch(() => ({ presence_visible: true }));
export const setMyPresenceVisibility = (visible) =>
  _postJson('/me/presence-visibility', { presence_visible: !!visible });

export const createVerifiedBadgeCheckout = (provider, handle) =>
  _postJson('/verified/checkout', { provider, handle });


// v6.63 / Task #207 — Founders Pass ring (one-time SKU, capped).
export const getFoundersRingStatus = () =>
  _getJson('/shop/founders-ring/status').catch(() => ({ owned: false, sold_out: true }));
export const buyFoundersRingCheckout = () =>
  _postJson('/shop/founders-ring/checkout');

// v6.64 / Task #208 — Vanity slugs + Profile Spotlight.
export const getMyVanitySlug = () => _getJson('/me/vanity-slug');
export const checkVanitySlugAvailability = (slug) =>
  _getJson(`/vanity-slug/availability?slug=${encodeURIComponent(slug)}`);
export const getVanityUrlPrice = () => _getJson('/shop/vanity-url/price').catch(() => null);
export const purchaseVanityUrlStripe = () =>
  fetch(BASE + '/shop/vanity-url/stripe-checkout', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
  }).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed: ${r.status}`);
    return d;
  });
export const claimMyVanitySlug = (slug) =>
  fetch(BASE + '/me/vanity-slug', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
  }).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed: ${r.status}`);
    return d;
  });
export const releaseMyVanitySlug = () =>
  fetch(BASE + '/me/vanity-slug', { method: 'DELETE', credentials: 'same-origin' })
    .then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Request failed: ${r.status}`);
      return d;
    });

export const getCurrentSpotlight = () =>
  _getJson('/spotlight/current').catch(() => ({ spotlight: null }));
export const adminListSpotlights = (superuserKey) =>
  superuserJson('/admin/spotlight', { superuserKey });
export const adminCreateSpotlight = (superuserKey, payload) =>
  superuserJson('/admin/spotlight', { method: 'POST', body: payload, superuserKey });
export const adminUpdateSpotlight = (superuserKey, id, payload) =>
  superuserJson(`/admin/spotlight/${id}`, { method: 'PATCH', body: payload, superuserKey });
export const adminDeleteSpotlight = (superuserKey, id) =>
  superuserJson(`/admin/spotlight/${id}`, { method: 'DELETE', superuserKey });

// ===== Task #319 — Season Pass v2 / Teams / Weekly challenges / Limited drops / Gifting =====
// (Re-uses the `_getJson` / `_postJson` helpers declared earlier in this file.
// A second `function _postJson` declaration lived here originally and caused
// the production build to fail with a redeclaration error; removed in
// Task #330 since the earlier async version is functionally equivalent.)
export const createSeasonPassCheckout = () => _postJson('/season-pass/checkout', {});
export const listTeams = () => _getJson('/teams');
export const getTeam = (id) => _getJson(`/teams/${id}`);
export const getMyTeam = () => _getJson('/me/team').catch(() => ({ team: null, invites: [] }));
export const createTeamCheckout = (name, tag) => _postJson('/teams/checkout', { name, tag });
export const payTeamUpkeep = (teamId) => _postJson(`/teams/${teamId}/upkeep/checkout`, {});
export const editTeam = (teamId, payload) => _postJson(`/teams/${teamId}/edit`, payload);
export const inviteToTeam = (teamId, account_id) => _postJson(`/teams/${teamId}/invite`, { account_id });
export const respondTeamInvite = (inviteId, accept) => _postJson(`/team-invites/${inviteId}/respond`, { accept });
export const leaveTeam = (teamId) => _postJson(`/teams/${teamId}/leave`, {});
// Task #383 — Team v2
export const getTeamRosterHistory = (id) => _getJson(`/teams/${id}/roster-history`);
export const getTeamRecentMatches = (id) => _getJson(`/teams/${id}/recent-matches`);
export const getTeamSchedule = (id) => _getJson(`/teams/${id}/schedule`);
export const proposeScrim = (teamId, payload) => _postJson(`/teams/${teamId}/scrims`, payload);
export const respondScrim = (scrimId, accept) => _postJson(`/scrims/${scrimId}/respond`, { accept });
export const cancelScrim = (scrimId) => _postJson(`/scrims/${scrimId}/cancel`, {});
export const proposeRosterTransfer = (toTeamId, account_id) =>
  _postJson(`/teams/${toTeamId}/roster-transfers`, { account_id });
export const respondRosterTransfer = (id, approve) =>
  _postJson(`/roster-transfers/${id}/respond`, { approve });
export const getMyRosterTransfers = () =>
  _getJson('/me/roster-transfers').catch(() => ({ transfers: [] }));
// Task #383 — Leagues
export const listLeagues = () => _getJson('/leagues');
export const getLeague = (id) => _getJson(`/leagues/${id}`);
export const createLeague = (payload) => _postJson('/leagues', payload);
export const addLeagueTeam = (leagueId, team_id, seed) =>
  _postJson(`/leagues/${leagueId}/teams`, { team_id, seed });
export const removeLeagueTeam = (leagueId, teamId) =>
  fetch(`/api/leagues/${leagueId}/teams/${teamId}`, { method: 'DELETE', credentials: 'include' })
    .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(new Error(d.error || `HTTP ${r.status}`))));
export const generateLeagueBracket = (leagueId) =>
  _postJson(`/leagues/${leagueId}/generate-bracket`, {});
export const setLeagueMatchWinner = (leagueMatchId, payload) =>
  _postJson(`/league-matches/${leagueMatchId}/winner`, payload);
export const attachMatchToLeague = (matchId, payload) =>
  _postJson(`/matches/${matchId}/attach-league`,
    typeof payload === 'object' && payload !== null ? payload : { league_id: payload });
export const getActiveWeeklyChallenges = () => _getJson('/weekly-challenges/active');
export const getMyWeeklyChallenges = () => _getJson('/me/weekly-challenges').catch(() => ({ challenges: [] }));
export const claimWeeklyChallenge = (id) => _postJson(`/weekly-challenges/${id}/claim`, {});
export const adminCreateWeeklyChallenge = (payload) => _postJson('/admin/weekly-challenges', payload);
export const getActiveLimitedDrops = () => _getJson('/limited-drops/active');
export const adminListLimitedDrops = () => _getJson('/admin/limited-drops');
export const adminCreateLimitedDrop = (payload) => _postJson('/admin/limited-drops', payload);
export const adminDeactivateLimitedDrop = (id) => _postJson(`/admin/limited-drops/${id}/deactivate`, {});
export const giftCoins = ({ recipientAccountId, packId, anonymous, message }) =>
  _postJson('/gift/coins', { recipientAccountId, packId, anonymous, message });

// Task #440 — Daily / weekly quests + community challenges (full edition only)
export const getMyQuests = () =>
  _getJson('/me/quests').catch(() => ({ quests: [] }));
export const getActiveCommunityChallenges = () =>
  _getJson('/community-challenges/active').catch(() => ({ challenges: [] }));
export const getCommunityChallenge = (id) =>
  _getJson(`/community-challenges/${id}`);
export const adminListCommunityChallenges = (superuserKey) =>
  superuserJson('/admin/community-challenges', { superuserKey });
export const adminCreateCommunityChallenge = (superuserKey, payload) =>
  superuserJson('/admin/community-challenges', { method: 'POST', body: payload, superuserKey });
export const adminUpdateCommunityChallenge = (superuserKey, id, payload) =>
  superuserJson(`/admin/community-challenges/${id}`, { method: 'PATCH', body: payload, superuserKey });
export const adminDeleteCommunityChallenge = (superuserKey, id) =>
  superuserJson(`/admin/community-challenges/${id}`, { method: 'DELETE', superuserKey });

// ── Task #479 — Smoke-test runs (superuser) ────────────────────────────────
export const adminListSmokeTestRuns = (superuserKey) =>
  superuserJson('/admin/smoke-test/runs', { superuserKey });
export const adminStartSmokeTestRun = (superuserKey) =>
  superuserJson('/admin/smoke-test/runs', { method: 'POST', superuserKey });
export const adminGetSmokeTestRun = (superuserKey, id) =>
  superuserJson(`/admin/smoke-test/runs/${id}`, { superuserKey });
export const adminUpdateSmokeTestItem = (superuserKey, id, payload) =>
  superuserJson(`/admin/smoke-test/runs/${id}/items`, {
    method: 'PATCH', body: payload, superuserKey,
  });
export const adminUpdateSmokeTestOverallNotes = (superuserKey, id, notes) =>
  superuserJson(`/admin/smoke-test/runs/${id}/overall-notes`, {
    method: 'POST', body: { notes }, superuserKey,
  });
export const adminSubmitSmokeTestRun = (superuserKey, id) =>
  superuserJson(`/admin/smoke-test/runs/${id}/submit`, { method: 'POST', superuserKey });
export const adminSmokeTestRunExportUrl = (id) =>
  `/api/admin/smoke-test/runs/${id}/export.md`;

// ── Task #451 — Daily Dota mini-games suite ────────────────────────────────
export const getGamesHub = () => _getJson('/games');
export const getGameDaily = (game) => _getJson(`/games/${game}/daily`);
export const getGameEndless = (game) => _getJson(`/games/${game}/endless`);
export const getGameLeaderboard = (game) => _getJson(`/games/${game}/leaderboard`);
export async function submitGameGuess(game, payload) {
  const res = await fetch(`${BASE}/games/${game}/guess`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
export const gameImageUrl = (token) => `${BASE}/games/image?t=${encodeURIComponent(token)}`;
export const gameAudioUrl = (token) => `${BASE}/games/audio?t=${encodeURIComponent(token)}`;

// ── Task #699 — Notification test harness + background-job run-now center ──
export const adminGetNotifyTestTypes = (superuserKey) =>
  superuserJson('/admin/notify-test/types', { superuserKey });

export const adminSendNotifyTest = (superuserKey, type, targetAccountId) =>
  superuserJson('/admin/notify-test', {
    method: 'POST',
    body: { type, ...(targetAccountId ? { targetAccountId } : {}) },
    superuserKey,
  });

export const adminRunJob = (superuserKey, job, opts = {}) =>
  superuserJson(`/admin/jobs/run/${encodeURIComponent(job)}`, {
    method: 'POST',
    body: opts,
    superuserKey,
  });

export const getAdminEconomyPrices = (superuserKey) =>
  superuserJson('/admin/economy/prices', { superuserKey });

export const setAdminEconomyPrices = (overrides, superuserKey) =>
  superuserJson('/admin/economy/prices', {
    method: 'POST',
    body: { overrides },
    superuserKey,
  });

export const getAdminDmRecipients = (superuserKey, filter = null) =>
  superuserJson(
    `/admin/dm-recipients${filter ? `?filter=${encodeURIComponent(filter)}` : ''}`,
    { superuserKey }
  );

// Task #755 — kicks off a background blast and returns { ok, jobId, recipientCount }
// immediately. Poll getAdminDmBlastStatus for live progress and the final breakdown.
export const adminDmBlast = (superuserKey, message, accountIds) =>
  superuserJson('/admin/dm-blast', {
    method: 'POST',
    body: { message, accountIds },
    superuserKey,
  });

export const getAdminDmBlastStatus = (superuserKey) =>
  superuserJson('/admin/dm-blast/status', { superuserKey });

export const getAdminDmBlasts = (superuserKey, limit = 25) =>
  superuserJson(`/admin/dm-blasts?limit=${encodeURIComponent(limit)}`, { superuserKey });

// Staff role management (OWNER/superuser only).
export const getAdminRoles = (superuserKey) =>
  superuserJson('/admin/roles', { superuserKey });

export const setAdminRole = (superuserKey, accountId, role) =>
  superuserJson('/admin/roles', {
    method: 'POST',
    body: { accountId, role },
    superuserKey,
  });

export const removeAdminRole = (superuserKey, accountId) =>
  superuserJson(`/admin/roles/${encodeURIComponent(accountId)}`, {
    method: 'DELETE',
    superuserKey,
  });
