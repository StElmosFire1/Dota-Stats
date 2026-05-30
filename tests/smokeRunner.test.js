// Task #489 — Unit coverage for the browser-smoke runner.
//
// src/smoke/runner.js was previously only exercised by the live Sunday-3am
// cron, so a regression in the pixel-diff threshold maths, the size-mismatch
// branch, the missing-baseline branch, the optional-deps SKIPPED branch, the
// in-flight guard, or the owner-alert path would only surface in production.
//
// These tests drive each of those branches in isolation:
//   - _diffAgainstBaseline() is a pure function with injectable fs / pixelmatch
//     / PNG, so the threshold + viewport-mismatch + error branches run without
//     a real browser or real image files.
//   - runSmoke() is exercised against a stubbed db (injected via require.cache)
//     for the missing-deps SKIPPED row and the in-flight guard.
//   - _alertOwner() is checked for its "Discord bot unavailable → no-op" path.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const Module = require('module');

// The lockdown-bypass tests drive runSmoke far enough that it creates the
// per-run screenshot directory (tests/smoke/screenshots/<runId>). Remove it so
// the test leaves no tracked artifact behind.
function rmRunDir(runId) {
  try {
    fs.rmSync(path.join(__dirname, 'smoke', 'screenshots', String(runId)), { recursive: true, force: true });
  } catch (_) { /* best-effort */ }
}

const DB_PATH = require.resolve('../src/db');
const BOT_PATH = require.resolve('../src/discord/bot');
const RUNNER_PATH = require.resolve('../src/smoke/runner');

// Install a stub db into the require cache *before* runner.js is required, so
// its top-level `require('../db')` resolves to the stub. Returns the stub so a
// test can read what the runner recorded.
function installStubDb(overrides = {}) {
  const calls = { steps: [], finishes: [], created: [], fetched: [] };
  const stub = {
    calls,
    async createBrowserSmokeRun(arg) {
      calls.created.push(arg);
      if (overrides.createBrowserSmokeRun) return overrides.createBrowserSmokeRun(arg);
      return { id: 1234 };
    },
    async getBrowserSmokeRun(id) {
      calls.fetched.push(id);
      return { id };
    },
    async recordBrowserSmokeStep(step) {
      calls.steps.push(step);
    },
    async finishBrowserSmokeRun(id, fields) {
      calls.finishes.push({ id, ...fields });
    },
  };
  require.cache[DB_PATH] = { id: DB_PATH, filename: DB_PATH, loaded: true, exports: stub };
  return stub;
}

// Install a stub discord bot module so _alertOwner's `require('../discord/bot')`
// resolves to a controllable getDiscordBot().
function installStubBot(getDiscordBot) {
  require.cache[BOT_PATH] = {
    id: BOT_PATH, filename: BOT_PATH, loaded: true,
    exports: { getDiscordBot },
  };
}

function freshRunner() {
  delete require.cache[RUNNER_PATH];
  return require(RUNNER_PATH);
}

function cleanup() {
  delete require.cache[DB_PATH];
  delete require.cache[BOT_PATH];
  delete require.cache[RUNNER_PATH];
}

// A minimal fake `fs` for _diffAgainstBaseline — `files` maps a path to a
// buffer; absent paths read as "doesn't exist".
function fakeFs(files) {
  const writes = {};
  return {
    writes,
    existsSync: (p) => Object.prototype.hasOwnProperty.call(files, p),
    readFileSync: (p) => {
      if (!Object.prototype.hasOwnProperty.call(files, p)) throw new Error(`ENOENT: ${p}`);
      return files[p];
    },
    writeFileSync: (p, data) => { writes[p] = data; },
  };
}

// A fake PNG whose sync.read returns whatever object the buffer "is" — we pass
// plain {width,height,data} objects through readFileSync so the comparison can
// be driven deterministically.
const fakePNG = function PNG(opts) { this.width = opts.width; this.height = opts.height; this.data = Buffer.alloc(0); };
fakePNG.sync = {
  read: (buf) => buf,            // buf is already a {width,height,data} object
  write: () => Buffer.from('diff-png-bytes'),
};

// ──────────────────────────────────────────────────────────────────────────
// _diffAgainstBaseline — pure threshold / mismatch / error branches
// ──────────────────────────────────────────────────────────────────────────

test('_diffAgainstBaseline: baseline absent → status ok, no diff computed', () => {
  const { _diffAgainstBaseline } = freshRunner();
  const fsImpl = fakeFs({}); // no baseline on disk
  const res = _diffAgainstBaseline({
    screenshotPath: '/tmp/shot.png',
    baselinePath: '/tmp/baseline.png',
    diffThreshold: 0.01,
    pixelmatch: () => { throw new Error('should not be called'); },
    PNG: fakePNG,
    fsImpl,
  });
  cleanup();
  assert.equal(res.status, 'ok');
  assert.equal(res.reason, null);
  assert.equal(res.baselinePath, null);
  assert.equal(res.diffPixels, null);
  assert.equal(res.diffRatio, null);
});

test('_diffAgainstBaseline: same size under threshold → status ok with ratio', () => {
  const { _diffAgainstBaseline } = freshRunner();
  const cur = { width: 100, height: 100, data: Buffer.alloc(0) };
  const base = { width: 100, height: 100, data: Buffer.alloc(0) };
  const fsImpl = fakeFs({ '/shot.png': cur, '/base.png': base });
  const res = _diffAgainstBaseline({
    screenshotPath: '/shot.png',
    baselinePath: '/base.png',
    diffThreshold: 0.01,
    pixelmatch: () => 50, // 50 / 10000 = 0.005 → under 0.01
    PNG: fakePNG,
    writeDiffTo: '/diff.png',
    fsImpl,
  });
  cleanup();
  assert.equal(res.status, 'ok');
  assert.equal(res.diffPixels, 50);
  assert.equal(res.diffRatio, 0.005);
  assert.equal(res.baselinePath, '/base.png');
  assert.equal(res.diffPath, '/diff.png');
  assert.ok(fsImpl.writes['/diff.png'], 'diff image should be written');
});

test('_diffAgainstBaseline: same size over threshold → status failed', () => {
  const { _diffAgainstBaseline } = freshRunner();
  const cur = { width: 100, height: 100, data: Buffer.alloc(0) };
  const base = { width: 100, height: 100, data: Buffer.alloc(0) };
  const fsImpl = fakeFs({ '/shot.png': cur, '/base.png': base });
  const res = _diffAgainstBaseline({
    screenshotPath: '/shot.png',
    baselinePath: '/base.png',
    diffThreshold: 0.01,
    pixelmatch: () => 500, // 500 / 10000 = 0.05 → over 0.01
    PNG: fakePNG,
    writeDiffTo: '/diff.png',
    fsImpl,
  });
  cleanup();
  assert.equal(res.status, 'failed');
  assert.equal(res.diffRatio, 0.05);
  assert.match(res.reason, /visual diff 5\.00% exceeds 1\.00% threshold/);
});

test('_diffAgainstBaseline: viewport mismatch → status failed', () => {
  const { _diffAgainstBaseline } = freshRunner();
  const cur = { width: 1280, height: 800, data: Buffer.alloc(0) };
  const base = { width: 1024, height: 768, data: Buffer.alloc(0) };
  const fsImpl = fakeFs({ '/shot.png': cur, '/base.png': base });
  const res = _diffAgainstBaseline({
    screenshotPath: '/shot.png',
    baselinePath: '/base.png',
    diffThreshold: 0.01,
    pixelmatch: () => { throw new Error('should not run on size mismatch'); },
    PNG: fakePNG,
    fsImpl,
  });
  cleanup();
  assert.equal(res.status, 'failed');
  assert.match(res.reason, /viewport mismatch vs baseline \(1280x800 vs 1024x768\)/);
  assert.equal(res.diffPixels, null);
});

test('_diffAgainstBaseline: pixelmatch throws → status failed with error reason', () => {
  const { _diffAgainstBaseline } = freshRunner();
  const cur = { width: 100, height: 100, data: Buffer.alloc(0) };
  const base = { width: 100, height: 100, data: Buffer.alloc(0) };
  const fsImpl = fakeFs({ '/shot.png': cur, '/base.png': base });
  const res = _diffAgainstBaseline({
    screenshotPath: '/shot.png',
    baselinePath: '/base.png',
    diffThreshold: 0.01,
    pixelmatch: () => { throw new Error('boom'); },
    PNG: fakePNG,
    fsImpl,
  });
  cleanup();
  assert.equal(res.status, 'failed');
  assert.match(res.reason, /pixelmatch error: boom/);
});

// ──────────────────────────────────────────────────────────────────────────
// runSmoke — optional-deps SKIPPED branch
// ──────────────────────────────────────────────────────────────────────────

test('runSmoke: missing optional deps → records SKIPPED bootstrap step', async () => {
  const stub = installStubDb();
  const runner = freshRunner();

  // Force _tryRequire('playwright' | 'pixelmatch' | 'pngjs') to fail even
  // though they're installed as devDependencies, by intercepting Module._load.
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'playwright' || request === 'pixelmatch' || request === 'pngjs') {
      throw new Error(`mocked missing dep: ${request}`);
    }
    return origLoad.call(this, request, parent, isMain);
  };

  let result;
  try {
    result = await runner.runSmoke({ trigger: 'test' });
  } finally {
    Module._load = origLoad;
    cleanup();
  }

  assert.equal(result.skipped, true);
  assert.equal(result.runId, 1234);
  assert.equal(stub.calls.steps.length, 1);
  assert.equal(stub.calls.steps[0].status, 'skipped');
  assert.equal(stub.calls.steps[0].stepKey, '_bootstrap');
  assert.equal(stub.calls.finishes.length, 1);
  assert.equal(stub.calls.finishes[0].status, 'skipped');
});

// ──────────────────────────────────────────────────────────────────────────
// runSmoke — in-flight guard
// ──────────────────────────────────────────────────────────────────────────

test('runSmoke: second concurrent call returns skipped (in-flight guard)', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  // The first run blocks inside createBrowserSmokeRun, holding _runInFlight.
  const stub = installStubDb({
    createBrowserSmokeRun: async () => { await gate; return { id: 999 }; },
  });
  const runner = freshRunner();

  // Make the deps fail so the first run finishes quickly once unblocked.
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'playwright' || request === 'pixelmatch' || request === 'pngjs') {
      throw new Error(`mocked missing dep: ${request}`);
    }
    return origLoad.call(this, request, parent, isMain);
  };

  try {
    const first = runner.runSmoke({ trigger: 'test' }); // blocks on gate
    // Give the first call a tick to set _runInFlight before the second.
    await new Promise((r) => setImmediate(r));
    const second = await runner.runSmoke({ trigger: 'test' });
    assert.equal(second.skipped, true);
    assert.match(second.reason, /already in flight/);
    release();
    await first; // let the first run drain cleanly
  } finally {
    Module._load = origLoad;
    cleanup();
  }
  assert.ok(stub);
});

// ──────────────────────────────────────────────────────────────────────────
// runSmoke — Task #561 lockdown bypass
// ──────────────────────────────────────────────────────────────────────────

// Drive runSmoke past the optional-deps check with a fake playwright so the new
// lockdown-bypass code (after browser launch) runs without a real browser. The
// fake context's request.get returns whatever status the test supplies, so we
// can simulate the lockdown gate's 401 signature.
function installFakePlaywright({ probeStatus, captureContextOpts }) {
  const fakePlaywright = {
    chromium: {
      launch: async () => ({
        newContext: async (opts) => {
          if (captureContextOpts) captureContextOpts(opts);
          return {
            addInitScript: async () => {},
            request: { get: async () => ({ status: () => probeStatus, ok: () => probeStatus < 400, json: async () => ({}) }) },
            close: async () => {},
            storageState: async () => {},
          };
        },
        close: async () => {},
      }),
    },
  };
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'playwright') return fakePlaywright;
    if (request === 'pixelmatch') return () => 0;
    if (request === 'pngjs') return { PNG: fakePNG };
    return origLoad.call(this, request, parent, isMain);
  };
  return () => { Module._load = origLoad; };
}

test('runSmoke: lockdown on + no SUPERUSER_PASSWORD → records _lockdown skipped step and bails', async () => {
  const stub = installStubDb();
  const restoreLoad = installFakePlaywright({ probeStatus: 401 });
  const prevPwd = process.env.SUPERUSER_PASSWORD;
  const prevTok = process.env.SMOKE_TEST_LOGIN_TOKEN;
  delete process.env.SUPERUSER_PASSWORD;     // no bypass credential
  delete process.env.SMOKE_TEST_LOGIN_TOKEN; // no synthetic login configured
  const runner = freshRunner();

  let result;
  try {
    result = await runner.runSmoke({ trigger: 'test' });
  } finally {
    restoreLoad();
    if (prevPwd === undefined) delete process.env.SUPERUSER_PASSWORD; else process.env.SUPERUSER_PASSWORD = prevPwd;
    if (prevTok === undefined) delete process.env.SMOKE_TEST_LOGIN_TOKEN; else process.env.SMOKE_TEST_LOGIN_TOKEN = prevTok;
    rmRunDir(1234);
    cleanup();
  }

  assert.equal(result.skipped, true);
  assert.equal(result.runId, 1234);
  const lockStep = stub.calls.steps.find(s => s.stepKey === '_lockdown');
  assert.ok(lockStep, 'a _lockdown step should be recorded');
  assert.equal(lockStep.status, 'skipped');
  assert.match(lockStep.reason, /SUPERUSER_PASSWORD/);
  assert.equal(stub.calls.finishes.length, 1);
  assert.equal(stub.calls.finishes[0].status, 'skipped');
});

test('runSmoke: SUPERUSER_PASSWORD set → context carries x-superuser-key header, no lockdown probe', async () => {
  const stub = installStubDb();
  let contextOpts = null;
  // probeStatus 401 here proves the probe is NOT consulted when the key is set:
  // if it were, the run would bail as "locked out" despite having the credential.
  const restoreLoad = installFakePlaywright({ probeStatus: 401, captureContextOpts: (o) => { contextOpts = o; } });
  const prevPwd = process.env.SUPERUSER_PASSWORD;
  const prevTok = process.env.SMOKE_TEST_LOGIN_TOKEN;
  process.env.SUPERUSER_PASSWORD = 'secret-pw';
  delete process.env.SMOKE_TEST_LOGIN_TOKEN; // keep auth journeys skipped
  const runner = freshRunner();

  try {
    await runner.runSmoke({ trigger: 'test' });
  } finally {
    restoreLoad();
    if (prevPwd === undefined) delete process.env.SUPERUSER_PASSWORD; else process.env.SUPERUSER_PASSWORD = prevPwd;
    if (prevTok === undefined) delete process.env.SMOKE_TEST_LOGIN_TOKEN; else process.env.SMOKE_TEST_LOGIN_TOKEN = prevTok;
    rmRunDir(1234);
    cleanup();
  }

  assert.ok(contextOpts, 'newContext should have been called');
  assert.ok(contextOpts.extraHTTPHeaders, 'context should set extraHTTPHeaders');
  assert.equal(contextOpts.extraHTTPHeaders['x-superuser-key'], 'secret-pw');
  // The probe-based bail must not have fired (no _lockdown step) since the key
  // is present — the run proceeds (and fails on the fake pages, which is fine).
  assert.equal(stub.calls.steps.find(s => s.stepKey === '_lockdown'), undefined);
});

// ──────────────────────────────────────────────────────────────────────────
// _probeJsonJourney — JSON probe non-2xx branch
// ──────────────────────────────────────────────────────────────────────────

// A fake Playwright context whose request.get returns a response with the
// supplied status. `jsonImpl` lets a test make .json() throw if needed.
function fakeContext({ getStatus = 200, getJson = async () => ({}), get, post } = {}) {
  const mkRes = (status, json) => ({
    status: () => status,
    ok: () => status >= 200 && status < 300,
    json: json,
  });
  return {
    request: {
      get: get || (async () => mkRes(getStatus, getJson)),
      post: post || (async () => mkRes(200, async () => ({}))),
    },
  };
}

test('_probeJsonJourney: 2xx → ok', async () => {
  const runner = freshRunner();
  const res = await runner._probeJsonJourney({
    context: fakeContext({ getStatus: 200 }),
    fullUrl: 'http://x/api/health',
  });
  cleanup();
  assert.equal(res.ok, true);
});

test('_probeJsonJourney: non-2xx → not ok with HTTP reason', async () => {
  const runner = freshRunner();
  const res = await runner._probeJsonJourney({
    context: fakeContext({ getStatus: 503 }),
    fullUrl: 'http://x/api/health',
  });
  cleanup();
  assert.equal(res.ok, false);
  assert.match(res.reason, /HTTP 503/);
});

// ──────────────────────────────────────────────────────────────────────────
// _checkPageLoad — navigation + selector branches
// ──────────────────────────────────────────────────────────────────────────

// A fake Playwright page. `gotoStatus` drives navResp.status(); pass
// gotoStatus=null to simulate a no-response navigation. `present` is the set of
// selectors that count()>0; anything else is treated as not found and never
// resolves from waitForSelector (rejects after the supplied timeout fires).
function fakePage({ gotoStatus = 200, present = [] } = {}) {
  return {
    goto: async () => (gotoStatus === null ? null : { status: () => gotoStatus }),
    locator: (sel) => ({ first: () => ({ count: async () => (present.includes(sel) ? 1 : 0) }) }),
    waitForSelector: (sel) => (present.includes(sel)
      ? Promise.resolve({})
      : new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 0))),
  };
}

test('_checkPageLoad: nav HTTP >= 400 → not ok', async () => {
  const runner = freshRunner();
  const res = await runner._checkPageLoad({
    page: fakePage({ gotoStatus: 500 }),
    fullUrl: 'http://x/',
    selectorTimeoutMs: 5,
  });
  cleanup();
  assert.equal(res.ok, false);
  assert.match(res.reason, /navigation returned HTTP 500/);
});

test('_checkPageLoad: no navigation response → not ok', async () => {
  const runner = freshRunner();
  const res = await runner._checkPageLoad({
    page: fakePage({ gotoStatus: null }),
    fullUrl: 'http://x/',
    selectorTimeoutMs: 5,
  });
  cleanup();
  assert.equal(res.ok, false);
  assert.match(res.reason, /navigation returned HTTP no-response/);
});

test('_checkPageLoad: selector not found → not ok', async () => {
  const runner = freshRunner();
  const res = await runner._checkPageLoad({
    page: fakePage({ gotoStatus: 200, present: [] }),
    fullUrl: 'http://x/',
    expect: '#root, main',
    selectorTimeoutMs: 5,
  });
  cleanup();
  assert.equal(res.ok, false);
  assert.match(res.reason, /expected selector not found: "#root, main"/);
});

test('_checkPageLoad: selector present (fast count pass) → ok', async () => {
  const runner = freshRunner();
  const res = await runner._checkPageLoad({
    page: fakePage({ gotoStatus: 200, present: ['main'] }),
    fullUrl: 'http://x/',
    expect: '#root, main',
    selectorTimeoutMs: 5,
  });
  cleanup();
  assert.equal(res.ok, true);
});

test('_checkPageLoad: no expect → ok on clean nav', async () => {
  const runner = freshRunner();
  const res = await runner._checkPageLoad({
    page: fakePage({ gotoStatus: 200 }),
    fullUrl: 'http://x/',
    selectorTimeoutMs: 5,
  });
  cleanup();
  assert.equal(res.ok, true);
});

// ──────────────────────────────────────────────────────────────────────────
// _resolveAuthReadiness — auth-readiness branches
// ──────────────────────────────────────────────────────────────────────────

test('_resolveAuthReadiness: not configured → skipped with clear reason', async () => {
  const runner = freshRunner();
  const res = await runner._resolveAuthReadiness({
    context: fakeContext(),
    url: 'http://x',
    authConfigured: false,
    reuseStoredState: false,
    loginToken: undefined,
  });
  cleanup();
  assert.equal(res.authReady, false);
  assert.match(res.authSkipReason, /SMOKE_TEST_LOGIN_TOKEN \/ SMOKE_TEST_ACCOUNT_IDS not configured/);
});

test('_resolveAuthReadiness: stored state validates against /api/auth/me → reused, no fresh login', async () => {
  const runner = freshRunner();
  let postCalled = false;
  const context = fakeContext({
    get: async () => ({ status: () => 200, ok: () => true, json: async () => ({ accountId: '123' }) }),
    post: async () => { postCalled = true; return { status: () => 200, ok: () => true, json: async () => ({}) }; },
  });
  const res = await runner._resolveAuthReadiness({
    context, url: 'http://x', authConfigured: true, reuseStoredState: true, loginToken: 'tok',
  });
  cleanup();
  assert.equal(res.authReady, true);
  assert.equal(postCalled, false, 'fresh login should be skipped when stored state validates');
});

test('_resolveAuthReadiness: stale stored state → falls through to fresh login success', async () => {
  const runner = freshRunner();
  let captured = false;
  const context = fakeContext({
    // /api/auth/me reads as null (stale cookie)
    get: async () => ({ status: () => 200, ok: () => true, json: async () => null }),
    post: async () => ({ status: () => 200, ok: () => true, json: async () => ({}) }),
  });
  const res = await runner._resolveAuthReadiness({
    context, url: 'http://x', authConfigured: true, reuseStoredState: true, loginToken: 'tok',
    onCaptureState: async () => { captured = true; },
  });
  cleanup();
  assert.equal(res.authReady, true);
  assert.equal(captured, true, 'onCaptureState should run after a fresh login');
});

test('_resolveAuthReadiness: fresh login non-2xx → recorded as skip reason', async () => {
  const runner = freshRunner();
  const context = fakeContext({
    post: async () => ({ status: () => 401, ok: () => false, json: async () => ({}) }),
  });
  const res = await runner._resolveAuthReadiness({
    context, url: 'http://x', authConfigured: true, reuseStoredState: false, loginToken: 'tok',
  });
  cleanup();
  assert.equal(res.authReady, false);
  assert.match(res.authSkipReason, /test-login returned HTTP 401/);
});

test('_resolveAuthReadiness: fresh login throws → recorded as skip reason', async () => {
  const runner = freshRunner();
  const context = fakeContext({
    post: async () => { throw new Error('connection refused'); },
  });
  const res = await runner._resolveAuthReadiness({
    context, url: 'http://x', authConfigured: true, reuseStoredState: false, loginToken: 'tok',
  });
  cleanup();
  assert.equal(res.authReady, false);
  assert.match(res.authSkipReason, /test-login request failed: connection refused/);
});

test('_resolveAuthReadiness: onCaptureState throwing does not unset authReady', async () => {
  const runner = freshRunner();
  const context = fakeContext({
    post: async () => ({ status: () => 200, ok: () => true, json: async () => ({}) }),
  });
  const res = await runner._resolveAuthReadiness({
    context, url: 'http://x', authConfigured: true, reuseStoredState: false, loginToken: 'tok',
    onCaptureState: async () => { throw new Error('disk full'); },
  });
  cleanup();
  assert.equal(res.authReady, true, 'state-capture is best-effort; login still valid');
});

// ──────────────────────────────────────────────────────────────────────────
// _alertOwner — no-op when Discord bot unavailable
// ──────────────────────────────────────────────────────────────────────────

test('_alertOwner: no-op (no throw) when Discord bot unavailable', async () => {
  installStubDb();
  installStubBot(() => null); // getDiscordBot returns null
  const runner = freshRunner();
  await assert.doesNotReject(runner._alertOwner(1, 2, ['• thing: broke']));
  cleanup();
});

test('_alertOwner: no-op when bot lacks _dmOwner', async () => {
  installStubDb();
  installStubBot(() => ({})); // bot exists but no _dmOwner
  const runner = freshRunner();
  await assert.doesNotReject(runner._alertOwner(1, 1, ['• x: y']));
  cleanup();
});

test('_alertOwner: DMs the owner when bot is available', async () => {
  installStubDb();
  let dmArgs = null;
  installStubBot(() => ({ _dmOwner: async (msg, opts) => { dmArgs = { msg, opts }; } }));
  const runner = freshRunner();
  await runner._alertOwner(7, 2, ['• Home: broke', '• Leaderboard: broke'], []);
  cleanup();
  assert.ok(dmArgs, '_dmOwner should have been called');
  assert.match(dmArgs.msg, /run #7 reported 2 failing step\(s\)/);
});
