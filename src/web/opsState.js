// Task #406 — Server-side ops dashboard telemetry collector.
//
// Tiny in-memory state module that subsystems report into. Read by
// GET /api/admin/ops/state. Bounded memory: the log pane keeps the
// last N entries in a ring buffer; per-event-type Stripe webhook map
// is capped at 50 distinct event types (LRU-ish via Map insertion
// order). Nothing here is persisted — a process restart wipes it,
// which is intentional (this is a live operational view, not history).

const LOG_RING_SIZE = 100;
const STRIPE_EVENT_CAP = 50;
const HTTP_5XX_WINDOW_MS = 60 * 60 * 1000; // 60 min

const state = {
  parser: {
    ready: false,
    queueDepth: 0,
    lastParseMs: null,         // ms wall-clock of last finished parse
    lastParseDurationMs: null, // how long it took
    lastError: null,
    totalParsed: 0,
  },
  steam: {
    connected: false,
    lastLobbyEventAt: null,
    lastEvent: null,
    lastDisconnectReason: null,
  },
  discord: {
    connected: false,
    gatewayLatencyMs: null,
    lastEventAt: null,
  },
  stripeWebhooks: {
    // Map<eventType, { lastReceivedAt, lastProcessedAt, lastLagMs, count }>
    byType: new Map(),
    lastEventAt: null,
  },
  provisioner: {
    inFlight: [],            // session ids currently mid-provision
    lastSuccessAt: null,
    lastSuccessSessionId: null,
    lastFailureAt: null,
    lastFailureSessionId: null,
    lastFailureError: null,
  },
  push: {
    webPushReady: false,
    subscriptionCount: null, // refreshed on snapshot read
    lastDeliveryAt: null,
    lastDeliveryError: null,
  },
  // Ring buffer of 5xx response timestamps; we keep only timestamps so
  // the count over the last 60 min is a cheap filter.
  http5xx: [],
};

const logBuf = new Array(LOG_RING_SIZE);
let logHead = 0;
let logCount = 0;

function pushLog(source, level, message, extra = null) {
  const entry = {
    at: Date.now(),
    source: String(source || 'unknown'),
    level: String(level || 'info'),
    message: String(message == null ? '' : message).slice(0, 1000),
    extra: extra && typeof extra === 'object' ? extra : null,
  };
  logBuf[logHead] = entry;
  logHead = (logHead + 1) % LOG_RING_SIZE;
  if (logCount < LOG_RING_SIZE) logCount++;
}

function readLogs() {
  const out = [];
  for (let i = 0; i < logCount; i++) {
    const idx = (logHead - 1 - i + LOG_RING_SIZE) % LOG_RING_SIZE;
    const e = logBuf[idx];
    if (e) out.push(e);
  }
  return out; // newest first
}

// ── Reporters ─────────────────────────────────────────────────────────

function reportParser({ ready, queueDepth, parsedMs, error }) {
  const wasReady = state.parser.ready;
  if (typeof ready === 'boolean') {
    state.parser.ready = ready;
    if (wasReady && !ready) pushLog('parser', 'warn', 'parser went not-ready');
  }
  if (typeof queueDepth === 'number') state.parser.queueDepth = queueDepth;
  if (typeof parsedMs === 'number') {
    state.parser.lastParseDurationMs = parsedMs;
    state.parser.lastParseMs = Date.now();
    state.parser.totalParsed += 1;
  }
  if (error !== undefined) {
    state.parser.lastError = error ? String(error).slice(0, 500) : null;
    if (error) pushLog('parser', 'error', String(error).slice(0, 500));
  }
}

function reportSteam({ connected, event, disconnectReason }) {
  const wasConnected = state.steam.connected;
  if (typeof connected === 'boolean') {
    state.steam.connected = connected;
    if (wasConnected && !connected) pushLog('steam', 'warn', `steam disconnected${disconnectReason ? `: ${disconnectReason}` : ''}`);
    else if (!wasConnected && connected) pushLog('steam', 'info', 'steam connected');
  }
  if (event) {
    state.steam.lastEvent = String(event).slice(0, 80);
    state.steam.lastLobbyEventAt = Date.now();
  }
  if (disconnectReason !== undefined) {
    state.steam.lastDisconnectReason = disconnectReason ? String(disconnectReason).slice(0, 200) : null;
    if (disconnectReason) pushLog('steam', 'error', `steam error: ${disconnectReason}`);
  }
}

function reportDiscord({ connected, gatewayLatencyMs, event }) {
  const wasConnected = state.discord.connected;
  if (typeof connected === 'boolean') {
    state.discord.connected = connected;
    if (wasConnected && !connected) pushLog('discord', 'warn', 'discord gateway disconnected');
    else if (!wasConnected && connected) pushLog('discord', 'info', 'discord gateway connected');
  }
  if (typeof gatewayLatencyMs === 'number' && Number.isFinite(gatewayLatencyMs)) {
    state.discord.gatewayLatencyMs = Math.round(gatewayLatencyMs);
    if (gatewayLatencyMs > 1000) pushLog('discord', 'warn', `gateway latency ${Math.round(gatewayLatencyMs)} ms`);
  }
  if (event) state.discord.lastEventAt = Date.now();
}

function reportStripeWebhook(eventType, { receivedAt, processedAt } = {}) {
  if (!eventType) return;
  const now = Date.now();
  const r = receivedAt || now;
  const p = processedAt || now;
  const m = state.stripeWebhooks.byType;
  let entry = m.get(eventType);
  if (!entry) {
    if (m.size >= STRIPE_EVENT_CAP) {
      // Drop the oldest-inserted key.
      const firstKey = m.keys().next().value;
      if (firstKey) m.delete(firstKey);
    }
    entry = { lastReceivedAt: null, lastProcessedAt: null, lastLagMs: null, count: 0 };
    m.set(eventType, entry);
  }
  entry.lastReceivedAt = r;
  entry.lastProcessedAt = p;
  entry.lastLagMs = Math.max(0, p - r);
  entry.count += 1;
  state.stripeWebhooks.lastEventAt = p;
}

function reportProvisioner({ inFlight, success, failure }) {
  if (Array.isArray(inFlight)) state.provisioner.inFlight = inFlight.slice(0, 50);
  if (success && success.sessionId != null) {
    state.provisioner.lastSuccessAt = Date.now();
    state.provisioner.lastSuccessSessionId = success.sessionId;
    pushLog('provisioner', 'info', `provision succeeded for session #${success.sessionId}`);
  }
  if (failure && failure.sessionId != null) {
    state.provisioner.lastFailureAt = Date.now();
    state.provisioner.lastFailureSessionId = failure.sessionId;
    state.provisioner.lastFailureError = failure.error ? String(failure.error).slice(0, 300) : null;
    pushLog('provisioner', 'error', `provision failed for session #${failure.sessionId}: ${failure.error || 'unknown'}`);
  }
}

function reportPush({ webPushReady, delivered, error }) {
  if (typeof webPushReady === 'boolean') state.push.webPushReady = webPushReady;
  if (delivered) state.push.lastDeliveryAt = Date.now();
  if (error !== undefined) {
    state.push.lastDeliveryError = error ? String(error).slice(0, 300) : null;
    if (error) pushLog('push', 'error', `push delivery failed: ${error}`);
  }
}

function recordHttp5xx() {
  const now = Date.now();
  state.http5xx.push(now);
  // Trim anything outside the 60-min window so the array can't grow unbounded.
  const cutoff = now - HTTP_5XX_WINDOW_MS;
  while (state.http5xx.length && state.http5xx[0] < cutoff) state.http5xx.shift();
}

function _count5xx() {
  const cutoff = Date.now() - HTTP_5XX_WINDOW_MS;
  let n = 0;
  for (let i = state.http5xx.length - 1; i >= 0; i--) {
    if (state.http5xx[i] >= cutoff) n++;
    else break;
  }
  return n;
}

async function snapshot(db) {
  // Best-effort push-subscription count; degrade silently if the helper
  // isn't present in older db modules.
  let pushCount = null;
  try {
    if (db && typeof db.getPool === 'function') {
      const r = await db.getPool().query(`SELECT COUNT(*)::int AS c FROM web_push_subscriptions`);
      pushCount = r.rows[0]?.c ?? null;
    }
  } catch (_) { /* table may not exist on a fresh boot */ }

  const stripeByType = {};
  for (const [k, v] of state.stripeWebhooks.byType) {
    stripeByType[k] = { ...v };
  }

  return {
    now: Date.now(),
    parser: { ...state.parser },
    steam: { ...state.steam },
    discord: { ...state.discord },
    stripeWebhooks: {
      lastEventAt: state.stripeWebhooks.lastEventAt,
      byType: stripeByType,
    },
    provisioner: { ...state.provisioner },
    push: { ...state.push, subscriptionCount: pushCount },
    http: {
      count5xxLast60m: _count5xx(),
      windowMs: HTTP_5XX_WINDOW_MS,
    },
    logs: readLogs(),
  };
}

module.exports = {
  reportParser,
  reportSteam,
  reportDiscord,
  reportStripeWebhook,
  reportProvisioner,
  reportPush,
  recordHttp5xx,
  pushLog,
  snapshot,
};
