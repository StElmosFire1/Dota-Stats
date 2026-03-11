const BASE = '/api';

async function fetchJson(url) {
  const res = await fetch(BASE + url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function getMatches(limit = 50, offset = 0) {
  return fetchJson(`/matches?limit=${limit}&offset=${offset}`);
}

export async function getMatch(matchId) {
  return fetchJson(`/matches/${matchId}`);
}

export async function getLeaderboard(limit = 50) {
  return fetchJson(`/leaderboard?limit=${limit}`);
}

export async function getPlayer(accountId) {
  return fetchJson(`/players/${accountId}`);
}

const CHUNK_SIZE = 4 * 1024 * 1024;

export async function uploadReplayChunked(file, uploadKey, onProgress) {
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
    }),
  });
  const initData = await initRes.json();
  if (!initRes.ok) throw new Error(initData.error || 'Failed to initialize upload');

  const { jobId } = initData;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const percent = Math.round(((i + 1) / totalChunks) * 90);
    onProgress({
      phase: 'uploading',
      percent,
      detail: `Uploading chunk ${i + 1}/${totalChunks}...`,
      chunksUploaded: i + 1,
      totalChunks,
    });

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
