const crypto = require('crypto');
const db = require('../db');

const fetchFn = (typeof fetch === 'function')
  ? fetch
  : ((...args) => require('node-fetch')(...args));

const RETRY_DELAYS_MS = [
  0,
  30 * 1000,
  2 * 60 * 1000,
  10 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;
const HTTP_TIMEOUT_MS = 15 * 1000;

let _workerStarted = false;
let _workerTimer = null;

function signPayload(secret, timestampMs, rawBody) {
  if (!secret) return null;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestampMs}.${rawBody}`);
  return `t=${timestampMs},v1=${hmac.digest('hex')}`;
}

async function _httpDeliver(url, headers, body) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const r = await fetchFn(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
      redirect: 'manual',
    });
    let respBody = '';
    try { respBody = (await r.text()).slice(0, 2048); } catch (_) {}
    return { status: r.status, body: respBody, error: null };
  } catch (err) {
    return { status: 0, body: '', error: err.message || String(err) };
  } finally {
    clearTimeout(t);
  }
}

async function _attemptDelivery(delivery) {
  const sub = await db.getWebhookSubscriptionById(delivery.subscription_id).catch(() => null);
  if (!sub || !sub.active) {
    await db.markWebhookDeliveryFailed(delivery.id, 'subscription inactive', /*final*/ true);
    return;
  }
  const timestampMs = Date.now();
  const rawBody = JSON.stringify(delivery.payload);
  const signature = signPayload(sub.secret, timestampMs, rawBody);
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'OCE-Inhouse-Webhooks/1.0',
    'X-OI-Event': delivery.event,
    'X-OI-Delivery': String(delivery.id),
    'X-OI-Timestamp': String(timestampMs),
  };
  if (signature) headers['X-OI-Signature'] = signature;

  // SSRF guard: re-resolve the destination at send time and refuse if the
  // hostname now points at a private/loopback/link-local IP. This catches
  // DNS-rebinding attempts against the long-lived dispatcher.
  try {
    const { assertSafeAtDispatch } = require('./webhookUrlGuard');
    const safe = await assertSafeAtDispatch(sub.url);
    if (!safe.ok) {
      await db.markWebhookDeliveryFailed(
        delivery.id, `blocked: ${safe.error}`, /*final*/ true,
      );
      return;
    }
  } catch (_) { /* if the guard module is unavailable, fall through */ }

  const result = await _httpDeliver(sub.url, headers, rawBody);
  const ok = result.status >= 200 && result.status < 300;
  if (ok) {
    await db.markWebhookDeliverySucceeded(delivery.id, result.status, result.body);
    return;
  }
  const nextAttempt = (delivery.attempts || 0) + 1;
  if (nextAttempt >= MAX_ATTEMPTS) {
    await db.markWebhookDeliveryFailed(
      delivery.id,
      result.error || `HTTP ${result.status}: ${result.body || ''}`.slice(0, 1024),
      /*final*/ true,
    );
    return;
  }
  const backoffMs = RETRY_DELAYS_MS[nextAttempt] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  await db.scheduleWebhookDeliveryRetry(
    delivery.id,
    nextAttempt,
    new Date(Date.now() + backoffMs),
    result.error || `HTTP ${result.status}: ${result.body || ''}`.slice(0, 1024),
  );
}

async function _tickWorker() {
  try {
    const due = await db.claimDueWebhookDeliveries(10);
    for (const delivery of due) {
      try {
        await _attemptDelivery(delivery);
      } catch (err) {
        console.warn('[Webhook] delivery error:', err.message);
        try {
          await db.scheduleWebhookDeliveryRetry(
            delivery.id,
            (delivery.attempts || 0) + 1,
            new Date(Date.now() + 60_000),
            (err.message || String(err)).slice(0, 1024),
          );
        } catch (_) {}
      }
    }
  } catch (err) {
    console.warn('[Webhook] worker tick failed:', err.message);
  }
}

function startWorker() {
  if (_workerStarted) return;
  _workerStarted = true;
  _workerTimer = setInterval(() => { _tickWorker().catch(() => {}); }, 15 * 1000);
  if (_workerTimer.unref) _workerTimer.unref();
  console.log('[Webhook] dispatcher worker started');
}

async function dispatchEvent(event, payload, { ownerAccountId = null } = {}) {
  try {
    const subs = await db.listWebhookSubscriptionsForEvent(event, { ownerAccountId });
    if (!subs.length) return 0;
    const eventPayload = {
      event,
      delivered_at: new Date().toISOString(),
      data: payload,
    };
    let count = 0;
    for (const sub of subs) {
      try {
        await db.enqueueWebhookDelivery(sub.id, event, eventPayload);
        count++;
      } catch (err) {
        console.warn('[Webhook] enqueue failed:', err.message);
      }
    }
    return count;
  } catch (err) {
    console.warn('[Webhook] dispatchEvent failed:', err.message);
    return 0;
  }
}

module.exports = {
  startWorker,
  dispatchEvent,
  signPayload,
  RETRY_DELAYS_MS,
  MAX_ATTEMPTS,
};
