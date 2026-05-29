// Thin fetch wrapper for the read-only mobile companion app. All endpoints
// here MUST exist on the server (src/web/server.js); this client never
// guesses. Mutations are deliberately out of scope for the first cut —
// see mobile/README.md.
import Constants from 'expo-constants';
import { getSessionCookie } from './session';
import {
  enqueueAction,
  QueuedError,
  startQueueAutoDrain,
  type QueuedAction,
  type QueuedActionKind,
  type ReplayResult,
} from './offlineQueue';

const API_BASE: string =
  (Constants.expoConfig?.extra as any)?.apiBase || 'https://oceinhouse.gg';

export function apiBase(): string {
  return API_BASE;
}

// `queue` opts in a write action to the Task #460 offline retry queue. When
// set, a network-level failure (no HTTP response) persists the
// `{ method, path, body }` triple and throws a `QueuedError` instead of a
// raw network error, so the screen can show "Queued — will retry when
// online".
type FetchOpts = RequestInit & { auth?: boolean; queue?: { kind: QueuedActionKind } };

// Task #414 — single, app-wide 401 handler. The session-expiry modal in
// app/_layout.tsx subscribes here; every write-action screen routes its
// fetches through `request()` so when the express-session cookie has
// expired we surface a reauth prompt exactly once per drop instead of
// every screen rolling its own error UI. Pluggable so unit tests don't
// need a React tree.
type UnauthorizedHandler = () => void;
let _onUnauthorized: UnauthorizedHandler | null = null;
export function setOnUnauthorized(fn: UnauthorizedHandler | null) {
  _onUnauthorized = fn;
}

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(message: string, status: number, body: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T = any>(path: string, opts: FetchOpts = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (opts.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  // We re-attach the express-session cookie manually here because React
  // Native's fetch does not persist cookies the way a browser does. The
  // cookie is captured from /api/auth/complete's Set-Cookie response
  // header and stored in expo-secure-store.
  const cookie = await getSessionCookie();
  if (cookie) headers['Cookie'] = cookie;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  } catch (netErr) {
    // No HTTP response at all — offline, DNS failure, or a dropped
    // connection mid-tap. If this is a queueable write, persist the intent
    // and surface it as "queued" rather than a hard error (Task #460).
    if (opts.queue) {
      await enqueueAction({
        kind: opts.queue.kind,
        method: (opts.method as string) || 'POST',
        path,
        body: typeof opts.body === 'string' ? opts.body : null,
      });
      throw new QueuedError(opts.queue.kind);
    }
    throw netErr;
  }
  const ct = res.headers.get('content-type') || '';
  const isJson = ct.includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    const msg = (isJson && (payload as any)?.error) || res.statusText || 'Request failed';
    if (res.status === 401 && _onUnauthorized) {
      try { _onUnauthorized(); } catch (_) {}
    }
    throw new ApiError(msg, res.status, payload);
  }
  return payload as T;
}

// ---------- Read-only endpoints (mirror of web/src/api.js) ----------
// Route shapes verified against src/web/server.js — every path here is
// real. Earlier drafts used singular variants (/api/match/:id,
// /api/player/:id, /api/home/stats) that do NOT exist on the server,
// which would have produced silent 404s in the UI.
export const api = {
  getMatches: (limit = 50, offset = 0) =>
    request<{ matches: any[]; total: number; limit: number; offset: number }>(
      `/api/matches?limit=${limit}&offset=${offset}`
    ),
  getMatch: (matchId: string | number) =>
    request<any>(`/api/matches/${matchId}`),
  // Server returns `{ leaderboard, useV3: true }` (see /api/leaderboard
  // in src/web/server.js). We normalise to a plain array so callers don't
  // have to know about the legacy `players` / array shapes that earlier
  // builds returned.
  getLeaderboard: async (limit = 100): Promise<any[]> => {
    const r = await request<any>(`/api/leaderboard?limit=${limit}`);
    if (Array.isArray(r)) return r;
    return r?.leaderboard || r?.players || [];
  },
  getPlayer: (accountId: string | number) =>
    request<any>(`/api/players/${accountId}`),
  getPlayerRecentMatches: (accountId: string | number, limit = 5) =>
    request<{ account_id: string; matches: any[] }>(
      `/api/players/${accountId}/recent-matches?limit=${limit}`
    ),
  getPlayerStreak: (accountId: string | number) =>
    request<any>(`/api/players/${accountId}/streak`).catch(() => null),
  getHomeStats: () => request<any>(`/api/home-stats`).catch(() => null),

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

  // ---------- Task #414 — write actions ----------
  // All routes below already accept the mobile session cookie (see audit
  // in mobile/README.md). Two server-side endpoints were added in #414:
  // POST /api/matches/:id/mvp-vote and POST /api/bookings/:id/reminder-ack.
  // The rest pre-existed for the web app.
  inhouseAccept: (sessionId: string | number) =>
    request<{ player: any }>(`/api/inhouse/${sessionId}/accept`, { method: 'POST', queue: { kind: 'ready-check' } }),
  inhouseDecline: (sessionId: string | number) =>
    request<{ player: any }>(`/api/inhouse/${sessionId}/decline`, { method: 'POST', queue: { kind: 'ready-check' } }),
  castMvpVote: (matchId: string | number, ratedAccountId: string | number) =>
    request<{ ok: true; match_id: number; rated_account_id: string }>(
      `/api/matches/${matchId}/mvp-vote`,
      { method: 'POST', body: JSON.stringify({ rated_account_id: String(ratedAccountId) }), queue: { kind: 'mvp-vote' } }
    ),
  respondScrim: (scrimId: string | number, accept: boolean) =>
    request<{ scrim: any }>(`/api/scrims/${scrimId}/respond`, {
      method: 'POST', body: JSON.stringify({ accept }), queue: { kind: 'scrim' },
    }),
  respondRosterTransfer: (transferId: string | number, approve: boolean) =>
    request<any>(`/api/roster-transfers/${transferId}/respond`, {
      method: 'POST', body: JSON.stringify({ approve }), queue: { kind: 'roster-transfer' },
    }),
  bookCoach: (coachId: string | number, body: {
    slot_start_at: string;
    duration_minutes?: number;
    use_plan?: boolean;
  }) =>
    request<{ url: string | null; booking_id?: number; plan_redeemed?: boolean }>(
      `/api/coaches/${coachId}/book`,
      { method: 'POST', body: JSON.stringify(body) }
    ),
  requestVodReview: (coachId: string | number, body: {
    match_id?: string | number;
    replay_url?: string;
    question: string;
    price_cents?: number;
    use_plan?: boolean;
  }) =>
    request<{ url: string | null; review_id?: number; plan_redeemed?: boolean }>(
      `/api/coaches/${coachId}/vod-review`,
      { method: 'POST', body: JSON.stringify(body) }
    ),
  ackBookingReminder: (bookingId: string | number) =>
    request<{ ok: true; booking: any }>(`/api/bookings/${bookingId}/reminder-ack`, {
      method: 'POST', queue: { kind: 'booking-reminder' },
    }),

  // Read-side helpers used by action screens for context (player names etc).
  getCoach: (coachId: string | number) =>
    request<any>(`/api/coaches/${coachId}`).catch(() => null),

  // ---------- Task #459 — Inbox ----------
  // Single fetch that aggregates every actionable item awaiting the signed-in
  // account. Each row carries { kind, id } so the inbox screen can deep-link
  // to the matching /action/<kind>/<id> screen built in #414.
  getPendingActions: () =>
    request<{ actions: PendingAction[]; count: number }>(`/api/me/pending-actions`),
};

export type PendingActionKind =
  | 'ready-check'
  | 'scrim'
  | 'roster-transfer'
  | 'mvp-vote'
  | 'booking-reminder';

export type PendingAction = {
  kind: PendingActionKind;
  id: string;
  title: string;
  subtitle?: string;
  [extra: string]: any;
};

// ---------- Task #460 — offline queue replay ----------
// Re-sends a previously-queued write. Deliberately bypasses the `queue`
// opt so a still-offline replay doesn't re-enqueue the same intent — the
// drainer keeps it on a 'retry' result instead. Any HTTP response (even a
// 4xx) counts as delivered: the server saw the request, so we drop it.
async function replayQueuedAction(action: QueuedAction): Promise<ReplayResult> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (action.body) headers['Content-Type'] = 'application/json';
  const cookie = await getSessionCookie();
  if (cookie) headers['Cookie'] = cookie;
  try {
    const res = await fetch(`${API_BASE}${action.path}`, {
      method: action.method,
      headers,
      body: action.body ?? undefined,
    });
    if (res.status === 401 && _onUnauthorized) {
      try { _onUnauthorized(); } catch (_) {}
    }
    return 'ok';
  } catch (_) {
    return 'retry'; // still no connection — keep for the next pass
  }
}

// Starts the foreground retry loop (NetInfo + AppState driven). Call once
// from the root layout; returns an unsubscribe.
export function startOfflineQueue(): () => void {
  return startQueueAutoDrain(replayQueuedAction);
}

export { QueuedError } from './offlineQueue';
export { getQueuedCount, subscribeQueue } from './offlineQueue';
