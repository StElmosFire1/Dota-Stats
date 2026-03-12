const BASE = '/api';

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

export async function updateMatchMeta(matchId, { patch, seasonId }, uploadKey) {
  const res = await fetch(BASE + `/matches/${matchId}/meta`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Upload-Key': uploadKey,
    },
    body: JSON.stringify({ patch, seasonId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update match');
  return data;
}

export async function getLeaderboard(limit = 50) {
  return fetchJson(`/leaderboard?limit=${limit}`);
}

export async function getPlayer(accountId) {
  return fetchJson(`/players/${accountId}`);
}

export async function getAllPlayers(seasonId = null) {
  return fetchJson(`/players?x=1${seasonParam(seasonId)}`);
}

export async function getHeroStats(seasonId = null) {
  return fetchJson(`/heroes?x=1${seasonParam(seasonId)}`);
}

export async function getHeroPlayers(heroId) {
  return fetchJson(`/heroes/${heroId}/players`);
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

export async function getPlayerPositions(accountId) {
  return fetchJson(`/players/${accountId}/positions`);
}

export async function getNicknames() {
  return fetchJson('/nicknames');
}

export async function setNickname(accountId, nickname, uploadKey) {
  const res = await fetch(BASE + `/nicknames/${accountId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Upload-Key': uploadKey,
    },
    body: JSON.stringify({ nickname }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to set nickname');
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

const CHUNK_SIZE = 5 * 1024 * 1024;
const PARALLEL_UPLOADS = 3;

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
        const chunkRes = await fetch(BASE + `/upload/chunk/${jobId}`, {
          method: 'POST',
          headers: {
            'X-Upload-Key': uploadKey,
            'X-Chunk-Index': String(i),
            'Content-Type': 'application/octet-stream',
          },
          body: chunk,
        });
        if (!chunkRes.ok) {
          const errData = await chunkRes.json().catch(() => ({}));
          throw new Error(errData.error || `Chunk ${i} upload failed`);
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
