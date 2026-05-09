// Task #217 — unit tests for the in-memory voice-pack event queue.
const { test } = require('node:test');
const assert = require('node:assert');

const queue = require('../src/web/voiceEventQueue');

function reset() { queue._resetForTests(); }

test('drainVoiceEvents returns empty for unknown account', () => {
  reset();
  assert.deepStrictEqual(queue.drainVoiceEvents(123), []);
});

test('pushVoiceEvent persists, drainVoiceEvents clears', () => {
  reset();
  queue.pushVoiceEvent(42, 'win');
  queue.pushVoiceEvent(42, 'first-blood');
  const events = queue.drainVoiceEvents(42);
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[0].event, 'win');
  assert.strictEqual(events[1].event, 'first-blood');
  assert.deepStrictEqual(queue.drainVoiceEvents(42), []);
});

test('pushVoiceEvent rejects invalid event names and zero/null accountIds', () => {
  reset();
  queue.pushVoiceEvent(42, 'bogus-event');
  queue.pushVoiceEvent(0, 'win');
  queue.pushVoiceEvent(null, 'win');
  queue.pushVoiceEvent(-1, 'win');
  assert.deepStrictEqual(queue.drainVoiceEvents(42), []);
  assert.deepStrictEqual(queue.drainVoiceEvents(0), []);
});

test('pushVoiceEvent caps queue at MAX_EVENTS_PER_ACCOUNT', () => {
  reset();
  const overflow = queue.MAX_EVENTS_PER_ACCOUNT + 5;
  for (let i = 0; i < overflow; i++) queue.pushVoiceEvent(7, 'win');
  const events = queue.drainVoiceEvents(7);
  assert.strictEqual(events.length, queue.MAX_EVENTS_PER_ACCOUNT);
});

test('pushMatchVoiceEvents emits win/loss + first-blood for every player', () => {
  reset();
  const matchStats = {
    radiantWin: true,
    players: [
      { accountId: 100, team: 'radiant', firstbloodClaimed: 1 },
      { accountId: 200, team: 'radiant' },
      { accountId: 300, team: 'dire' },
      { accountId: 0, team: 'radiant' }, // anon — must be skipped
    ],
  };
  queue.pushMatchVoiceEvents(matchStats);

  const e100 = queue.drainVoiceEvents(100).map(e => e.event);
  const e200 = queue.drainVoiceEvents(200).map(e => e.event);
  const e300 = queue.drainVoiceEvents(300).map(e => e.event);
  const e0 = queue.drainVoiceEvents(0);

  assert.deepStrictEqual(e100, ['win', 'first-blood']);
  assert.deepStrictEqual(e200, ['win', 'first-blood']);
  assert.deepStrictEqual(e300, ['loss', 'first-blood']);
  assert.deepStrictEqual(e0, []);
});

test('pushMatchVoiceEvents skips first-blood when no killer recorded', () => {
  reset();
  queue.pushMatchVoiceEvents({
    radiantWin: false,
    players: [
      { accountId: 100, team: 'radiant' },
      { accountId: 200, team: 'dire' },
    ],
  });
  assert.deepStrictEqual(queue.drainVoiceEvents(100).map(e => e.event), ['loss']);
  assert.deepStrictEqual(queue.drainVoiceEvents(200).map(e => e.event), ['win']);
});

test('pushMatchVoiceEvents accepts snake_case firstblood_claimed', () => {
  reset();
  queue.pushMatchVoiceEvents({
    radiantWin: true,
    players: [
      { accountId: 100, team: 'radiant', firstblood_claimed: 1 },
      { accountId: 200, team: 'dire' },
    ],
  });
  const e100 = queue.drainVoiceEvents(100).map(e => e.event);
  assert.deepStrictEqual(e100, ['win', 'first-blood']);
});

test('pushMatchVoiceEvents handles player_slot fallback (no team field)', () => {
  reset();
  queue.pushMatchVoiceEvents({
    radiantWin: true,
    players: [
      { accountId: 100, player_slot: 0 },     // radiant
      { accountId: 200, player_slot: 128 },   // dire
    ],
  });
  assert.deepStrictEqual(queue.drainVoiceEvents(100).map(e => e.event), ['win']);
  assert.deepStrictEqual(queue.drainVoiceEvents(200).map(e => e.event), ['loss']);
});

test('pushMatchVoiceEvents tolerates malformed input', () => {
  reset();
  queue.pushMatchVoiceEvents(null);
  queue.pushMatchVoiceEvents({});
  queue.pushMatchVoiceEvents({ players: 'not-an-array' });
  assert.ok(true); // didn't throw
});

test('pushAchievementVoiceEvents emits achievement-unlock per granted player', () => {
  reset();
  queue.pushAchievementVoiceEvents([
    { player: { accountId: 100 }, newOnes: [{ key: 'first_win' }] },
    { player: { accountId: 200 }, newOnes: [{ key: 'mvp' }, { key: 'streak5' }] },
    { player: { accountId: 0 }, newOnes: [{ key: 'x' }] },     // anon — skipped
    null,                                                       // tolerated
    { player: null, newOnes: [] },                              // tolerated
  ]);
  assert.deepStrictEqual(queue.drainVoiceEvents(100).map(e => e.event), ['achievement-unlock']);
  assert.deepStrictEqual(queue.drainVoiceEvents(200).map(e => e.event), ['achievement-unlock']);
  assert.deepStrictEqual(queue.drainVoiceEvents(0), []);
});

test('pushAchievementVoiceEvents tolerates non-array input', () => {
  reset();
  queue.pushAchievementVoiceEvents(null);
  queue.pushAchievementVoiceEvents(undefined);
  queue.pushAchievementVoiceEvents('nope');
  assert.ok(true); // didn't throw
});
