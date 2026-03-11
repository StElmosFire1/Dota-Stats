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

export async function uploadReplay(file, uploadKey) {
  const formData = new FormData();
  formData.append('replay', file);

  const res = await fetch(BASE + '/upload', {
    method: 'POST',
    headers: { 'X-Upload-Key': uploadKey },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

export async function getUploadStatus(jobId) {
  return fetchJson(`/upload/status/${jobId}`);
}
