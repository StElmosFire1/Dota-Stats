// Task #460 — Don't lose a mobile write-action when the network drops
// mid-tap.
//
// #414 deliberately left offline queueing out of scope: a tap on Accept
// while on flaky transit Wi-Fi just failed with a red error and the user
// had to re-open the (possibly already-expired) push. This module gives
// those write actions a durable, AsyncStorage-backed retry queue.
//
// Shape stored per intent is the `{ method, path, body }` triple plus the
// bookkeeping needed for TTL expiry and de-duplication. On a *network*
// failure (no HTTP response) the api client enqueues here and throws a
// `QueuedError`; a foreground drainer wired to NetInfo replays the queue
// the moment connectivity returns.
//
// Design notes:
//  - Only network-level failures queue. A real HTTP response (even a 4xx)
//    means the server saw the request, so we never queue those.
//  - Per-kind TTLs keep a stale intent from firing late — a queued
//    ready-check accept is useless once the accept window closes, so it
//    expires fast; less time-sensitive acks live longer.
//  - Drain is single-flight and order-preserving so "accept then decline"
//    replays in the order the user tapped.
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';

const STORAGE_KEY = 'oi.offline.queue.v1';

export type QueuedActionKind =
  | 'ready-check'
  | 'scrim'
  | 'mvp-vote'
  | 'roster-transfer'
  | 'booking-reminder';

export type QueuedAction = {
  id: string;
  kind: QueuedActionKind;
  method: string;
  path: string;
  body: string | null;
  enqueuedAt: number;
  expiresAt: number;
};

// Per-kind time-to-live (ms). Tuned so a replayed intent is still
// meaningful when it lands. Ready-check is the tightest because the
// server-side accept phase is short-lived.
const TTL_MS: Record<QueuedActionKind, number> = {
  'ready-check': 2 * 60_000, // 2 min — accept phase is timed
  'mvp-vote': 60 * 60_000, // 1 hour — post-match voting window
  'booking-reminder': 60 * 60_000, // 1 hour — reminder is hour-out
  'scrim': 6 * 60 * 60_000, // 6 hours
  'roster-transfer': 24 * 60 * 60_000, // 1 day
};

export function ttlForKind(kind: QueuedActionKind): number {
  return TTL_MS[kind] ?? 60 * 60_000;
}

// Thrown by the api client when a write was queued rather than sent. The
// action screens treat this as a soft "queued" outcome, not a hard error.
export class QueuedError extends Error {
  kind: QueuedActionKind;
  constructor(kind: QueuedActionKind) {
    super('Queued — will retry when online.');
    this.name = 'QueuedError';
    this.kind = kind;
  }
}

// ---------- Listener plumbing (lets the UI reflect pending count) ----------
type Listener = (count: number) => void;
const listeners = new Set<Listener>();
function emit(count: number) {
  for (const fn of listeners) {
    try { fn(count); } catch (_) {}
  }
}
export function subscribeQueue(fn: Listener): () => void {
  listeners.add(fn);
  // Fire once with the current count so subscribers don't start blind.
  readQueue().then((q) => fn(q.length)).catch(() => {});
  return () => { listeners.delete(fn); };
}

// ---------- Storage primitives ----------
async function readQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedAction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (_) {
    // If persistence fails we still keep the in-memory caller flow alive;
    // the worst case is the intent isn't retried after an app restart.
  }
  emit(items.length);
}

function dedupeKey(a: Pick<QueuedAction, 'method' | 'path' | 'body'>): string {
  return `${a.method} ${a.path} ${a.body ?? ''}`;
}

export async function getQueuedCount(): Promise<number> {
  return (await readQueue()).length;
}

// ---------- Enqueue ----------
export async function enqueueAction(input: {
  kind: QueuedActionKind;
  method: string;
  path: string;
  body?: string | null;
}): Promise<QueuedAction> {
  const now = Date.now();
  const action: QueuedAction = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    kind: input.kind,
    method: (input.method || 'POST').toUpperCase(),
    path: input.path,
    body: input.body ?? null,
    enqueuedAt: now,
    expiresAt: now + ttlForKind(input.kind),
  };
  const queue = await readQueue();
  // Replace an identical pending intent rather than stacking duplicates
  // (a user double-tapping Accept while offline shouldn't queue twice).
  const key = dedupeKey(action);
  const next = queue.filter((q) => dedupeKey(q) !== key);
  next.push(action);
  await writeQueue(next);
  return action;
}

// ---------- Drain ----------
// The replay function is injected by the api client to avoid a circular
// import. It returns:
//   'ok'    — server saw it (success OR a definitive HTTP rejection); drop.
//   'retry' — still offline / network failure; keep for the next pass.
export type ReplayResult = 'ok' | 'retry';
export type ReplayFn = (action: QueuedAction) => Promise<ReplayResult>;

let draining = false;

export type DrainSummary = { replayed: number; expired: number; kept: number };

export async function drainQueue(replay: ReplayFn): Promise<DrainSummary> {
  if (draining) return { replayed: 0, expired: 0, kept: 0 };
  draining = true;
  const summary: DrainSummary = { replayed: 0, expired: 0, kept: 0 };
  try {
    let queue = await readQueue();
    if (!queue.length) return summary;
    const now = Date.now();
    const survivors: QueuedAction[] = [];
    for (const action of queue) {
      if (action.expiresAt <= now) {
        summary.expired += 1;
        continue; // stale intent — drop without replaying
      }
      let result: ReplayResult;
      try {
        result = await replay(action);
      } catch {
        result = 'retry';
      }
      if (result === 'ok') {
        summary.replayed += 1;
      } else {
        // Network still down — stop draining; preserve this and the rest
        // in their original order for the next reconnect.
        survivors.push(action);
        const idx = queue.indexOf(action);
        survivors.push(...queue.slice(idx + 1));
        break;
      }
    }
    summary.kept = survivors.length;
    await writeQueue(survivors);
    return summary;
  } finally {
    draining = false;
  }
}

// ---------- Foreground auto-drainer ----------
// Wires NetInfo + AppState so the queue drains the moment connectivity is
// restored and again whenever the app returns to the foreground (covers
// the case where the NetInfo event fired while backgrounded). Returns an
// unsubscribe to tear everything down.
export function startQueueAutoDrain(replay: ReplayFn): () => void {
  let lastConnected: boolean | null = null;

  const tryDrain = () => { drainQueue(replay).catch(() => {}); };

  const netSub = NetInfo.addEventListener((state) => {
    const connected = !!state.isConnected && state.isInternetReachable !== false;
    // Only act on the transition into "connected" to avoid hammering the
    // queue on every NetInfo tick.
    if (connected && lastConnected !== true) tryDrain();
    lastConnected = connected;
  });

  const onAppState = (status: AppStateStatus) => {
    if (status === 'active') tryDrain();
  };
  const appSub = AppState.addEventListener('change', onAppState);

  // Kick once on startup in case we launched already-online with a backlog.
  tryDrain();

  return () => {
    try { netSub(); } catch (_) {}
    try { appSub.remove(); } catch (_) {}
  };
}
