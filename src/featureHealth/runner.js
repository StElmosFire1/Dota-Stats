// Task #425 — Probe runner, scheduler, and owner-alert dedupe.
//
// `runAll` and `runOne` execute probes via the registry in probes.js, persist
// each result into `feature_health_probes`, and DM the bot owner whenever a
// probe flips from `ok` to a failure state (24h dedupe per key).

const db = require('../db');
const { PROBES, normalise } = require('./probes');

const RUN_TIMEOUT_MS = 10_000;
const ALERT_DEDUPE_MS = 24 * 60 * 60 * 1000;

const _lastAlertAt = new Map(); // key → ts

function _probeByKey(key) { return PROBES.find(p => p.key === key) || null; }

async function _runWithTimeout(probe) {
  let to;
  try {
    return await Promise.race([
      probe.run(),
      new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`timeout ${RUN_TIMEOUT_MS}ms`)), RUN_TIMEOUT_MS); }),
    ]);
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  } finally {
    if (to) clearTimeout(to);
  }
}

async function _maybeAlertOwner(probe, prev, current) {
  if (current.ok) return;
  const wasOk = !prev || prev.status === 'ok';
  if (!wasOk) return; // already in failed state — wait for recovery before re-alerting
  const last = _lastAlertAt.get(probe.key) || 0;
  if (Date.now() - last < ALERT_DEDUPE_MS) return;
  _lastAlertAt.set(probe.key, Date.now());
  try {
    const { getDiscordBot } = require('../discord/bot');
    const bot = getDiscordBot();
    if (bot && typeof bot._dmOwner === 'function') {
      await bot._dmOwner(
        `🩺 **Feature health alert** — \`${probe.key}\` (${probe.label}) is FAILING.\n` +
        `Reason: ${current.reason || 'unknown'}\n` +
        `(Suppressed for the next 24h per-key.)`
      );
    }
  } catch (_) { /* never let alerting break the probe loop */ }
}

async function runOne(key) {
  const probe = _probeByKey(key);
  if (!probe) throw new Error(`Unknown probe: ${key}`);
  const started = Date.now();
  const raw = await _runWithTimeout(probe);
  const result = normalise(raw);
  const status = result.ok ? 'ok' : 'red';
  const prev = await db.getLatestFeatureHealthProbe(probe.key).catch(() => null);
  await db.recordFeatureHealthProbe({
    key: probe.key, status, reason: result.reason, duration_ms: Date.now() - started,
  }).catch(() => {});
  await _maybeAlertOwner(probe, prev, result);
  return { key: probe.key, label: probe.label, status, reason: result.reason };
}

async function runAll() {
  const out = [];
  for (const p of PROBES) {
    out.push(await runOne(p.key).catch(e => ({
      key: p.key, label: p.label, status: 'red', reason: e?.message || String(e),
    })));
  }
  return out;
}

async function getSnapshot() {
  const latest = await db.getLatestFeatureHealthProbes().catch(() => []);
  const byKey = new Map(latest.map(r => [r.key, r]));
  const lastSuccessByKey = await db.getLastSuccessByKey().catch(() => new Map());
  return PROBES.map(p => {
    const row = byKey.get(p.key) || null;
    return {
      key: p.key,
      label: p.label,
      status: row?.status || 'never_run',
      reason: row?.reason || null,
      ran_at: row?.ran_at || null,
      last_success_at: lastSuccessByKey.get(p.key) || null,
      duration_ms: row?.duration_ms || null,
    };
  });
}

let _running = false;
let _intervalHandle = null;

async function _tick(reason = 'cron') {
  if (_running) return;
  _running = true;
  try {
    await runAll();
  } catch (e) {
    console.warn(`[FeatureHealth] ${reason} tick failed:`, e?.message || e);
  } finally {
    _running = false;
  }
}

function startScheduler({ intervalMs } = {}) {
  const ms = Number(intervalMs)
    || parseInt(process.env.FEATURE_HEALTH_INTERVAL_MS || '', 10)
    || 30 * 60 * 1000;
  // First tick 2 min after boot so Discord/Steam/parser have a chance to come up.
  setTimeout(() => { _tick('boot').catch(() => {}); }, 2 * 60_000).unref();
  if (_intervalHandle) clearInterval(_intervalHandle);
  _intervalHandle = setInterval(() => { _tick('cron').catch(() => {}); }, ms);
  _intervalHandle.unref();
  return { intervalMs: ms };
}

module.exports = { runAll, runOne, getSnapshot, startScheduler, PROBES };
