// Task #491 — coverage for the brand-asset hotlink protection middleware.
// Locks down: which paths are gated, the referer allow-list decision logic,
// the social-unfurler UA bypass, and the ring-buffer report aggregation.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hotlinkMiddleware,
  buildReport,
  isGatedAssetPath,
  flushHotlinkLog,
  _resetForTests,
} = require('../src/security/assetHotlink');

// Minimal req/res doubles mirroring the express surface the middleware touches.
function makeReq({ url = '/oa-logo.png', headers = {}, ip = '1.2.3.4', method = 'GET' } = {}) {
  const lower = {};
  for (const k of Object.keys(headers)) lower[k.toLowerCase()] = headers[k];
  return {
    originalUrl: url,
    url,
    method,
    ip,
    get(name) { return lower[String(name).toLowerCase()]; },
  };
}
function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    _type: undefined,
    set(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    type(t) { this._type = t; return this; },
    send(b) { this.body = b; this.ended = true; return this; },
  };
}
function run(reqOpts) {
  const req = makeReq(reqOpts);
  const res = makeRes();
  let nextCalled = false;
  hotlinkMiddleware(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
}

test('isGatedAssetPath: distinctive brand assets are gated', () => {
  for (const p of [
    '/oa-logo.png', '/favicon.png', '/favicon.ico',
    '/badges/tier-8-king.png', '/voice-packs/hype/win.mp3',
    '/sounds/inhouse-alert.mp3',
    '/api/matches/123/recap-card.png', '/overlay/scoreboard/55',
    '/OA-LOGO.PNG', // case-insensitive
  ]) {
    assert.equal(isGatedAssetPath(p), true, `expected gated: ${p}`);
  }
});

test('isGatedAssetPath: generic assets are NOT gated', () => {
  for (const p of [
    '/assets/index-abc123.js', '/assets/index-abc123.css',
    '/minimap.png', '/dota_minimap.png', '/sw.js', '/robots.txt',
    '/fonts/inter.woff2', '/', '/profile',
  ]) {
    assert.equal(isGatedAssetPath(p), false, `expected NOT gated: ${p}`);
  }
});

test('empty referer is allowed (direct loads, most unfurlers)', () => {
  _resetForTests();
  const { res, nextCalled } = run({ url: '/oa-logo.png' });
  assert.equal(nextCalled, true);
  assert.notEqual(res.statusCode, 403);
});

test('same-origin referer is allowed', () => {
  _resetForTests();
  const { nextCalled, res } = run({
    url: '/badges/tier-1-apprentice.png',
    headers: { host: 'oceinhouse.gg', referer: 'https://oceinhouse.gg/leaderboard' },
  });
  assert.equal(nextCalled, true);
  assert.notEqual(res.statusCode, 403);
});

test('built-in allow-list domain (subdomain) is allowed', () => {
  _resetForTests();
  const { nextCalled } = run({
    url: '/oa-logo.png',
    headers: { host: 'oceinhouse.gg', referer: 'https://www.oceinhouse.gg/x' },
  });
  assert.equal(nextCalled, true);
});

test('off-domain referer is blocked with 403', () => {
  _resetForTests();
  const { res, nextCalled } = run({
    url: '/oa-logo.png',
    headers: { host: 'oceinhouse.gg', referer: 'https://clone.emergent.sh/home' },
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body, /not permitted/i);
});

test('known social unfurler UA bypasses the block even with off-domain referer', () => {
  _resetForTests();
  const { nextCalled, res } = run({
    url: '/api/matches/9/recap-card.png',
    headers: {
      host: 'oceinhouse.gg',
      referer: 'https://t.co/abc',
      'user-agent': 'Twitterbot/1.0',
    },
  });
  assert.equal(nextCalled, true);
  assert.notEqual(res.statusCode, 403);
});

test('BRAND_ASSET_REFERER_ALLOWLIST env extends the allow-list', () => {
  _resetForTests();
  const prev = process.env.BRAND_ASSET_REFERER_ALLOWLIST;
  process.env.BRAND_ASSET_REFERER_ALLOWLIST = 'partner.example';
  try {
    const { nextCalled } = run({
      url: '/oa-logo.png',
      headers: { host: 'oceinhouse.gg', referer: 'https://partner.example/page' },
    });
    assert.equal(nextCalled, true);
  } finally {
    if (prev === undefined) delete process.env.BRAND_ASSET_REFERER_ALLOWLIST;
    else process.env.BRAND_ASSET_REFERER_ALLOWLIST = prev;
  }
});

test('non-gated paths pass through without being recorded', () => {
  _resetForTests();
  const { nextCalled } = run({
    url: '/assets/app.js',
    headers: { host: 'oceinhouse.gg', referer: 'https://clone.emergent.sh/' },
  });
  assert.equal(nextCalled, true);
  const report = buildReport();
  assert.equal(report.ringBufferSize, 0);
});

// Task #565 — durable persistence: the middleware rolls decisions up into an
// in-memory accumulator that flushHotlinkLog() batches into the DB. We stub the
// db module in require.cache so we can assert the rollup snapshot shape without
// a live Postgres.
test('flushHotlinkLog batches a daily rollup snapshot to the db (sampled/bounded)', async () => {
  _resetForTests();
  const path = require('node:path');
  const dbPath = require.resolve(path.join(__dirname, '../src/db'));
  const prevCached = require.cache[dbPath];
  const captured = [];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      async upsertAssetHotlinkDaily(rows) { captured.push(rows); return rows.length; },
      async pruneAssetHotlinkDaily() { return 0; },
    },
  };
  try {
    // 3 blocked from one clone host (2 distinct paths) + 1 allowed same-origin.
    run({ url: '/oa-logo.png', headers: { host: 'oceinhouse.gg', referer: 'https://clone.test/a' } });
    run({ url: '/oa-logo.png', headers: { host: 'oceinhouse.gg', referer: 'https://clone.test/a' } });
    run({ url: '/badges/x.png', headers: { host: 'oceinhouse.gg', referer: 'https://clone.test/b' } });
    run({ url: '/oa-logo.png', headers: { host: 'oceinhouse.gg', referer: 'https://oceinhouse.gg/' } });

    const n = await flushHotlinkLog();
    assert.equal(n, 2, 'one rollup row per referer host');
    assert.equal(captured.length, 1, 'a single batched db write');
    const rows = captured[0];
    const clone = rows.find(r => r.referer_host === 'clone.test');
    assert.ok(clone, 'clone.test rollup row present');
    assert.equal(clone.hits, 3);
    assert.equal(clone.blocked, 3);
    assert.equal(clone.allowed, 0);
    assert.equal(clone.distinct_paths, 2);
    assert.match(clone.day, /^\d{4}-\d{2}-\d{2}$/);
    const self = rows.find(r => r.referer_host === 'oceinhouse.gg');
    assert.ok(self, 'same-origin rollup row present');
    assert.equal(self.allowed, 1);

    // Accumulator is drained after a successful flush — no double-counting.
    const n2 = await flushHotlinkLog();
    assert.equal(n2, 0);
  } finally {
    if (prevCached) require.cache[dbPath] = prevCached;
    else delete require.cache[dbPath];
  }
});

test('flushHotlinkLog folds the snapshot back when the db write fails', async () => {
  _resetForTests();
  const path = require('node:path');
  const dbPath = require.resolve(path.join(__dirname, '../src/db'));
  const prevCached = require.cache[dbPath];
  let attempts = 0;
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      async upsertAssetHotlinkDaily() { attempts += 1; throw new Error('db down'); },
      async pruneAssetHotlinkDaily() { return 0; },
    },
  };
  try {
    run({ url: '/oa-logo.png', headers: { host: 'oceinhouse.gg', referer: 'https://clone.test/a' } });
    const n = await flushHotlinkLog();
    assert.equal(n, 0, 'failed flush reports 0 rows written');
    assert.equal(attempts, 1);
    // The data is retried on the next flush rather than being lost.
    require.cache[dbPath].exports.upsertAssetHotlinkDaily = async (rows) => rows.length;
    const n2 = await flushHotlinkLog();
    assert.equal(n2, 1, 'folded-back row is retried and written on the next flush');
  } finally {
    if (prevCached) require.cache[dbPath] = prevCached;
    else delete require.cache[dbPath];
  }
});

test('buildReport aggregates by referer host with allowed/blocked counts', () => {
  _resetForTests();
  // 2 blocked from clone, 1 allowed same-origin.
  run({ url: '/oa-logo.png', headers: { host: 'oceinhouse.gg', referer: 'https://clone.test/a' } });
  run({ url: '/badges/x.png', headers: { host: 'oceinhouse.gg', referer: 'https://clone.test/b' } });
  run({ url: '/oa-logo.png', headers: { host: 'oceinhouse.gg', referer: 'https://oceinhouse.gg/' } });
  const report = buildReport();
  assert.equal(report.totals.blocked, 2);
  assert.equal(report.totals.allowed, 1);
  const clone = report.hosts.find(h => h.referer_host === 'clone.test');
  assert.ok(clone, 'clone.test row present');
  assert.equal(clone.blocked, 2);
  assert.equal(clone.unique_paths, 2);
  assert.equal(report.recent.length, 3);
});
