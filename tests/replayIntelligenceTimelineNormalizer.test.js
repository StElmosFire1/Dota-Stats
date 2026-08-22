// tests/replayIntelligenceTimelineNormalizer.test.js
//
// Full-edition replay intelligence — timeline normalizer tests.

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeTimeline,
  publicTimelineView,
  normalizeSamples,
  normalizeEvents,
  normalizeFights,
  normalizePlayerEntry,
  normalizeBuybackEvents,
  normalizeAbilityLog,
  normalizePurchaseLog,
  normalizeSmokeTimes,
  normalizeWardDeaths,
  normalizeRunePickups,
  normalizeLaneOutcomesSummary,
  MAX_MATCH_DURATION,
  MAX_SAMPLES,
  MAX_EVENTS,
  MAX_PLAYERS,
} = require('../src/replay/intelligence/timelineNormalizer');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePlayer(overrides = {}) {
  return {
    slot: 0,
    name: 'TestPlayer',
    team: 'radiant',
    samples: [
      { t: 0, nw: 0, xp: 0, lh: 0, dn: 0, level: 1 },
      { t: 300, nw: 3000, xp: 2000, lh: 25, dn: 3, level: 7 },
      { t: 600, nw: 7000, xp: 5000, lh: 55, dn: 7, level: 11 },
    ],
    buybackEvents: [{ t: 900, dieback: false }, { t: 1200, dieback: true }],
    abilityLog: [
      { heroLevel: 1, abilityName: 'hero_power', abilityLevel: 1, time: 0 },
      { heroLevel: 2, abilityName: 'hero_power', abilityLevel: 2, time: 60 },
    ],
    purchaseLog: [
      { itemName: 'item_blink', time: 900 },
      { itemName: 'item_black_king_bar', time: 1500 },
    ],
    smokeTimes: [300, 600],
    smokeSuccesses: 1,
    positions: [
      { t: 0, x: 100, y: 200 },
      { t: 10, x: 110, y: 210 },
    ],
    ...overrides,
  };
}

function makeTimeline(overrides = {}) {
  return {
    interval: 30,
    players: [makePlayer()],
    events: [
      { t: 500, type: 'kill', killerSlot: 0, victimSlot: 128, assistSlots: [1] },
      { t: 900, type: 'roshan', team: 'radiant', detail: 'killed' },
      { t: 1800, type: 'building_kill', team: 'radiant', buildingKey: 'npc_dota_goodguys_tower1_top' },
    ],
    fights: [
      { start_s: 490, end_s: 520, heroes: [0, 1, 128], winner: 'radiant', radiant_deaths: 0, dire_deaths: 1 },
    ],
    wardDeaths: [
      { t: 400, type: 'observer', slot: 128, team: 'dire' },
    ],
    runePickups: [
      { t: 120, type: 'bounty', slot: 0, team: 'radiant' },
      { t: 600, type: 'power_up', slot: 1, team: 'radiant' },
    ],
    laneOutcomesSummary: [
      { lane: 'safe', radiantNW: 8000, direNW: 4000, radiantXP: 7000, direXP: 4500, radiantKills: 2, direKills: 1, winner: 'radiant' },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalizeSamples
// ---------------------------------------------------------------------------

test('normalizeSamples: handles empty and null input', () => {
  assert.deepEqual(normalizeSamples(null), []);
  assert.deepEqual(normalizeSamples([]), []);
  assert.deepEqual(normalizeSamples('bad'), []);
});

test('normalizeSamples: clamps negative nw to 0', () => {
  const result = normalizeSamples([{ t: 10, nw: -500 }]);
  assert.equal(result[0].nw, 0);
});

test('normalizeSamples: replaces NaN t with 0', () => {
  const result = normalizeSamples([{ t: NaN, nw: 100 }]);
  assert.equal(result[0].t, 0);
});

test('normalizeSamples: clamps t above MAX_MATCH_DURATION', () => {
  const result = normalizeSamples([{ t: 99999, nw: 100 }]);
  assert.equal(result[0].t, MAX_MATCH_DURATION);
});

test('normalizeSamples: deduplicates by t, keeps first', () => {
  const result = normalizeSamples([
    { t: 100, nw: 1000 },
    { t: 100, nw: 2000 },
    { t: 200, nw: 3000 },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].nw, 1000);
});

test('normalizeSamples: sorts by t ascending', () => {
  const result = normalizeSamples([
    { t: 300, nw: 3000 },
    { t: 100, nw: 1000 },
    { t: 200, nw: 2000 },
  ]);
  assert.deepEqual(result.map(s => s.t), [100, 200, 300]);
});

test('normalizeSamples: clamps level to [1, 30]', () => {
  const result = normalizeSamples([
    { t: 0, level: -5 },
    { t: 1, level: 99 },
  ]);
  assert.equal(result[0].level, 1);
  assert.equal(result[1].level, 30);
});

test('normalizeSamples: caps at MAX_SAMPLES', () => {
  const huge = Array.from({ length: MAX_SAMPLES + 100 }, (_, i) => ({ t: i, nw: i }));
  const result = normalizeSamples(huge);
  assert.equal(result.length, MAX_SAMPLES);
});

test('normalizeSamples: omits absent optional fields', () => {
  const result = normalizeSamples([{ t: 10, nw: 500 }]);
  assert.ok(!('xp' in result[0]));
  assert.ok(!('lh' in result[0]));
  assert.ok('nw' in result[0]);
});

// ---------------------------------------------------------------------------
// normalizeEvents
// ---------------------------------------------------------------------------

test('normalizeEvents: handles null', () => {
  assert.deepEqual(normalizeEvents(null), []);
});

test('normalizeEvents: clamps t', () => {
  const result = normalizeEvents([{ t: -100, type: 'kill', killerSlot: 0, victimSlot: 1 }]);
  assert.equal(result[0].t, 0);
});

test('normalizeEvents: strips unknown event type but keeps it flagged', () => {
  const result = normalizeEvents([{ t: 10, type: 'secret_event' }]);
  assert.equal(result[0].type, 'secret_event');
  assert.equal(result[0]._unknownType, true);
});

test('normalizeEvents: known types have no _unknownType flag', () => {
  const result = normalizeEvents([{ t: 10, type: 'kill', victimSlot: 0 }]);
  assert.ok(!result[0]._unknownType);
});

test('normalizeEvents: no positions in events without includePositions', () => {
  const result = normalizeEvents([{ t: 10, type: 'kill', victimSlot: 0, x: 100, y: 200 }]);
  assert.ok(!('x' in result[0]));
  assert.ok(!('y' in result[0]));
});

test('normalizeEvents: includes positions when includePositions=true and type is position event', () => {
  const result = normalizeEvents(
    [{ t: 10, type: 'kill', victimSlot: 0, x: 100, y: 200 }],
    { includePositions: true }
  );
  assert.equal(result[0].x, 100);
  assert.equal(result[0].y, 200);
});

test('normalizeEvents: preserves team as radiant/dire only', () => {
  const result = normalizeEvents([
    { t: 10, type: 'roshan', team: 'radiant' },
    { t: 20, type: 'roshan', team: 'INVALID' },
  ]);
  assert.equal(result[0].team, 'radiant');
  assert.equal(result[1].team, 'dire'); // invalid → 'dire' by default in our guard
});

test('normalizeEvents: sorts ascending by t', () => {
  const result = normalizeEvents([
    { t: 500, type: 'kill', victimSlot: 1 },
    { t: 100, type: 'kill', victimSlot: 2 },
    { t: 300, type: 'roshan' },
  ]);
  assert.deepEqual(result.map(e => e.t), [100, 300, 500]);
});

test('normalizeEvents: caps at MAX_EVENTS', () => {
  const huge = Array.from({ length: MAX_EVENTS + 100 }, (_, i) => ({ t: i, type: 'kill', victimSlot: 0 }));
  const result = normalizeEvents(huge);
  assert.equal(result.length, MAX_EVENTS);
});

// ---------------------------------------------------------------------------
// normalizeFights
// ---------------------------------------------------------------------------

test('normalizeFights: handles null', () => {
  assert.deepEqual(normalizeFights(null), []);
});

test('normalizeFights: drops fights where end < start', () => {
  const result = normalizeFights([{ start_s: 500, end_s: 400, heroes: [], winner: 'radiant', radiant_deaths: 0, dire_deaths: 0 }]);
  assert.equal(result.length, 0);
});

test('normalizeFights: normalizes winner to draw for unknown values', () => {
  const result = normalizeFights([{ start_s: 100, end_s: 200, heroes: [], winner: 'neutral', radiant_deaths: 0, dire_deaths: 0 }]);
  assert.equal(result[0].winner, 'draw');
});

test('normalizeFights: clamps death counts', () => {
  const result = normalizeFights([{ start_s: 100, end_s: 200, heroes: [], winner: 'radiant', radiant_deaths: -3, dire_deaths: -1 }]);
  assert.equal(result[0].radiant_deaths, 0);
  assert.equal(result[0].dire_deaths, 0);
});

test('normalizeFights: sorts by start_s ascending', () => {
  const result = normalizeFights([
    { start_s: 500, end_s: 540, heroes: [], winner: 'radiant', radiant_deaths: 0, dire_deaths: 0 },
    { start_s: 100, end_s: 140, heroes: [], winner: 'dire', radiant_deaths: 0, dire_deaths: 0 },
  ]);
  assert.equal(result[0].start_s, 100);
  assert.equal(result[1].start_s, 500);
});

// ---------------------------------------------------------------------------
// normalizeBuybackEvents
// ---------------------------------------------------------------------------

test('normalizeBuybackEvents: handles null', () => {
  assert.deepEqual(normalizeBuybackEvents(null), []);
});

test('normalizeBuybackEvents: normalizes dieback to boolean', () => {
  const result = normalizeBuybackEvents([{ t: 100, dieback: 1 }]);
  assert.equal(result[0].dieback, false); // 1 !== true
});

test('normalizeBuybackEvents: true dieback preserved', () => {
  const result = normalizeBuybackEvents([{ t: 100, dieback: true }]);
  assert.equal(result[0].dieback, true);
});

// ---------------------------------------------------------------------------
// normalizeAbilityLog
// ---------------------------------------------------------------------------

test('normalizeAbilityLog: handles null', () => {
  assert.deepEqual(normalizeAbilityLog(null), []);
});

test('normalizeAbilityLog: clamps heroLevel to [1, 30]', () => {
  const result = normalizeAbilityLog([
    { heroLevel: -1, abilityName: 'ability_a', abilityLevel: 1, time: 0 },
    { heroLevel: 99, abilityName: 'ability_b', abilityLevel: 1, time: 100 },
  ]);
  assert.equal(result[0].heroLevel, 1);
  assert.equal(result[1].heroLevel, 30);
});

test('normalizeAbilityLog: truncates long ability names', () => {
  const longName = 'a'.repeat(200);
  const result = normalizeAbilityLog([{ heroLevel: 1, abilityName: longName, abilityLevel: 1, time: 0 }]);
  assert.ok(result[0].abilityName.length <= 64);
});

// ---------------------------------------------------------------------------
// normalizePurchaseLog
// ---------------------------------------------------------------------------

test('normalizePurchaseLog: drops entries with no itemName', () => {
  const result = normalizePurchaseLog([
    { itemName: '', time: 100 },
    { itemName: null, time: 200 },
    { itemName: 'item_blink', time: 300 },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].itemName, 'item_blink');
});

test('normalizePurchaseLog: sorts by time', () => {
  const result = normalizePurchaseLog([
    { itemName: 'item_blink', time: 500 },
    { itemName: 'item_boots', time: 100 },
  ]);
  assert.equal(result[0].itemName, 'item_boots');
});

// ---------------------------------------------------------------------------
// normalizeSmokeTimes
// ---------------------------------------------------------------------------

test('normalizeSmokeTimes: accepts plain numbers', () => {
  const result = normalizeSmokeTimes([300, 600, 900]);
  assert.deepEqual(result, [300, 600, 900]);
});

test('normalizeSmokeTimes: accepts {t} objects', () => {
  const result = normalizeSmokeTimes([{ t: 300 }, { t: 100 }]);
  assert.deepEqual(result, [100, 300]);
});

test('normalizeSmokeTimes: drops nulls', () => {
  const result = normalizeSmokeTimes([null, 200, undefined, 100]);
  assert.deepEqual(result, [100, 200]);
});

// ---------------------------------------------------------------------------
// normalizeWardDeaths
// ---------------------------------------------------------------------------

test('normalizeWardDeaths: handles empty', () => {
  assert.deepEqual(normalizeWardDeaths([]), []);
});

test('normalizeWardDeaths: normalizes team field', () => {
  const result = normalizeWardDeaths([
    { t: 100, type: 'observer', slot: 0, team: 'radiant' },
    { t: 200, type: 'sentry',   slot: 1, team: 'INVALID' },
  ]);
  assert.equal(result[0].team, 'radiant');
  assert.equal(result[1].team, 'dire'); // fallback
});

// ---------------------------------------------------------------------------
// normalizeRunePickups
// ---------------------------------------------------------------------------

test('normalizeRunePickups: returns sorted by t', () => {
  const result = normalizeRunePickups([
    { t: 300, type: 'power_up', slot: 1, team: 'dire' },
    { t: 120, type: 'bounty',   slot: 0, team: 'radiant' },
  ]);
  assert.equal(result[0].t, 120);
  assert.equal(result[1].t, 300);
});

// ---------------------------------------------------------------------------
// normalizeLaneOutcomesSummary
// ---------------------------------------------------------------------------

test('normalizeLaneOutcomesSummary: normalizes winner to even for unknown', () => {
  const result = normalizeLaneOutcomesSummary([
    { lane: 'mid', radiantNW: 5000, direNW: 5000, radiantXP: 4000, direXP: 4000, radiantKills: 0, direKills: 0, winner: 'INVALID' },
  ]);
  assert.equal(result[0].winner, 'even');
});

test('normalizeLaneOutcomesSummary: unknown lane becomes unknown', () => {
  const result = normalizeLaneOutcomesSummary([
    { lane: 'jungle', radiantNW: 0, direNW: 0, radiantXP: 0, direXP: 0, radiantKills: 0, direKills: 0, winner: 'even' },
  ]);
  assert.equal(result[0].lane, 'unknown');
});

test('normalizeLaneOutcomesSummary: drops null entries', () => {
  const result = normalizeLaneOutcomesSummary([null, undefined, { lane: 'safe', radiantNW: 0, direNW: 0, radiantXP: 0, direXP: 0, radiantKills: 0, direKills: 0, winner: 'even' }]);
  assert.equal(result.length, 1);
});

// ---------------------------------------------------------------------------
// normalizePlayerEntry
// ---------------------------------------------------------------------------

test('normalizePlayerEntry: returns null for null input', () => {
  assert.equal(normalizePlayerEntry(null), null);
});

test('normalizePlayerEntry: excludes positions by default (public context)', () => {
  const p = makePlayer();
  const result = normalizePlayerEntry(p, { includePositions: false });
  assert.ok(!('positions' in result));
});

test('normalizePlayerEntry: includes positions when includePositions=true', () => {
  const p = makePlayer();
  const result = normalizePlayerEntry(p, { includePositions: true });
  assert.ok(Array.isArray(result.positions));
  assert.ok(result.positions.length > 0);
});

test('normalizePlayerEntry: truncates name to 64 chars', () => {
  const p = makePlayer({ name: 'X'.repeat(200) });
  const result = normalizePlayerEntry(p);
  assert.ok(result.name.length <= 64);
});

test('normalizePlayerEntry: normalizes team', () => {
  const p = makePlayer({ team: 'DIRE' });
  const result = normalizePlayerEntry(p);
  assert.equal(result.team, null); // invalid
  const p2 = makePlayer({ team: 'dire' });
  assert.equal(normalizePlayerEntry(p2).team, 'dire');
});

test('normalizePlayerEntry: smokeSuccesses clamped to non-negative', () => {
  const p = makePlayer({ smokeSuccesses: -5 });
  const result = normalizePlayerEntry(p);
  assert.equal(result.smokeSuccesses, 0);
});

// ---------------------------------------------------------------------------
// normalizeTimeline — master
// ---------------------------------------------------------------------------

test('normalizeTimeline: handles null input', () => {
  const result = normalizeTimeline(null);
  assert.deepEqual(result.players, []);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.fights, []);
});

test('normalizeTimeline: public context strips positions from player entries', () => {
  const tl = makeTimeline();
  const result = normalizeTimeline(tl, 'public');
  for (const p of result.players) {
    assert.ok(!('positions' in p), 'positions must be absent in public context');
  }
});

test('normalizeTimeline: participant context includes positions', () => {
  const tl = makeTimeline();
  const result = normalizeTimeline(tl, 'participant');
  const p = result.players[0];
  assert.ok(Array.isArray(p.positions), 'positions must be present in participant context');
  assert.ok(p.positions.length > 0);
});

test('normalizeTimeline: admin context also includes positions', () => {
  const tl = makeTimeline();
  const result = normalizeTimeline(tl, 'admin');
  assert.ok(Array.isArray(result.players[0].positions));
});

test('normalizeTimeline: caps players at MAX_PLAYERS', () => {
  const tl = makeTimeline();
  tl.players = Array.from({ length: MAX_PLAYERS + 5 }, (_, i) => makePlayer({ slot: i }));
  const result = normalizeTimeline(tl, 'public');
  assert.ok(result.players.length <= MAX_PLAYERS);
});

test('normalizeTimeline: never propagates chat, replay_path', () => {
  const tl = { ...makeTimeline(), chat_log: 'secret', replay_path: '/data/foo.dem' };
  const result = normalizeTimeline(tl, 'admin');
  assert.ok(!('chat_log' in result));
  assert.ok(!('replay_path' in result));
});

test('normalizeTimeline: interval defaults to 30 when non-numeric', () => {
  assert.equal(normalizeTimeline({ interval: 'bad', players: [], events: [] }).interval, 30);
  assert.equal(normalizeTimeline({ interval: null }).interval, 30);
  assert.equal(normalizeTimeline({ interval: NaN }).interval, 30);
  assert.equal(normalizeTimeline({ interval: Infinity }).interval, 30);
});

test('normalizeTimeline: interval clamped to [1, 300]', () => {
  // 0 is finite and numeric but below 1, so clamped to 1
  assert.equal(normalizeTimeline({ interval: 0 }).interval, 1);
  assert.equal(normalizeTimeline({ interval: 500 }).interval, 300);
  assert.equal(normalizeTimeline({ interval: 10 }).interval, 10);
  assert.equal(normalizeTimeline({ interval: 30 }).interval, 30);
});

test('normalizeTimeline: unknown events preserved with _unknownType flag', () => {
  const tl = makeTimeline({ events: [{ t: 10, type: 'my_custom_event' }] });
  const result = normalizeTimeline(tl, 'public');
  const ev = result.events.find(e => e.type === 'my_custom_event');
  assert.ok(ev);
  assert.equal(ev._unknownType, true);
});

// ---------------------------------------------------------------------------
// publicTimelineView
// ---------------------------------------------------------------------------

test('publicTimelineView: removes purchaseLog and positions', () => {
  const tl = makeTimeline();
  const normalized = normalizeTimeline(tl, 'participant');
  const view = publicTimelineView(normalized);

  // positions should be gone
  for (const p of view.players) {
    assert.ok(!('positions' in p), 'positions should be stripped');
    // purchaseLog should be undefined (removed)
    assert.equal(p.purchaseLog, undefined);
    // purchaseCount should be present
    assert.ok(typeof p.purchaseCount === 'number');
  }
});

test('publicTimelineView: returns null for null input', () => {
  assert.equal(publicTimelineView(null), null);
});

test('publicTimelineView: purchaseCount reflects original log length', () => {
  const tl = makeTimeline();
  const normalized = normalizeTimeline(tl, 'participant');
  // Make sure the player has 2 purchases
  const view = publicTimelineView(normalized);
  assert.equal(view.players[0].purchaseCount, 2);
});
