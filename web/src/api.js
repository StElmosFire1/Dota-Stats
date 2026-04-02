const BASE = '/api';

export async function getPatchNotes() {
  return fetchJson('/patch-notes');
}

export async function getPatchNote(id) {
  return fetchJson(`/patch-notes/${id}`);
}

export async function createPatchNote({ version, title, content, author }, superuserKey) {
  const res = await fetch(BASE + '/patch-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': superuserKey },
    body: JSON.stringify({ version, title, content, author }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create patch note');
  return data;
}

export async function updatePatchNote(id, { version, title, content, author }, superuserKey) {
  const res = await fetch(BASE + `/patch-notes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': superuserKey },
    body: JSON.stringify({ version, title, content, author }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update patch note');
  return data;
}

export async function deletePatchNote(id, superuserKey) {
  const res = await fetch(BASE + `/patch-notes/${id}`, {
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
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return res.json();
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
  const res = await fetch(BASE + `/nicknames/${accountId}`, {
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
  const res = await fetch(BASE + `/players/${accountId}/discord`, {
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
  const res = await fetch(BASE + `/seasons/${seasonId}`, {
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
  const res = await fetch(BASE + '/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': superuserKey },
    body: JSON.stringify({ scheduled_at: scheduledAt, note }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to schedule game');
  return data;
}

export async function cancelScheduledGame(id, superuserKey) {
  const res = await fetch(BASE + `/schedule/${id}`, {
    method: 'DELETE',
    headers: { 'X-Superuser-Key': superuserKey },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to cancel game');
  return data;
}

export async function getPlayerCommunityRatings(accountId) {
  return fetchJson(`/ratings/player/${accountId}`);
}

export async function getMatchRatings(matchId) {
  return fetchJson(`/ratings/match/${matchId}`);
}

export async function getStoredReplays(superuserKey) {
  const res = await fetch(BASE + '/replays/stored', {
    headers: { 'x-superuser-key': superuserKey },
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Request failed: ${res.status}`); }
  return res.json();
}

export async function extendReplayExpiry(matchId, days, superuserKey) {
  const res = await fetch(BASE + `/replays/${matchId}/extend`, {
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
  const res = await fetch(BASE + '/tournaments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify(data),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
  return res.json();
}

export async function addTournamentParticipant(tournamentId, accountId, superuserKey) {
  const res = await fetch(BASE + `/tournaments/${tournamentId}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ accountId }),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
  return res.json();
}

export async function removeTournamentParticipant(tournamentId, accountId, superuserKey) {
  const res = await fetch(BASE + `/tournaments/${tournamentId}/participants/${accountId}`, {
    method: 'DELETE',
    headers: { 'x-superuser-key': superuserKey },
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
  return res.json();
}

export async function generateTournamentBracket(tournamentId, superuserKey) {
  const res = await fetch(BASE + `/tournaments/${tournamentId}/generate`, {
    method: 'POST',
    headers: { 'x-superuser-key': superuserKey },
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
  return res.json();
}

export async function setTournamentMatchWinner(matchId, winnerId, superuserKey) {
  const res = await fetch(BASE + `/tournament-matches/${matchId}/winner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
    body: JSON.stringify({ winnerId }),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
  return res.json();
}

export async function clearTournamentMatchWinner(matchId, superuserKey) {
  const res = await fetch(BASE + `/tournament-matches/${matchId}/winner`, {
    method: 'DELETE',
    headers: { 'x-superuser-key': superuserKey },
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
  return res.json();
}

export async function deleteTournament(id, superuserKey) {
  const res = await fetch(BASE + `/tournaments/${id}`, {
    method: 'DELETE',
    headers: { 'x-superuser-key': superuserKey },
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
  return res.json();
}
