// Task #423 — unit tests for the persisted ops-history layer in
// src/web/opsState.js. We stub a tiny in-memory pg.Pool that records the
// SQL it sees so we can assert the snapshot writer (a) ensures the
// schema, (b) inserts a row with the values currently in `state`, and
// (c) prunes old rows. `readHistory` is exercised end-to-end against the
// same stub.

const test = require('node:test');
const assert = require('node:assert/strict');

function makeFakeDb(rows = []) {
  const queries = [];
  return {
    queries,
    rows,
    getPool() {
      return {
        query: async (sql, params) => {
          queries.push({ sql, params });
          const s = String(sql).trim().toUpperCase();
          if (s.startsWith('SELECT COUNT(*)::INT AS C FROM WEB_PUSH_SUBSCRIPTIONS')) {
            return { rows: [{ c: 42 }] };
          }
          if (s.startsWith('SELECT')) {
            return {
              rows: rows.map(r => ({
                ts_ms: r.ts,
                http_5xx_60m: r.http5xx,
                parser_queue_depth: r.parserQueueDepth,
                parser_last_duration_ms: r.parserLastDurationMs,
                parser_ready: r.parserReady,
                stripe_max_lag_ms: r.stripeMaxLagMs,
                provisioner_in_flight: r.provisionerInFlight,
                provisioner_success_total: r.provisionerSuccessTotal,
                provisioner_failure_total: r.provisionerFailureTotal,
                discord_gateway_latency_ms: r.discordGatewayLatencyMs,
                push_subscription_count: r.pushSubscriptionCount,
              })),
            };
          }
          return { rows: [] };
        },
      };
    },
  };
}

function freshOpsState() {
  delete require.cache[require.resolve('../src/web/opsState')];
  return require('../src/web/opsState');
}

test('captureHistorySnapshot ensures schema and inserts a row', async () => {
  const ops = freshOpsState();
  ops.reportParser({ ready: true, queueDepth: 3, parsedMs: 1234 });
  ops.reportDiscord({ connected: true, gatewayLatencyMs: 80 });
  ops.reportProvisioner({ inFlight: [1, 2], success: { sessionId: 1 } });
  ops.reportProvisioner({ failure: { sessionId: 2, error: 'boom' } });

  const db = makeFakeDb();
  const ok = await ops.captureHistorySnapshot(db);
  assert.equal(ok, true);

  const sqls = db.queries.map(q => q.sql.replace(/\s+/g, ' ').trim());
  assert.ok(sqls.some(s => s.startsWith('CREATE TABLE IF NOT EXISTS ops_metrics')),
    'creates table');
  assert.ok(sqls.some(s => s.startsWith('CREATE INDEX IF NOT EXISTS idx_ops_metrics_ts')),
    'creates index');

  const insert = db.queries.find(q => /INSERT INTO ops_metrics/i.test(q.sql));
  assert.ok(insert, 'insert happened');
  // Param order: http5xx, queueDepth, lastDurationMs, parserReady, stripeLag,
  // inFlight, successTotal, failureTotal, discordLatency, pushCount.
  assert.equal(insert.params[1], 3, 'queue depth carried through');
  assert.equal(insert.params[2], 1234, 'parser duration carried through');
  assert.equal(insert.params[3], true, 'parser ready flag');
  assert.equal(insert.params[5], 2, 'in-flight length');
  assert.equal(insert.params[6], 1, 'success total');
  assert.equal(insert.params[7], 1, 'failure total');
  assert.equal(insert.params[8], 80, 'discord latency');
  assert.equal(insert.params[9], 42, 'push subscription count from db lookup');

  assert.ok(sqls.some(s => /DELETE FROM ops_metrics WHERE ts < NOW\(\) - INTERVAL/i.test(s)),
    'prunes old rows');
});

test('captureHistorySnapshot is best-effort — pool failure does not throw', async () => {
  const ops = freshOpsState();
  const db = {
    getPool() {
      return { query: async () => { throw new Error('db down'); } };
    },
  };
  const ok = await ops.captureHistorySnapshot(db);
  assert.equal(ok, false);
});

test('readHistory caps hours to retention window and shapes rows', async () => {
  const ops = freshOpsState();
  const sample = {
    ts: Date.now(),
    http5xx: 1, parserQueueDepth: 0, parserLastDurationMs: 100, parserReady: true,
    stripeMaxLagMs: 50, provisionerInFlight: 0, provisionerSuccessTotal: 5,
    provisionerFailureTotal: 1, discordGatewayLatencyMs: 70, pushSubscriptionCount: 9,
  };
  const db = makeFakeDb([sample]);
  // Ask for an absurd window — should be capped to retainDays*24.
  const rows = await ops.readHistory(db, { hours: 99999 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].http5xx, 1);
  assert.equal(rows[0].provisionerSuccessTotal, 5);
  assert.equal(rows[0].pushSubscriptionCount, 9);

  const selectQ = db.queries.find(q => /FROM ops_metrics/i.test(q.sql) && /SELECT/i.test(q.sql));
  assert.ok(selectQ, 'select happened');
  assert.equal(selectQ.params[0], String(24 * ops.HISTORY_RETAIN_DAYS),
    'hours capped to retention window');
});

test('provisioner counters increment on report', () => {
  const ops = freshOpsState();
  ops.reportProvisioner({ success: { sessionId: 1 } });
  ops.reportProvisioner({ success: { sessionId: 2 } });
  ops.reportProvisioner({ failure: { sessionId: 3, error: 'x' } });
  const db = makeFakeDb();
  return ops.captureHistorySnapshot(db).then(() => {
    const insert = db.queries.find(q => /INSERT INTO ops_metrics/i.test(q.sql));
    assert.equal(insert.params[6], 2, 'success total');
    assert.equal(insert.params[7], 1, 'failure total');
  });
});
