const BASE = '/api';

// ── Superuser auto-recovery (Task #91 / #100) ───────────────────────────────
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
// this file but adds the auto-recovery loop. The body is passed through
// untouched, so FormData and string bodies both work — the wrapper does
// not auto-stringify.
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

// Task #537 — AI agent traffic report (superuser).
export async function getAgentTrafficReport(superuserKey, days = 7) {
  const qs = days ? `?days=${encodeURIComponent(days)}` : '';
  const res = await superuserFetch(BASE + `/admin/agent-traffic-report${qs}`, {
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
  const res = await fetch(BASE + url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `Request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}


function seasonParam(seasonId) {
  return seasonId ? `&season_id=${encodeURIComponent(seasonId)}` : '';
}

// Task #789 — opts.result ('win'|'loss', needs opts.accountId), opts.story
// (narrative label) are applied server-side across ALL matches so totals +
// pagination reflect the filtered set.
export async function getMatches(limit = 50, offset = 0, seasonId = null, opts = {}) {
  const { result, accountId, story } = opts;
  let qs = `/matches?limit=${limit}&offset=${offset}${seasonParam(seasonId)}`;
  if (result && result !== 'all') {
    qs += `&result=${encodeURIComponent(result)}`;
    if (accountId) qs += `&account_id=${encodeURIComponent(accountId)}`;
  }
  if (story && story !== 'all') qs += `&story=${encodeURIComponent(story)}`;
  return fetchJson(qs);
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

export async function getHeadToHead(a, b, seasonId = null) {
  const sp = seasonId ? `&season_id=${encodeURIComponent(seasonId)}` : '';
  return fetchJson(`/head-to-head?a=${a}&b=${b}${sp}`);
}

export async function getPlayerComparison(a, b, seasonId = null) {
  const sp = seasonId ? `&season_id=${encodeURIComponent(seasonId)}` : '';
  return fetchJson(`/compare?a=${a}&b=${b}${sp}`);
}


export async function getWeeklyRecap(seasonId = null) {
  const sp = seasonId ? `?season_id=${encodeURIComponent(seasonId)}` : '';
  return fetchJson(`/weekly-recap${sp}`);
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


export async function getPlayerForm(seasonId = null) {
  const q = seasonId ? `?season_id=${seasonId}` : '';
  return fetchJson(`/player-form${q}`);
}

export async function getPositionAverages(seasonId = null) {
  const q = seasonId ? `?season_id=${seasonId}` : '';
  return fetchJson(`/position-averages${q}`);
}

export async function getPlayerCommunityRatings(accountId) {
  return fetchJson(`/ratings/player/${accountId}`);
}

// Task #314 — post-match QOL bundle.
export async function getNemesisSpotlight(matchId) {
  const r = await fetch(`${BASE_URL}/matches/${encodeURIComponent(matchId)}/nemesis-spotlight`, { credentials: 'include' });
  if (r.status === 401) return { spotlight: null };
  if (!r.ok) throw new Error('Failed to fetch nemesis spotlight');
  return r.json();
}

export function recapCardUrl(matchId, { size = 'og', variant = 'classic', download = false } = {}) {
  const q = new URLSearchParams({ size, variant });
  if (download) q.set('download', '1');
  return `${BASE_URL}/matches/${encodeURIComponent(matchId)}/recap-card.png?${q.toString()}`;
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
  const res = await superuserFetch(BASE + '/ranks/sync', {
    method: 'POST',
    headers: { 'x-superuser-key': superuserKey },
  });
  const data = await res.json().catch(() => ({}));
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

// ── Profile chart v2 (1.4) ──────────────────────────────────────────────────
export async function getPlayerMatchStatsHistory(accountId, seasonId = null) {
  const url = `/player/${encodeURIComponent(accountId)}/match-stats-history${seasonId ? `?season=${seasonId}` : ''}`;
  return fetchJson(url);
}

