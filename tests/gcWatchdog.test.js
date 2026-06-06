// Task #313 — coverage for the GC reliability watchdog in
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
// without resolving it first, so use Module._cache directly with a fabricated
// id. The simpler route: shim via Module._load.
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

test('GC watchdog kicks after silence exceeds threshold', async () => {
  const { c, calls } = buildClient();
  let now = 1_000_000;
  c._lastGcActivityAt = now;
  let kicked = null;
  c.on('gcWatchdogKick', (info) => { kicked = info; });
  c._startGcWatchdog({ intervalMs: 5, thresholdMs: 100, now: () => now });
  now += 200; // past threshold
  await new Promise((r) => setTimeout(r, 30));
  c._stopGcWatchdog();
  assert.ok(kicked, 'gcWatchdogKick should have fired');
  assert.ok(kicked.silentForMs >= 100);
  assert.deepStrictEqual(calls[0], [], 'first call clears gamesPlayed (re-hello start)');
});

test('GC watchdog no-op when not logged in', async () => {
  const { c, calls } = buildClient();
  c.isLoggedIn = false;
  let now = 1_000_000;
  c._lastGcActivityAt = now;
  c._startGcWatchdog({ intervalMs: 5, thresholdMs: 100, now: () => now });
  now += 200;
  await new Promise((r) => setTimeout(r, 25));
  c._stopGcWatchdog();
  assert.strictEqual(calls.length, 0, 'must not kick when not logged in');
});

test('GC watchdog probes a quiet GC and stays quiet when it responds', async () => {
  const { c, calls } = buildClient();
  let now = 1_000_000;
  c._lastGcActivityAt = now;
  c.isGCReady = true;
  let pings = 0;
  // Simulate a healthy GC: the probe elicits a response that bumps the clock.
  c.gcClient = {
    requestProfileCard: () => { pings++; now += 1; c._lastGcActivityAt = now; return Promise.resolve(null); },
  };
  c.steamClient.steamID = { accountid: 4242 };
  let kicked = false;
  c.on('gcWatchdogKick', () => { kicked = true; });
  c._startGcWatchdog({ intervalMs: 5, thresholdMs: 100, pingThresholdMs: 40, now: () => now });
  now += 60; // past the ping threshold, still under the kick threshold
  await new Promise((r) => setTimeout(r, 40));
  c._stopGcWatchdog();
  assert.ok(pings >= 1, 'a quiet GC should have been probed');
  assert.strictEqual(kicked, false, 'a responsive GC must never be kicked');
  assert.strictEqual(calls.length, 0, 'no gamesPlayed re-hello for a healthy GC');
});

test('GC watchdog probes then still kicks when the GC never responds', async () => {
  const { c, calls } = buildClient();
  let now = 1_000_000;
  c._lastGcActivityAt = now;
  c.isGCReady = true;
  let pings = 0;
  // Dead GC: probe is sent but no response ever bumps the clock.
  c.gcClient = { requestProfileCard: () => { pings++; return Promise.resolve(null); } };
  c.steamClient.steamID = { accountid: 4242 };
  let kicked = false;
  c.on('gcWatchdogKick', () => { kicked = true; });
  c._startGcWatchdog({ intervalMs: 5, thresholdMs: 100, pingThresholdMs: 40, now: () => now });
  now += 60; // probe window (>= pingThreshold, < threshold)
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(pings >= 1, 'a quiet GC should have been probed before kicking');
  assert.strictEqual(kicked, false, 'must not kick while still under the threshold');
  now += 60; // now past the kick threshold with no response
  await new Promise((r) => setTimeout(r, 20));
  c._stopGcWatchdog();
  assert.strictEqual(kicked, true, 'a truly silent GC must still be kicked');
  assert.deepStrictEqual(calls[0], [], 'kick clears gamesPlayed (re-hello start)');
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
