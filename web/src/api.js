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

function _findHeader(headers, name) {
  const lower = name.toLowerCase();
  return Object.keys(headers).some(k => k.toLowerCase() === lower);
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
export async function getProMembers() {
  return fetchJson('/pro/members');
}
export async function createProCheckout() {
  const res = await fetch(BASE + '/pro/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Checkout failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data; // { url }
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

export async function getHeroStats(seasonId = null) {
  return fetchJson(`/heroes?x=1${seasonParam(seasonId)}`);
}

export async function getHeroTierList(seasonId = null) {
  const q = seasonId ? `?season=${seasonId}` : '';
  return fetchJson(`/heroes/tier-list${q}`);
}

export async function getPlayerHeroSuggestions(accountId, seasonId = null) {
  const q = seasonId ? `?season=${seasonId}` : '';
  return fetchJson(`/player/${accountId}/hero-suggestions${q}`);
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
