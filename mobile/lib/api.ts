// Thin fetch wrapper for the read-only mobile companion app. All endpoints
// here MUST exist on the server (src/web/server.js); this client never
// guesses. Mutations are deliberately out of scope for the first cut —
// see mobile/README.md.
import Constants from 'expo-constants';
import { getSessionCookie } from './session';

const API_BASE: string =
  (Constants.expoConfig?.extra as any)?.apiBase || 'https://oceinhouse.gg';

export function apiBase(): string {
  return API_BASE;
}

type FetchOpts = RequestInit & { auth?: boolean };

async function request<T = any>(path: string, opts: FetchOpts = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (opts.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  // The mobile app stores the express-session cookie in SecureStore after
  // POST /api/auth/complete returns it. We re-attach it manually here
  // because React Native's fetch does not persist cookies the way a
  // browser does.
  const cookie = await getSessionCookie();
  if (cookie) headers['Cookie'] = cookie;

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const ct = res.headers.get('content-type') || '';
  const isJson = ct.includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    const msg = (isJson && (payload as any)?.error) || res.statusText || 'Request failed';
    throw new Error(`[${res.status}] ${msg}`);
  }
  return payload as T;
}

// ---------- Read-only endpoints (mirror of web/src/api.js) ----------
export const api = {
  getMatches: (limit = 50, offset = 0) =>
    request<{ matches: any[]; total: number }>(
      `/api/matches?limit=${limit}&offset=${offset}`
    ),
  getMatch: (matchId: string | number) =>
    request<any>(`/api/match/${matchId}`),
  getLeaderboard: (limit = 100) =>
    request<{ players: any[] }>(`/api/leaderboard?limit=${limit}`),
  getPlayer: (accountId: string | number) =>
    request<any>(`/api/player/${accountId}`),
  getHomeStats: () => request<any>(`/api/home/stats`).catch(() => null),

  // ---------- Auth ----------
  // Trades the short-lived token from /auth/steam/return?t=... for a
  // session cookie. The server exposes this as a single-use GET (see
  // `router.get('/auth/complete', ...)` in src/web/server.js — mounted
  // under /api) so the website can same-origin-fetch it. We capture the
  // Set-Cookie header here so it can be stashed in SecureStore by the
  // caller; React Native does not implement a cookie jar.
  authComplete: async (token: string) => {
    const res = await fetch(
      `${API_BASE}/api/auth/complete?t=${encodeURIComponent(token)}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Auth complete failed [${res.status}]: ${body.slice(0, 200)}`);
    }
    const setCookie = res.headers.get('set-cookie') || '';
    const json = await res.json().catch(() => ({}));
    return { setCookie, body: json };
  },

  authMe: () => request<any>(`/api/auth/me`),
  authLogout: () => request<any>(`/api/auth/logout`, { method: 'POST' }),

  // ---------- Notifications + Expo push ----------
  getNotificationPrefs: () =>
    request<{ categories: any[] }>(`/api/me/notifications`),
  setNotificationPrefs: (updates: { category: string; enabled: boolean; value?: number }[]) =>
    request<{ ok: true; categories: any[] }>(`/api/me/notifications`, {
      method: 'POST',
      body: JSON.stringify({ updates }),
    }),
  registerExpoPushToken: (token: string, extra: { platform?: 'ios' | 'android'; app_version?: string; device_label?: string } = {}) =>
    request<{ ok: true }>(`/api/me/expo-push/register`, {
      method: 'POST',
      body: JSON.stringify({ token, ...extra }),
    }),
  unregisterExpoPushToken: (token: string) =>
    request<{ ok: true }>(`/api/me/expo-push/unregister`, {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  testExpoPush: () =>
    request<{ ok: true; sent: number; removed: number }>(`/api/me/expo-push/test`, {
      method: 'POST',
    }),
};
