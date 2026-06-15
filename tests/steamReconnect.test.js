// Task #840 — coverage for the Steam-reconnect path in
// src/steam/steamClient.js. Besides the GC watchdog kick, the OTHER thing
// that re-sends the `gamesPlayed([570])` GC hello (and visibly re-opens Dota)
// is `loggedOn` re-firing on every Steam-level auto-reconnect. These tests
// assert that:
//   • the first login launches Dota exactly once;
//   • a reconnect where the GC is still established does NOT re-open Dota;
//   • a reconnect where the GC was lost DOES re-open Dota to recover it;
//   • rapid reconnect storms are debounced into a single re-open;
//   • the GC client is created once and reused (no listener accumulation).
//
// We instantiate the class directly and stub the inner deps via require.cache /
// Module._load, mirroring tests/gcWatchdog.test.js so we never load the real
// Steam stack.

const test = require('node:test');
const assert = require('node:assert');

function stub(modPath, exports) {
  const resolved = require.resolve(modPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function fakeSteamUserClass() {
  function FakeSteamUser() {}
  FakeSteamUser.EPersonaState = { Online: 1 };
  FakeSteamUser.EFriendRelationship = { Friend: 3, RequestRecipient: 2 };
  FakeSteamUser.prototype.on = function () {};
  FakeSteamUser.prototype.setPersona = function () {};
  return FakeSteamUser;
}

const Module = require('node:module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'steam-user') return fakeSteamUserClass();
  if (request === 'steam-totp') return { generateAuthCode: () => '' };
  return origLoad.call(this, request, parent, isMain);
};

// A stub GC client that counts how many `.on` listeners get bound to it, so we
// can prove the real client isn't recreated (and re-bound) on every re-login.
class FakeGcClient {
  constructor() { this.listenerBinds = 0; }
  on() { this.listenerBinds++; return this; }
  shutdown() {}
}
let gcConstructCount = 0;
let lastGc = null;
stub('../src/steam/dota2GC', {
  Dota2GCClient: class extends FakeGcClient {
    constructor() { super(); gcConstructCount++; lastGc = this; }
  },
  DOTA2_APPID: 570,
});
stub('../src/config', { config: { steam: {} } });

const { SteamDotaClient } = require('../src/steam/steamClient');

function buildClient() {
  gcConstructCount = 0;
  lastGc = null;
  const c = new SteamDotaClient();
  const calls = [];
  c.steamClient = {
    gamesPlayed: (arg) => calls.push(arg),
    setPersona: () => {},
    steamID: { accountid: 4242 },
  };
  return { c, calls };
}

test('first login opens Dota exactly once and creates one GC client', () => {
  const { c, calls } = buildClient();
  c._handleLoggedOn();
  assert.deepStrictEqual(calls, [[570]], 'first login should send a single gamesPlayed hello');
  assert.strictEqual(gcConstructCount, 1, 'exactly one GC client created on first login');
});

test('reconnect with GC still established does NOT re-open Dota', () => {
  const { c, calls } = buildClient();
  c._handleLoggedOn();          // initial login → one hello
  c.isGCReady = true;           // GC came up and is alive
  c._handleLoggedOn();          // simulate a Steam reconnect re-firing loggedOn
  assert.deepStrictEqual(calls, [[570]], 'no extra hello when the GC is already alive');
  assert.strictEqual(gcConstructCount, 1, 'GC client reused, not recreated');
});

test('reconnect with GC lost DOES re-open Dota to recover it', () => {
  const { c, calls } = buildClient();
  c._handleLoggedOn();          // initial login → one hello
  // Simulate a genuine Steam drop: the disconnected handler clears these.
  c.isGCReady = false;
  // Bypass the debounce window so this models a reconnect minutes later.
  c._lastGamesPlayedHelloAt = Date.now() - 60 * 1000;
  c._handleLoggedOn();          // reconnect with a dead GC
  assert.deepStrictEqual(calls, [[570], [570]], 'a lost GC is recovered with a fresh hello');
  assert.strictEqual(gcConstructCount, 1, 'GC client still reused across reconnect');
});

test('rapid reconnect storm is debounced to a single re-open', () => {
  const { c, calls } = buildClient();
  c._handleLoggedOn();          // initial login → one hello
  c.isGCReady = false;          // GC lost
  // Model a reconnect storm minutes after the initial hello: expire the
  // debounce window so the FIRST storm event genuinely re-opens Dota, then
  // fire several more in quick succession (no time advance) — those must all
  // fall inside the debounce window and be suppressed.
  c._lastGamesPlayedHelloAt = Date.now() - 60 * 1000;
  c._handleLoggedOn();
  c._handleLoggedOn();
  c._handleLoggedOn();
  assert.deepStrictEqual(calls, [[570], [570]], 'storm collapses to one recovery hello');
  assert.strictEqual(gcConstructCount, 1, 'no GC client churn during a storm');
});

test('GC client and its listeners are bound exactly once across many re-logins', () => {
  const { c } = buildClient();
  c._handleLoggedOn();
  const bindsAfterFirst = lastGc.listenerBinds;
  assert.ok(bindsAfterFirst > 0, 'listeners bound on first login');
  // Many subsequent re-logins must not re-bind listeners (the leak we fixed).
  for (let i = 0; i < 10; i++) {
    c.isGCReady = false;
    c._lastGamesPlayedHelloAt = Date.now() - 60 * 1000;
    c._handleLoggedOn();
  }
  assert.strictEqual(gcConstructCount, 1, 'still exactly one GC client after 10 re-logins');
  assert.strictEqual(lastGc.listenerBinds, bindsAfterFirst, 'listeners never re-bound on re-login');
});
