// Task #491 — coverage for the brand-asset hotlink protection middleware.
// Locks down: which paths are gated, the referer allow-list decision logic,
// the social-unfurler UA bypass, and the ring-buffer report aggregation.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hotlinkMiddleware,
  buildReport,
  isGatedAssetPath,
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
