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
    successTotal: 0,         // cumulative since boot — Task #423 history deltas
    failureTotal: 0,
  },
  push: {
    webPushReady: false,
    subscriptionCount: null, // refreshed on snapshot read
    lastDeliveryAt: null,
    lastDeliveryError: null,
  },
  // Task #778 — dedicated-server crash watchdog. The serverHealthMonitor
  // pings RCON on a fixed interval; this surfaces "last healthy at" + the
  // most recent auto-restart outcome to the admin panel.
  serverHealth: {
    monitoring: false,
    lastCheckAt: null,
    lastHealthyAt: null,
    lastError: null,
    consecutiveFailures: 0,
    lastRestartAt: null,
    lastRestartOk: null,
    lastRestartError: null,
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
    state.provisioner.successTotal += 1;
    pushLog('provisioner', 'info', `provision succeeded for session #${success.sessionId}`);
  }
  if (failure && failure.sessionId != null) {
    state.provisioner.lastFailureAt = Date.now();
    state.provisioner.lastFailureSessionId = failure.sessionId;
    state.provisioner.lastFailureError = failure.error ? String(failure.error).slice(0, 300) : null;
    state.provisioner.failureTotal += 1;
    pushLog('provisioner', 'error', `provision failed for session #${failure.sessionId}: ${failure.error || 'unknown'}`);
  }
}

function reportServerHealth({ monitoring, checked, ok, error, consecutiveFailures, restartAttempt } = {}) {
  if (typeof monitoring === 'boolean') state.serverHealth.monitoring = monitoring;
  if (checked) {
    state.serverHealth.lastCheckAt = Date.now();
    if (ok) {
      state.serverHealth.lastHealthyAt = Date.now();
      state.serverHealth.lastError = null;
    } else if (error !== undefined) {
      state.serverHealth.lastError = error ? String(error).slice(0, 300) : null;
    }
  }
  if (typeof consecutiveFailures === 'number') state.serverHealth.consecutiveFailures = consecutiveFailures;
  if (restartAttempt) {
    state.serverHealth.lastRestartAt = Date.now();
    state.serverHealth.lastRestartOk = !!restartAttempt.ok;
    state.serverHealth.lastRestartError = restartAttempt.error ? String(restartAttempt.error).slice(0, 300) : null;
    pushLog('serverHealth', restartAttempt.ok ? 'warn' : 'error',
      `auto-restart ${restartAttempt.ok ? 'issued' : 'failed'}${restartAttempt.error ? `: ${restartAttempt.error}` : ''}`);
  }
}

function getServerHealth() {
  return { ...state.serverHealth };
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
    serverHealth: { ...state.serverHealth },
    push: { ...state.push, subscriptionCount: pushCount },
    http: {
      count5xxLast60m: _count5xx(),
      windowMs: HTTP_5XX_WINDOW_MS,
    },
    logs: readLogs(),
  };
}

// ── Task #423 — Persisted rolling history ────────────────────────────
//
// The in-memory state above evaporates on restart, so the live dashboard
// can't show "was last night's parser slowness new?". `ensureHistoryTable`
// is idempotent and called from `captureHistorySnapshot` so we don't need
// to thread it through db.init(). We keep ~7 days of 1-minute samples
// and prune on every write — a 7-day window at 60s cadence is 10,080
// rows, comfortably small.
const HISTORY_RETAIN_DAYS = 7;
let _historyTableReady = false;

async function ensureHistoryTable(db) {
  if (_historyTableReady) return;
  const p = db.getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS ops_metrics (
      ts                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      http_5xx_60m                INTEGER NOT NULL DEFAULT 0,
      parser_queue_depth          INTEGER NOT NULL DEFAULT 0,
      parser_last_duration_ms     INTEGER,
      parser_ready                BOOLEAN NOT NULL DEFAULT false,
      stripe_max_lag_ms           INTEGER,
      provisioner_in_flight       INTEGER NOT NULL DEFAULT 0,
      provisioner_success_total   INTEGER NOT NULL DEFAULT 0,
      provisioner_failure_total   INTEGER NOT NULL DEFAULT 0,
      discord_gateway_latency_ms  INTEGER,
      push_subscription_count     INTEGER
    )
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_ops_metrics_ts ON ops_metrics (ts DESC)`);
  _historyTableReady = true;
}

function _stripeMaxLagMs() {
  let max = null;
  for (const v of state.stripeWebhooks.byType.values()) {
    if (v.lastLagMs != null && (max == null || v.lastLagMs > max)) max = v.lastLagMs;
  }
  return max;
}

async function captureHistorySnapshot(db) {
  if (!db || typeof db.getPool !== 'function') return null;
  try {
    await ensureHistoryTable(db);
    const p = db.getPool();
    let pushCount = null;
    try {
      const r = await p.query(`SELECT COUNT(*)::int AS c FROM web_push_subscriptions`);
      pushCount = r.rows[0]?.c ?? null;
    } catch (_) { /* table may not exist yet */ }

    await p.query(
      `INSERT INTO ops_metrics (
        http_5xx_60m, parser_queue_depth, parser_last_duration_ms, parser_ready,
        stripe_max_lag_ms, provisioner_in_flight, provisioner_success_total,
        provisioner_failure_total, discord_gateway_latency_ms, push_subscription_count
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        _count5xx(),
        state.parser.queueDepth | 0,
        state.parser.lastParseDurationMs != null ? Math.round(state.parser.lastParseDurationMs) : null,
        !!state.parser.ready,
        _stripeMaxLagMs(),
        state.provisioner.inFlight.length | 0,
        state.provisioner.successTotal | 0,
        state.provisioner.failureTotal | 0,
        state.discord.gatewayLatencyMs != null ? Math.round(state.discord.gatewayLatencyMs) : null,
        pushCount,
      ],
    );
    await p.query(
      `DELETE FROM ops_metrics WHERE ts < NOW() - INTERVAL '${HISTORY_RETAIN_DAYS} days'`,
    );
    return true;
  } catch (e) {
    // History is best-effort — never let it surface as a 500 or crash the tick.
    pushLog('ops', 'warn', `history snapshot failed: ${e.message}`);
    return false;
  }
}

async function readHistory(db, { hours = 24 } = {}) {
  if (!db || typeof db.getPool !== 'function') return [];
  const h = Math.max(1, Math.min(24 * HISTORY_RETAIN_DAYS, Number(hours) || 24));
  await ensureHistoryTable(db);
  const p = db.getPool();
  const r = await p.query(
    `SELECT
       EXTRACT(EPOCH FROM ts) * 1000 AS ts_ms,
       http_5xx_60m,
       parser_queue_depth,
       parser_last_duration_ms,
       parser_ready,
       stripe_max_lag_ms,
       provisioner_in_flight,
       provisioner_success_total,
       provisioner_failure_total,
       discord_gateway_latency_ms,
       push_subscription_count
     FROM ops_metrics
     WHERE ts >= NOW() - ($1 || ' hours')::INTERVAL
     ORDER BY ts ASC`,
    [String(h)],
  );
  return r.rows.map(row => ({
    ts: Math.round(Number(row.ts_ms)),
    http5xx: row.http_5xx_60m,
    parserQueueDepth: row.parser_queue_depth,
    parserLastDurationMs: row.parser_last_duration_ms,
    parserReady: row.parser_ready,
    stripeMaxLagMs: row.stripe_max_lag_ms,
    provisionerInFlight: row.provisioner_in_flight,
    provisionerSuccessTotal: row.provisioner_success_total,
    provisionerFailureTotal: row.provisioner_failure_total,
    discordGatewayLatencyMs: row.discord_gateway_latency_ms,
    pushSubscriptionCount: row.push_subscription_count,
  }));
}

module.exports = {
  reportParser,
  reportSteam,
  reportDiscord,
  reportStripeWebhook,
  reportProvisioner,
  reportServerHealth,
  getServerHealth,
  reportPush,
  recordHttp5xx,
  pushLog,
  snapshot,
  captureHistorySnapshot,
  readHistory,
  HISTORY_RETAIN_DAYS,
};
