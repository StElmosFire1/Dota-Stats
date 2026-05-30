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
const Module = require('module');

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
