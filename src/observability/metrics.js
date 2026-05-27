// Task #417 — OpenTelemetry metrics.
//
// Thin wrapper around the OTel Meter API. Safe to call before/without the
// SDK being started — falls back to a no-op meter so callers never need a
// gate. Counters and histograms here are exported to the OTLP endpoint
// configured in observability/otel.js.

'use strict';

let _meter = null;
function _getMeter() {
  if (_meter) return _meter;
  try {
    const api = require('@opentelemetry/api');
    _meter = api.metrics.getMeter('oi-bot', '1.0.0');
  } catch (_) {
    // No-op meter that returns no-op instruments.
    const noop = { add() {}, record() {} };
    _meter = {
      createCounter() { return noop; },
      createHistogram() { return noop; },
      createUpDownCounter() { return noop; },
    };
  }
  return _meter;
}

// Lazy instrument cache so the meter is only created on first use (after
// SDK start).
const _cache = {};
function _counter(name, opts) {
  if (!_cache[name]) _cache[name] = _getMeter().createCounter(name, opts);
  return _cache[name];
}
function _histogram(name, opts) {
  if (!_cache[name]) _cache[name] = _getMeter().createHistogram(name, opts);
  return _cache[name];
}
function _upDown(name, opts) {
  if (!_cache[name]) _cache[name] = _getMeter().createUpDownCounter(name, opts);
  return _cache[name];
}

// ── HTTP request metrics ─────────────────────────────────────────────────
function recordHttpRequest({ method, route, status, durationMs }) {
  const attrs = {
    method: String(method || 'GET').toUpperCase(),
    route: String(route || 'unknown'),
    status: Number(status) || 0,
  };
  _counter('http.server.request.count', {
    description: 'HTTP requests handled, by method/route/status',
  }).add(1, attrs);
  _histogram('http.server.request.duration_ms', {
    description: 'HTTP request duration (ms)',
    unit: 'ms',
  }).record(Number(durationMs) || 0, attrs);
}

// ── Parser metrics ───────────────────────────────────────────────────────
function recordParse({ durationMs, ok }) {
  _histogram('parser.parse.duration_ms', {
    description: 'Replay parse duration (ms)',
    unit: 'ms',
  }).record(Number(durationMs) || 0, { ok: ok !== false });
  _counter('parser.parse.count', {
    description: 'Replay parses, by outcome',
  }).add(1, { ok: ok !== false });
}
function updateParserQueueDepth(depth) {
  // UpDownCounter is the natural fit but we want an absolute gauge. We
  // emulate it by tracking last value and delta-add.
  const cur = Number(depth) || 0;
  if (typeof updateParserQueueDepth._last !== 'number') updateParserQueueDepth._last = 0;
  const delta = cur - updateParserQueueDepth._last;
  if (delta !== 0) {
    _upDown('parser.queue.depth', {
      description: 'In-flight replay parses',
    }).add(delta);
  }
  updateParserQueueDepth._last = cur;
}

// ── Stripe metrics ───────────────────────────────────────────────────────
function recordStripeCall({ op, durationMs, ok }) {
  const attrs = { op: String(op || 'unknown'), ok: ok !== false };
  _counter('stripe.call.count', {
    description: 'Stripe SDK calls, by op + outcome',
  }).add(1, attrs);
  _histogram('stripe.call.duration_ms', {
    description: 'Stripe SDK call latency (ms)',
    unit: 'ms',
  }).record(Number(durationMs) || 0, attrs);
}

// ── Stripe webhook lag ───────────────────────────────────────────────────
function recordStripeWebhook({ eventType, lagMs }) {
  const attrs = { event_type: String(eventType || 'unknown') };
  _counter('stripe.webhook.count', {
    description: 'Stripe webhooks processed, by event type',
  }).add(1, attrs);
  if (typeof lagMs === 'number' && Number.isFinite(lagMs)) {
    _histogram('stripe.webhook.lag_ms', {
      description: 'Webhook processing lag (received → handled)',
      unit: 'ms',
    }).record(Math.max(0, lagMs), attrs);
  }
}

// ── Discord send metrics ─────────────────────────────────────────────────
function recordDiscordSend({ kind, ok, durationMs }) {
  const attrs = { kind: String(kind || 'channel'), ok: ok !== false };
  _counter('discord.send.count', {
    description: 'Discord messages sent, by kind + outcome',
  }).add(1, attrs);
  if (typeof durationMs === 'number') {
    _histogram('discord.send.duration_ms', {
      description: 'Discord send latency (ms)',
      unit: 'ms',
    }).record(durationMs, attrs);
  }
}

// ── Provisioner metrics ──────────────────────────────────────────────────
function recordProvisionerRun({ ok, durationMs, trigger }) {
  const attrs = { ok: ok !== false, trigger: String(trigger || 'manual') };
  _counter('inhouse.provision.count', {
    description: 'Dedicated server provisioner runs, by outcome',
  }).add(1, attrs);
  if (typeof durationMs === 'number') {
    _histogram('inhouse.provision.duration_ms', {
      description: 'Provisioner run duration (ms)',
      unit: 'ms',
    }).record(durationMs, attrs);
  }
}

// ── Replay download metrics ──────────────────────────────────────────────
function recordReplayDownload({ source, ok, durationMs, bytes }) {
  const attrs = { source: String(source || 'unknown'), ok: ok !== false };
  _counter('replay.download.count', {
    description: 'Replay downloads, by source + outcome',
  }).add(1, attrs);
  if (typeof durationMs === 'number') {
    _histogram('replay.download.duration_ms', {
      description: 'Replay download duration (ms)',
      unit: 'ms',
    }).record(durationMs, attrs);
  }
  if (typeof bytes === 'number' && bytes > 0) {
    _histogram('replay.download.size_bytes', {
      description: 'Replay download size (bytes)',
      unit: 'By',
    }).record(bytes, attrs);
  }
}

// ── Push delivery metrics ────────────────────────────────────────────────
function recordPushDelivery({ channel, sent, removed, failed }) {
  const attrs = { channel: String(channel || 'expo') };
  if (sent) _counter('push.delivery.success', {
    description: 'Push messages successfully delivered',
  }).add(Number(sent) || 0, attrs);
  if (removed) _counter('push.delivery.removed_tokens', {
    description: 'Push tokens removed by provider (unregistered/invalid)',
  }).add(Number(removed) || 0, attrs);
  if (failed) _counter('push.delivery.failure', {
    description: 'Push delivery failures (network/provider error)',
  }).add(Number(failed) || 0, attrs);
}

module.exports = {
  recordHttpRequest,
  recordParse,
  updateParserQueueDepth,
  recordStripeCall,
  recordStripeWebhook,
  recordDiscordSend,
  recordProvisionerRun,
  recordReplayDownload,
  recordPushDelivery,
};
