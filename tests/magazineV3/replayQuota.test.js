'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDb } = require('../../src/monetization/magazineV3/replayQuota');
const { makePool } = require('./_helpers');

test('replayQuota.logReplayDownload: short-circuits without accountId', async () => {
  const pool = makePool([], { strict: true });
  const db = createDb({ getPool: () => pool });
  await db.logReplayDownload(0, 'm1', 100);
  await db.logReplayDownload(null, 'm1');
  assert.equal(pool.calls.length, 0);
});

test('replayQuota.logReplayDownload: stringifies matchId, defaults bytes to null', async () => {
  let captured;
  const pool = makePool([
    { match: 'INSERT INTO replay_download_log',
      respond: (p) => { captured = p; return []; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  await db.logReplayDownload(7, 12345);
  assert.deepEqual(captured, [7, '12345', null]);
});

test('replayQuota.logReplayDownload: forwards explicit bytes', async () => {
  let captured;
  const pool = makePool([
    { match: 'INSERT INTO replay_download_log',
      respond: (p) => { captured = p; return []; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  await db.logReplayDownload(7, 'm1', 4096);
  assert.deepEqual(captured, [7, 'm1', 4096]);
});

test('replayQuota.countReplayDownloadsLast24h: short-circuits to 0 without accountId', async () => {
  const pool = makePool([], { strict: true });
  const db = createDb({ getPool: () => pool });
  assert.equal(await db.countReplayDownloadsLast24h(0), 0);
  assert.equal(await db.countReplayDownloadsLast24h(null), 0);
  assert.equal(pool.calls.length, 0);
});

test('replayQuota.countReplayDownloadsLast24h: SQL filters last 24 hours', async () => {
  let sql, params;
  const pool = makePool([
    { match: 'FROM replay_download_log',
      respond: (p, s) => { sql = s; params = p; return [{ c: 5 }]; } },
  ], { strict: true });
  const db = createDb({ getPool: () => pool });
  const out = await db.countReplayDownloadsLast24h(42);
  assert.equal(out, 5);
  assert.deepEqual(params, [42]);
  assert.match(sql, /COUNT\(\*\)/);
  assert.match(sql, /account_id = \$1/);
  assert.match(sql, /ts > NOW\(\) - INTERVAL '24 hours'/);
});

test('replayQuota.countReplayDownloadsLast24h: returns 0 when row missing or count null', async () => {
  const empty = createDb({ getPool: () => makePool([
    { match: 'FROM replay_download_log', respond: () => [] },
  ]) });
  assert.equal(await empty.countReplayDownloadsLast24h(1), 0);
  const nullc = createDb({ getPool: () => makePool([
    { match: 'FROM replay_download_log', respond: () => [{ c: null }] },
  ]) });
  assert.equal(await nullc.countReplayDownloadsLast24h(1), 0);
});
