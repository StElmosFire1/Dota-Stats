import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

it('coalesces simultaneous hovers and reuses successful scouting responses', async () => {
  vi.resetModules();
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ bestHeroes: [] }) });
  vi.stubGlobal('fetch', fetcher);
  const { loadLobbyPlayerScouting } = await import('../lobbyPlayerScouting');
  const [one, two] = await Promise.all([loadLobbyPlayerScouting(42), loadLobbyPlayerScouting('42')]);
  expect(one).toEqual(two);
  await loadLobbyPlayerScouting(42);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('/api/inhouse/players/42/scouting');
});

it('caches short-lived failures rather than hammering the endpoint on every mouse move', async () => {
  vi.resetModules();
  const fetcher = vi.fn().mockResolvedValue({ ok: false });
  vi.stubGlobal('fetch', fetcher);
  const { loadLobbyPlayerScouting } = await import('../lobbyPlayerScouting');
  await expect(loadLobbyPlayerScouting(42)).rejects.toThrow('temporarily unavailable');
  await expect(loadLobbyPlayerScouting(42)).rejects.toThrow('temporarily unavailable');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
