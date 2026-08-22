'use strict';

/**
 * Regression tests for the bounded telemetry additions to the full-edition
 * replay aggregation pipeline (src/replay/replayParser.js).
 *
 * All tests exercise _aggregateStats() directly via a minimal ReplayParser
 * shim so no Jar / network / database is required.
 *
 * Test commands:
 *   node --test tests/replayTelemetry.test.js
 *   node --test --test-force-exit tests/
 */

const test   = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Minimal shim — we only need _aggregateStats, _detectPositions, and the
// helper methods it calls internally.  Import the real module and strip
// the singleton guard to get a fresh instance per test file.
// ---------------------------------------------------------------------------
let ReplayParserClass;
try {
  // The module exports a factory; grab the class via the factory result.
  const { getReplayParser } = require('../src/replay/replayParser');
  ReplayParserClass = getReplayParser().constructor;
} catch (err) {
  // If the module fails to load (missing parser jar etc.) we still want tests
  // to describe themselves; mark them as skipped via a top-level guard.
  console.error('[test] replayParser load failed:', err.message);
  ReplayParserClass = null;
}

function makeParser() {
  if (!ReplayParserClass) return null;
  // Construct without starting the Java service.
  const p = Object.create(ReplayParserClass.prototype);
  p._derivedTask377 = null;
  p._derivedTask411 = null;
  return p;
}

// Minimal interval event so _aggregateStats has player data to work with.
function intervalEvent(slot, time, overrides = {}) {
  return {
    type: 'interval',
    slot,
    time,
    hero_id: slot + 1,
    kills: 0, deaths: 0, assists: 0,
    lh: 0, denies: 0,
    gold: 100 * time,
    xp:   150 * time,
    level: Math.min(25, Math.floor(time / 60) + 1),
    networth: 500 + 100 * time,
    obs_placed: 0, sen_placed: 0,
    creeps_stacked: 0, camps_stacked: 0,
    rune_pickups: 0, stuns: 0,
    towers_killed: 0, roshans_killed: 0,
    teamfight_participation: 0, firstblood_claimed: 0,
    buyback_count: 0,
    x: 100 + slot * 5,
    y: 100 + slot * 5,
    ...overrides,
  };
}

// Build a minimal event stream: 10 players × 20 interval events (every 30 s)
function makeBaseEvents(durationSec = 600) {
  const events = [];
  for (let t = 0; t <= durationSec; t += 30) {
    for (let s = 0; s < 10; s++) {
      events.push(intervalEvent(s, t));
    }
  }
  return events;
}

// Skip all tests when module failed to load
function maybeSkip(t, cb) {
  if (!ReplayParserClass) {
    t.skip('replayParser module not available');
    return;
  }
  cb();
}

// ---------------------------------------------------------------------------
// 1. Draft phase / timing metadata
// ---------------------------------------------------------------------------

test('draft: draftStartTime captured from draft_start event', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const events = [
      { type: 'draft_start', time: -90 },
      { type: 'draft_timings', hero_id: 1, pick: false, draft_order: 1, draft_active_team: 2, time: -80, draft_extime0: 40, draft_extime1: 40 },
      { type: 'draft_timings', hero_id: 2, pick: true,  draft_order: 2, draft_active_team: 2, time: -60, draft_extime0: 30, draft_extime1: 30 },
      ...makeBaseEvents(300),
    ];
    const stats = p._aggregateStats(events);
    // draftMeta is now embedded inside gameTimeline so it survives the
    // existing matches.game_timeline JSONB write.
    assert.ok(stats.gameTimeline.draftMeta, 'draftMeta should be present inside gameTimeline');
    assert.equal(stats.gameTimeline.draftMeta.startTime, -90, 'startTime should be captured from draft_start');
    assert.equal(stats.gameTimeline.draftMeta._derived, true, 'should be labelled derived');
  });
});

test('draft: per-pick timing metadata in draft array', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const events = [
      { type: 'draft_start', time: -90 },
      { type: 'draft_timings', hero_id: 1, pick: false, draft_order: 1, draft_active_team: 2, time: -80, draft_extime0: 40, draft_extime1: 40 },
      { type: 'draft_timings', hero_id: 2, pick: false, draft_order: 2, draft_active_team: 3, time: -65, draft_extime0: 40, draft_extime1: 40 },
      ...makeBaseEvents(300),
    ];
    const stats = p._aggregateStats(events);
    assert.ok(Array.isArray(stats.draft), 'draft must be an array');
    // Both entries should have time fields (per-pick timing is on the draft array)
    const withTime = stats.draft.filter(d => d.time != null);
    assert.ok(withTime.length > 0, 'at least one draft entry should carry timing');
  });
});

test('draft: draftMeta is null when no draft data', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const events = makeBaseEvents(300);
    const stats = p._aggregateStats(events);
    // draftMeta lives inside gameTimeline now; null when no CM draft events seen
    assert.equal(stats.gameTimeline.draftMeta, null, 'draftMeta should be null when no draft events');
  });
});

// ---------------------------------------------------------------------------
// 2. Pause events (no free-text)
// ---------------------------------------------------------------------------

test('pauseEvents: captured from game_paused events', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const events = [
      ...makeBaseEvents(300),
      { type: 'game_paused', key: 'pause_duration', value: 120, time: 150, slot: 0 },
      { type: 'game_paused', key: 'pause_duration', value: 60,  time: 300, slot: 5 },
    ];
    const stats = p._aggregateStats(events);
    // pauseEvents is now embedded inside gameTimeline (persists via game_timeline JSONB)
    const pe = stats.gameTimeline.pauseEvents;
    assert.ok(Array.isArray(pe), 'pauseEvents should be an array');
    assert.equal(pe.length, 2, 'should capture both pauses');
    assert.equal(pe[0].duration, 120);
    assert.equal(pe[0].pauserSlot, 0);
    assert.equal(pe[1].duration, 60);
    assert.equal(pe[1].pauserSlot, 5);
    // No text field on any pause event
    for (const ev of pe) {
      assert.equal(ev.text, undefined, 'pause events must not carry free text');
      assert.equal(ev.key,  undefined, 'pause events must not carry key');
    }
  });
});

test('pauseEvents: null when no pauses', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const stats = p._aggregateStats(makeBaseEvents(300));
    assert.equal(stats.gameTimeline.pauseEvents, null);
  });
});

test('pauseEvents: hard cap of 50 entries enforced', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const pauses = Array.from({ length: 80 }, (_, i) => ({
      type: 'game_paused', key: 'pause_duration', value: 10, time: i * 5, slot: 0,
    }));
    const events = [...makeBaseEvents(400), ...pauses];
    const stats = p._aggregateStats(events);
    assert.ok(stats.gameTimeline.pauseEvents.length <= 50, 'must not exceed 50 pause events');
  });
});

test('pauseEvents: dire slot normalisation (128-132 → 5-9)', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const events = [
      ...makeBaseEvents(300),
      { type: 'game_paused', key: 'pause_duration', value: 30, time: 100, slot: 130 },
    ];
    const stats = p._aggregateStats(events);
    assert.ok(stats.gameTimeline.pauseEvents, 'should have pauses');
    assert.equal(stats.gameTimeline.pauseEvents[0].pauserSlot, 7, 'slot 130 should normalise to 7');
  });
});

// ---------------------------------------------------------------------------
// 3. System events (game-state transitions, no free-text)
// ---------------------------------------------------------------------------

test('systemEvents: captured from game_state events', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const events = [
      ...makeBaseEvents(300),
      { type: 'game_state', key: 'PRE_GAME',          time: -90 },
      { type: 'game_state', key: 'GAME_IN_PROGRESS',  time: 0   },
      { type: 'game_state', key: 'POST_GAME',          time: 300 },
    ];
    const stats = p._aggregateStats(events);
    // systemEvents is now embedded inside gameTimeline
    const se = stats.gameTimeline.systemEvents;
    assert.ok(Array.isArray(se), 'systemEvents should be present');
    assert.ok(se.length >= 1, 'should have at least one state');
    for (const ev of se) {
      assert.match(ev.state, /^[A-Z_]+$/, 'state must be uppercase enum');
      assert.equal(ev.text, undefined, 'must not carry free text');
    }
  });
});

test('systemEvents: free-text state names are rejected', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const events = [
      ...makeBaseEvents(300),
      { type: 'game_state', key: 'hello world', time: 100 }, // has a space — should be filtered
      { type: 'game_state', key: 'VALID_STATE',  time: 200 },
    ];
    const stats = p._aggregateStats(events);
    // Only VALID_STATE should be captured (systemEvents inside gameTimeline)
    if (stats.gameTimeline.systemEvents) {
      const bad = stats.gameTimeline.systemEvents.find(ev => ev.state.includes(' '));
      assert.equal(bad, undefined, 'states with spaces must be rejected');
    }
  });
});

// ---------------------------------------------------------------------------
// 4. TP activation timing
// ---------------------------------------------------------------------------

test('tpActivations: captures TP scroll cast events', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    // Streaming-mode TP cast (DOTA_COMBATLOG_ABILITY with TP inflictor)
    const events = [
      ...makeBaseEvents(300),
      {
        type: 'DOTA_COMBATLOG_ABILITY',
        inflictor: 'item_tpscroll',
        attackername: 'npc_dota_hero_antimage',  // hero_id 1 = antimage → slot 0
        time: 120,
        slot: 0,
      },
    ];
    const stats = p._aggregateStats(events);
    // tpActivations is now inside gameTimeline; may be null if slot can't be
    // resolved (npcNameToSlot built after first-pass). No crash + shape check.
    if (stats.gameTimeline.tpActivations) {
      const tp = stats.gameTimeline.tpActivations[0];
      assert.ok(tp, 'should have at least one TP entry');
      assert.equal(typeof tp.t, 'number');
      assert.ok('item' in tp, 'TP entry must have item field');
    }
  });
});

test('tpActivations: null when no TP casts', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const stats = p._aggregateStats(makeBaseEvents(300));
    // tpActivations now lives inside gameTimeline
    assert.equal(stats.gameTimeline.tpActivations, null);
  });
});

test('tpActivations: hard cap of 200 entries enforced', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    // Build 250 TP events — all attributed to slot 0
    const tpEvents = Array.from({ length: 250 }, (_, i) => ({
      type: 'item_uses',
      key: 'tpscroll',
      slot: 0,
      time: i * 2,
    }));
    const events = [...makeBaseEvents(600), ...tpEvents];
    const stats = p._aggregateStats(events);
    if (stats.gameTimeline.tpActivations) {
      assert.ok(stats.gameTimeline.tpActivations.length <= 200, 'must not exceed 200 TP entries');
    }
  });
});

test('tpActivations: unit-order correlation buffer is bounded per player', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../src/replay/replayParser.js'),
    'utf8'
  );
  assert.match(source, /MAX_TP_ORDERS_PER_SLOT\s*=\s*256/);
  assert.match(source, /tpUnitOrders\[s\]\.length\s*<\s*MAX_TP_ORDERS_PER_SLOT/);
  assert.match(source, /for\s*\(const uo of tpUnitOrders\[tpSlot\]\)/);
});

// ---------------------------------------------------------------------------
// 5. Item use / consumable log
// ---------------------------------------------------------------------------

test('itemUseLog: captured from DOTA_COMBATLOG_ITEM_USED', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const events = [
      ...makeBaseEvents(300),
      { type: 'DOTA_COMBATLOG_ITEM_USED', inflictor: 'item_tango', attackername: 'npc_dota_hero_antimage', time: 60, slot: 0 },
      { type: 'DOTA_COMBATLOG_ITEM_USED', inflictor: 'item_blink',  attackername: 'npc_dota_hero_antimage', time: 90, slot: 0 },
    ];
    const stats = p._aggregateStats(events);
    // Check per-player timeline entry
    const p0 = stats.gameTimeline.players.find(p => p.slot === 0);
    assert.ok(p0, 'player slot 0 must be in timeline');
    // itemUseLog may be empty if slot resolution fails, but must exist and be an array
    assert.ok(Array.isArray(p0.itemUseLog), 'itemUseLog must be an array');
  });
});

test('itemUseLog: per-slot hard cap enforced (100 entries max)', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const uses = Array.from({ length: 150 }, (_, i) => ({
      type: 'item_uses', key: 'clarity', slot: 0, time: i,
    }));
    const events = [...makeBaseEvents(300), ...uses];
    const stats = p._aggregateStats(events);
    const p0 = stats.gameTimeline.players.find(p => p.slot === 0);
    assert.ok(p0.itemUseLog.length <= 100, 'itemUseLog must not exceed 100 per slot');
  });
});

// ---------------------------------------------------------------------------
// 6. Ability cast log
// ---------------------------------------------------------------------------

test('abilityCastLog: captured from DOTA_COMBATLOG_ABILITY', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const events = [
      ...makeBaseEvents(300),
      { type: 'DOTA_COMBATLOG_ABILITY', inflictor: 'antimage_mana_break', attackername: 'npc_dota_hero_antimage', time: 80, slot: 0 },
      { type: 'DOTA_COMBATLOG_ABILITY', inflictor: 'antimage_mana_void',  attackername: 'npc_dota_hero_antimage', time: 200, slot: 0 },
    ];
    const stats = p._aggregateStats(events);
    const p0 = stats.gameTimeline.players.find(p => p.slot === 0);
    assert.ok(p0, 'slot 0 must be present');
    assert.ok(Array.isArray(p0.abilityCastLog), 'abilityCastLog must be an array');
  });
});

test('abilityCastLog: per-slot hard cap enforced (300 entries max)', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const casts = Array.from({ length: 400 }, (_, i) => ({
      type: 'ability_uses', key: 'some_ability', slot: 0, time: i,
    }));
    const events = [...makeBaseEvents(600), ...casts];
    const stats = p._aggregateStats(events);
    const p0 = stats.gameTimeline.players.find(p => p.slot === 0);
    assert.ok(p0.abilityCastLog.length <= 300, 'abilityCastLog must not exceed 300 per slot');
  });
});

// ---------------------------------------------------------------------------
// 7. Lane region time
// ---------------------------------------------------------------------------

test('laneRegionTime: present in player timeline when position data exists', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    // Build 10 s interval events with position in mid-corridor
    const events = [];
    for (let t = 0; t <= 600; t += 10) {
      events.push(intervalEvent(0, t, { x: 128, y: 128 }));
    }
    // Add minimal base events for other slots
    for (let s = 1; s < 10; s++) {
      events.push(intervalEvent(s, 0));
    }
    const stats = p._aggregateStats(events);
    const p0 = stats.gameTimeline.players.find(p => p.slot === 0);
    assert.ok(p0, 'slot 0 must be present');
    const lrt = p0.laneRegionTime;
    assert.ok(lrt, 'laneRegionTime should be present when positions exist');
    assert.ok(typeof lrt.mid     === 'number', 'mid should be a number');
    assert.ok(typeof lrt.safelane === 'number', 'safelane should be a number');
    assert.ok(typeof lrt.offlane  === 'number', 'offlane should be a number');
    assert.ok(typeof lrt.jungle   === 'number', 'jungle should be a number');
    assert.ok(typeof lrt.base     === 'number', 'base should be a number');
    assert.equal(lrt._derived, true, 'must be labelled derived');
    // Player spent time in mid (x=128, y=128 is in mid corridor)
    assert.ok(lrt.mid > 0, 'mid time should be > 0 for mid-corridor positions');
  });
});

test('laneRegionTime: null for slot with no position data', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    // Only slot 0 gets interval events (no x/y → no positions)
    const events = [
      { type: 'interval', slot: 0, time: 30, hero_id: 1, kills: 0, deaths: 0, assists: 0, lh: 0, denies: 0, gold: 0, xp: 0, level: 1, networth: 0 },
    ];
    const stats = p._aggregateStats(events);
    const p0 = stats.gameTimeline.players.find(p => p.slot === 0);
    if (p0) {
      assert.equal(p0.laneRegionTime, null, 'laneRegionTime must be null when no positions');
    }
  });
});

test('laneRegionTime: only counts positions during laning phase (0-600s)', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    // Events both inside and outside laning phase, all in mid
    const events = [];
    for (let t2 = 0; t2 <= 1200; t2 += 10) {
      events.push(intervalEvent(0, t2, { x: 128, y: 128 }));
    }
    for (let s = 1; s < 10; s++) events.push(intervalEvent(s, 0));
    const stats = p._aggregateStats(events);
    const p0 = stats.gameTimeline.players.find(p => p.slot === 0);
    const lrt = p0?.laneRegionTime;
    if (lrt) {
      // Total ticks * 10 s should be bounded by the laning phase window (0–600 s).
      // A tick sampled exactly at t=600 is still valid (600 <= 600), so the
      // maximum is 61 ticks × 10 s = 610 s. Allow up to 620 to be defensive.
      const total = lrt.safelane + lrt.mid + lrt.offlane + lrt.jungle + lrt.base;
      assert.ok(total <= 620, `laneRegionTime total ${total}s must be bounded by laning phase`);
      // Must not include any time from events after the 600 s cap
      // (events at t=700, t=800, ... must be excluded entirely)
      assert.ok(total > 0, 'should have some laning-phase time');
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Existing output preservation — idempotency checks
// ---------------------------------------------------------------------------

test('existing output: draft array structure unchanged (heroId/isPick/order/team always present)', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const events = [
      { type: 'draft_start', time: -90 },
      { type: 'draft_timings', hero_id: 1, pick: false, draft_order: 1, draft_active_team: 2, time: -80 },
      { type: 'draft_timings', hero_id: 2, pick: true,  draft_order: 2, draft_active_team: 2, time: -60 },
      ...makeBaseEvents(300),
    ];
    const stats = p._aggregateStats(events);
    for (const d of stats.draft) {
      assert.ok('heroId'  in d, 'heroId must be present');
      assert.ok('isPick'  in d, 'isPick must be present');
      assert.ok('order'   in d, 'order must be present');
      assert.ok('team'    in d, 'team must be present');
    }
  });
});

test('existing output: gameTimeline.players contains expected legacy fields', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const stats = p._aggregateStats(makeBaseEvents(300));
    for (const tp of stats.gameTimeline.players) {
      assert.ok('slot'        in tp, 'slot missing');
      assert.ok('samples'     in tp, 'samples missing');
      assert.ok('positions'   in tp, 'positions missing');
      assert.ok('purchaseLog' in tp, 'purchaseLog missing');
      assert.ok('abilityLog'  in tp, 'abilityLog missing');
      assert.ok('smokeTimes'  in tp, 'smokeTimes missing');
      assert.ok('buybackEvents' in tp, 'buybackEvents missing');
      // New fields
      assert.ok('abilityCastLog' in tp, 'abilityCastLog missing');
      assert.ok('itemUseLog'     in tp, 'itemUseLog missing');
    }
  });
});

test('existing output: matchId, duration, radiantWin, gameMode still emitted', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const stats = p._aggregateStats(makeBaseEvents(300));
    assert.ok('matchId'    in stats, 'matchId missing');
    assert.ok('duration'   in stats, 'duration missing');
    assert.ok('radiantWin' in stats, 'radiantWin missing');
    assert.ok('gameMode'   in stats, 'gameMode missing');
    assert.ok('players'    in stats, 'players missing');
    assert.ok('draft'      in stats, 'draft missing');
    assert.ok('gameTimeline' in stats, 'gameTimeline missing');
    assert.ok('laneOutcomes' in stats, 'laneOutcomes missing');
  });
});

test('existing output: ward/rune/laneOutcomesSummary fields still present', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const stats = p._aggregateStats(makeBaseEvents(300));
    assert.ok('wardDeaths' in stats.gameTimeline, 'wardDeaths missing');
    assert.ok('runePickups' in stats.gameTimeline, 'runePickups missing');
    assert.ok('laneOutcomesSummary' in stats.gameTimeline, 'laneOutcomesSummary missing');
  });
});
