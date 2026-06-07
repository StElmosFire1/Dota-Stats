// Task #313 / #830 / #834 — coverage for the GC reliability watchdog in
// src/steam/steamClient.js. We instantiate the class directly and stub
// only the inner `steamClient`'s `gamesPlayed` call. The module pulls in
// `steam-user`, `steam-totp`, the dota2GC submodule, and the config
// module at require-time; we satisfy each with the smallest possible
// stub via require.cache so we never load the real Steam stack.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

function stub(modPath, exports) {
  const resolved = require.resolve(modPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// External deps — minimal shape needed by steamClient at require time.
function fakeSteamUserClass() {
  function FakeSteamUser() {}
  FakeSteamUser.EPersonaState = { Online: 1 };
  FakeSteamUser.EFriendRelationship = { Friend: 3, RequestRecipient: 2 };
  FakeSteamUser.prototype.on = function () {};
  FakeSteamUser.prototype.setPersona = function () {};
  return FakeSteamUser;
}
// We can't easily require.cache an unloaded external package by spec name
// without resolving it first, so use Module._load directly.
const Module = require('node:module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'steam-user') return fakeSteamUserClass();
  if (request === 'steam-totp') return { generateAuthCode: () => '' };
  return origLoad.call(this, request, parent, isMain);
};

// Stub the dota2GC submodule and config.
stub('../src/steam/dota2GC', { Dota2GCClient: class { on() {} shutdown() {} }, DOTA2_APPID: 570 });
stub('../src/config', { config: { steam: {} } });

const { SteamDotaClient } = require('../src/steam/steamClient');

function buildClient() {
  const c = new SteamDotaClient();
  c.isLoggedIn = true;
  const calls = [];
  c.steamClient = { gamesPlayed: (arg) => calls.push(arg) };
  return { c, calls };
}

// Attach a stub GC client whose health-ping responds (alive) or not (dead).
function attachGc(c, { alive }) {
  let pings = 0;
  c.isGCReady = true;
  c.gcClient = {
    // A real requestProfileCard resolves a non-null card object on success and
    // null on its internal timeout. Mirror that contract here.
    requestProfileCard: async () => { pings++; return alive ? { rankTier: null } : null; },
  };
  c.steamClient.steamID = { accountid: 4242 };
  return { pingCount: () => pings };
}

test('GC watchdog does not kick while activity is recent', async () => {
  const { c, calls } = buildClient();
  let now = 1_000_000;
  c._lastGcActivityAt = now;
  c._startGcWatchdog({ intervalMs: 5, thresholdMs: 100, now: () => now });
  now += 50; // still under threshold
  await new Promise((r) => setTimeout(r, 25));
  c._stopGcWatchdog();
  assert.strictEqual(calls.length, 0, 'should not have kicked yet');
});

test('GC watchdog no-op when not logged in', async () => {
  const { c, calls } = buildClient();
  c.isLoggedIn = false;
  attachGc(c, { alive: false });
  let now = 1_000_000;
  c._lastGcActivityAt = now;
  c._startGcWatchdog({ intervalMs: 5, thresholdMs: 100, pingThresholdMs: 40, maxPingFailures: 1, now: () => now });
  now += 200;
  await new Promise((r) => setTimeout(r, 25));
  c._stopGcWatchdog();
  assert.strictEqual(calls.length, 0, 'must not kick when not logged in');
});

// Task #834 (a) — an idle-but-healthy GC whose health ping responds must NEVER
// be kicked, across many silence windows. This is the core regression: the bot
// must stop re-opening Dota every few minutes on a healthy connection.
test('GC watchdog never kicks a healthy-but-idle GC across many windows', async () => {
  const { c, calls } = buildClient();
  let now = 1_000_000;
  c._lastGcActivityAt = now;
  const gc = attachGc(c, { alive: true });
  let kicked = false;
  c.on('gcWatchdogKick', () => { kicked = true; });
  c._startGcWatchdog({ intervalMs: 5, thresholdMs: 100, pingThresholdMs: 40, maxPingFailures: 2, now: () => now });
  // Simulate many silence windows. Each window we push past the ping threshold
  // (but never past the kick threshold in a single step); the responsive ping
  // resets the clock so silence never reaches the kick threshold.
  for (let i = 0; i < 12; i++) {
    now += 60; // >= pingThreshold (40), < threshold (100)
    await new Promise((r) => setTimeout(r, 15)); // allow tick + async ping to resolve
  }
  c._stopGcWatchdog();
  assert.ok(gc.pingCount() >= 1, 'a quiet-but-healthy GC should have been probed');
  assert.strictEqual(kicked, false, 'a responsive GC must never be kicked');
  assert.strictEqual(calls.length, 0, 'no gamesPlayed re-hello for a healthy GC');
  assert.strictEqual(c._gcConsecutivePingFailures || 0, 0, 'failure counter stays at zero for a healthy GC');
});

// Task #834 (b) — a genuinely silent GC whose ping never responds still
// triggers exactly one recovery kick per silence window, only after the
// consecutive-failure threshold is crossed.
test('GC watchdog kicks a truly silent GC once per window after repeated failed pings', async () => {
  const { c, calls } = buildClient();
  let now = 1_000_000;
  c._lastGcActivityAt = now;
  attachGc(c, { alive: false });
  let kicks = 0;
  c.on('gcWatchdogKick', () => { kicks++; });
  c._startGcWatchdog({ intervalMs: 5, thresholdMs: 100, pingThresholdMs: 40, maxPingFailures: 2, now: () => now });

  // Accumulate failed pings while still under the kick threshold.
  now += 50; // >= pingThreshold (40), < threshold (100)
  await new Promise((r) => setTimeout(r, 20));
  now += 20; // 70
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(kicks, 0, 'must not kick before the silence threshold is crossed');
  assert.ok((c._gcConsecutivePingFailures || 0) >= 2, 'failed pings should have accumulated');

  // Cross the kick threshold — now both conditions (silence + failures) hold.
  now += 40; // 110 >= threshold (100)
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(kicks, 1, 'exactly one kick for a truly silent GC this window');
  assert.deepStrictEqual(calls[0], [], 'kick clears gamesPlayed first (re-hello start)');

  c._stopGcWatchdog();
});

// Silence alone, with no failed pings, must never kick — proves the kick is
// gated on demonstrated unresponsiveness, not mere idleness.
test('GC watchdog does not kick on pure silence without ping failures', async () => {
  const { c, calls } = buildClient();
  let now = 1_000_000;
  c._lastGcActivityAt = now;
  // No gcClient attached, so the health ping is a no-op and never records a
  // failure. Even far past the threshold, the kick must not fire.
  let kicked = false;
  c.on('gcWatchdogKick', () => { kicked = true; });
  c._startGcWatchdog({ intervalMs: 5, thresholdMs: 100, pingThresholdMs: 40, maxPingFailures: 2, now: () => now });
  now += 500; // way past the threshold
  await new Promise((r) => setTimeout(r, 30));
  c._stopGcWatchdog();
  assert.strictEqual(kicked, false, 'no kick without demonstrated ping failures');
  assert.strictEqual(calls.length, 0, 'no gamesPlayed re-hello on pure silence');
});

test('GC watchdog is single-flight (second start is no-op)', () => {
  const { c } = buildClient();
  c._startGcWatchdog({ intervalMs: 100000, thresholdMs: 1, now: () => 0 });
  const t1 = c._gcWatchdogTimer;
  c._startGcWatchdog({ intervalMs: 100000, thresholdMs: 1, now: () => 0 });
  assert.strictEqual(c._gcWatchdogTimer, t1, 'second start should not replace the timer');
  c._stopGcWatchdog();
  assert.strictEqual(c._gcWatchdogTimer, null);
});
