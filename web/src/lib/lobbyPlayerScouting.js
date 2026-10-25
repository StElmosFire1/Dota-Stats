const cache = new Map();

export function loadLobbyPlayerScouting(accountId) {
  const key = String(accountId);
  const existing = cache.get(key);
  if (existing && existing.until > Date.now()) return existing.promise;
  if (cache.size >= 100) cache.delete(cache.keys().next().value);
  const entry = { until: Date.now() + 60000 };
  entry.promise = fetch(`/api/inhouse/players/${encodeURIComponent(key)}/scouting`, { credentials: 'same-origin' })
    .then(async response => {
      if (!response.ok) throw new Error('Player details are temporarily unavailable.');
      return response.json();
    }).catch(error => {
      entry.until = Date.now() + 5000;
      throw error;
    });
  cache.set(key, entry);
  return entry.promise;
}
