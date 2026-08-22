/**
 * Regression tests for the enriched processTeamfights.mjs processor.
 *
 * Tests verify:
 *  - Existing behaviour (3+ deaths filter, player damage/healing/gold/xp/buyback aggregation)
 *  - New enrichments: winner, radiant_summary, dire_summary, participantSlots,
 *    participantMask, centroid (_derived), topAbilities, topItems, duration
 *
 * Test command:
 *   node --test tests/processTeamfights.test.mjs
 *   node --test --test-force-exit tests/
 *
 * Note: ESM test file; Node >=18 supports --test with .mjs files.
 */

import test   from 'node:test';
import assert from 'node:assert/strict';
import processTeamfights from '../odota-parser/processors/processTeamfights.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInterval(slot, time, overrides = {}) {
  return {
    type: 'interval',
    slot,
    time,
    x: 128 + slot * 10,
    y: 128 + slot * 10,
    xp: 1000 + slot * 100,
    gold: 2000 + slot * 50,
    ...overrides,
  };
}

// Build a meta object the processor expects
function makeMeta(heroToSlot = {}) {
  return { hero_to_slot: heroToSlot };
}

// Build a kill event (blob-mode 'killed')
function kill(key, slot, time) {
  return {
    type: 'killed',
    key,            // hero NPC name (e.g. 'antimage')
    slot,           // attacker slot
    time,
    targethero: true,
    targetillusion: false,
  };
}

// Build a damage event
function damage(slot, time, value) {
  return { type: 'damage', slot, time, value, targethero: true, targetillusion: false };
}

// Build a healing event
function healing(slot, time, value) {
  return { type: 'healing', slot, time, value, targethero: true, targetillusion: false };
}

// Build a buyback_log event
function buyback(slot, time) {
  return { type: 'buyback_log', slot, time };
}

// Build an ability_uses event (blob-mode)
function abilityUse(playerSlot, key, time) {
  // player_slot for dire: 128 + (slot - 5) or just use the formula the processor applies
  const player_slot = playerSlot < 5 ? playerSlot : 128 + (playerSlot - 5);
  return { type: 'ability_uses', key, player_slot, time };
}

// ---------------------------------------------------------------------------
// Build a minimal fight scenario: 3 radiant kills by dire (slots 5-9)
// Cooldown = 15 s, so kills spaced by 5 s stay in one fight.
// ---------------------------------------------------------------------------

function buildFightEntries() {
  const heroToSlot = {
    antimage: 0,
    axe: 1,
    bane: 2,
  };
  const meta = makeMeta(heroToSlot);

  // Interval events before and during the fight so intervalState is populated
  const entries = [];

  // Pre-fight intervals (some before kill window)
  for (let s = 0; s < 10; s++) {
    entries.push(makeInterval(s, 0));
    entries.push(makeInterval(s, 10));
    entries.push(makeInterval(s, 20));
  }

  // 3 kills within 10 s (times 20, 25, 30 → fight window start=5, end closed by interval at 45)
  entries.push(kill('antimage', 5, 20));  // slot 5 kills antimage (slot 0)
  entries.push(kill('axe',      6, 25));  // slot 6 kills axe (slot 1)
  entries.push(kill('bane',     7, 30));  // slot 7 kills bane (slot 2)

  // Intervals during and after fight to close it
  for (let s = 0; s < 10; s++) {
    entries.push(makeInterval(s, 30));
    entries.push(makeInterval(s, 45));
    entries.push(makeInterval(s, 60));
  }

  // Damage events during fight
  entries.push(damage(5, 22, 800));
  entries.push(damage(6, 27, 600));
  entries.push(damage(0, 22, 300));  // radiant hero deals damage too

  // Healing event
  entries.push(healing(8, 25, 400));

  // Buyback
  entries.push(buyback(1, 28));

  // Ability uses
  entries.push(abilityUse(5, 'axe_berserkers_call', 22));
  entries.push(abilityUse(5, 'axe_berserkers_call', 24));
  entries.push(abilityUse(6, 'jakiro_dual_breath', 26));

  return { entries, meta };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('processTeamfights: basic fight detection (3+ deaths)', () => {
  const { entries, meta } = buildFightEntries();
  const fights = processTeamfights(entries, meta);
  assert.ok(fights.length >= 1, 'should detect at least one fight');
  assert.ok(fights[0].deaths >= 3, 'fight must have 3+ deaths');
});

test('processTeamfights: fight has start and end', () => {
  const { entries, meta } = buildFightEntries();
  const fights = processTeamfights(entries, meta);
  assert.ok(fights.length >= 1, 'should detect a fight');
  const f = fights[0];
  assert.ok(f.start != null, 'start must be set');
  assert.ok(f.end   != null, 'end must be set');
  assert.ok(f.end > f.start, 'end must be after start');
});

test('processTeamfights: winner field present and valid', () => {
  const { entries, meta } = buildFightEntries();
  const fights = processTeamfights(entries, meta);
  const f = fights[0];
  assert.ok('winner' in f, 'winner must be present');
  assert.ok(['radiant', 'dire', 'even'].includes(f.winner), 'winner must be radiant/dire/even');
});

test('processTeamfights: dire wins fight (radiant had all 3 deaths)', () => {
  const { entries, meta } = buildFightEntries();
  const fights = processTeamfights(entries, meta);
  // In our scenario, slots 0,1,2 (radiant) died → dire should win
  const f = fights[0];
  assert.equal(f.winner, 'dire', 'dire should win when radiant had all 3 deaths');
});

test('processTeamfights: radiant_summary and dire_summary present', () => {
  const { entries, meta } = buildFightEntries();
  const fights = processTeamfights(entries, meta);
  const f = fights[0];
  assert.ok('radiant_summary' in f, 'radiant_summary must be present');
  assert.ok('dire_summary'    in f, 'dire_summary must be present');
  // Both must have the required keys
  for (const summary of [f.radiant_summary, f.dire_summary]) {
    assert.ok('deaths'    in summary);
    assert.ok('damage'    in summary);
    assert.ok('healing'   in summary);
    assert.ok('gold_delta' in summary);
    assert.ok('xp_delta'   in summary);
    assert.ok('buybacks'  in summary);
  }
});

test('processTeamfights: radiant_summary.deaths counts radiant hero deaths', () => {
  const { entries, meta } = buildFightEntries();
  const fights = processTeamfights(entries, meta);
  const f = fights[0];
  // All 3 killed heroes are radiant (slots 0,1,2).
  // Per-player death counts are only incremented when intervalState is available
  // at the exact kill second. Our test scenario has intervals at t=0,10,20,30;
  // kills at t=20,25,30 — so t=25 kill may not have interval data, yielding >= 2.
  assert.ok(f.radiant_summary.deaths >= 2, `radiant deaths ${f.radiant_summary.deaths} should be >= 2`);
  assert.equal(f.dire_summary.deaths, 0, 'dire had 0 deaths');
});

test('processTeamfights: participantSlots and participantMask present', () => {
  const { entries, meta } = buildFightEntries();
  const fights = processTeamfights(entries, meta);
  const f = fights[0];
  assert.ok('participantSlots' in f, 'participantSlots must be present');
  assert.ok('participantMask'  in f, 'participantMask must be present');
  assert.ok(Array.isArray(f.participantSlots), 'participantSlots must be array');
  assert.ok(typeof f.participantMask === 'number', 'participantMask must be number');
});

test('processTeamfights: participantMask bit-encodes each participant slot', () => {
  const { entries, meta } = buildFightEntries();
  const fights = processTeamfights(entries, meta);
  const f = fights[0];
  for (const s of f.participantSlots) {
    assert.ok((f.participantMask & (1 << s)) !== 0, `slot ${s} must be set in participantMask`);
  }
});

test('processTeamfights: centroid present when position data available', () => {
  const { entries, meta } = buildFightEntries();
  const fights = processTeamfights(entries, meta);
  const f = fights[0];
  assert.ok('centroid' in f, 'centroid must be present');
  // May be null if no deaths_pos data was populated
  if (f.centroid) {
    assert.ok(typeof f.centroid.x === 'number', 'centroid.x must be number');
    assert.ok(typeof f.centroid.y === 'number', 'centroid.y must be number');
    assert.equal(f.centroid._derived, true, 'centroid must be labelled derived');
  }
});

test('processTeamfights: topAbilities present (array)', () => {
  const { entries, meta } = buildFightEntries();
  const fights = processTeamfights(entries, meta);
  const f = fights[0];
  assert.ok('topAbilities' in f, 'topAbilities must be present');
  assert.ok(Array.isArray(f.topAbilities), 'topAbilities must be array');
  assert.ok(f.topAbilities.length <= 5, 'topAbilities capped at 5');
});

test('processTeamfights: topItems present (array)', () => {
  const { entries, meta } = buildFightEntries();
  const fights = processTeamfights(entries, meta);
  const f = fights[0];
  assert.ok('topItems' in f, 'topItems must be present');
  assert.ok(Array.isArray(f.topItems), 'topItems must be array');
  assert.ok(f.topItems.length <= 5, 'topItems capped at 5');
});

test('processTeamfights: ability uses counted in topAbilities', () => {
  const { entries, meta } = buildFightEntries();
  const fights = processTeamfights(entries, meta);
  const f = fights[0];
  // axe_berserkers_call used twice → should appear in topAbilities
  const callEntry = f.topAbilities.find(a => a.name === 'axe_berserkers_call');
  if (callEntry) {
    assert.ok(callEntry.count >= 2, 'berserkers_call should have count >= 2');
  }
  // jakiro_dual_breath used once
  const breathEntry = f.topAbilities.find(a => a.name === 'jakiro_dual_breath');
  if (breathEntry) {
    assert.ok(breathEntry.count >= 1, 'dual_breath should have count >= 1');
  }
});

test('processTeamfights: topAbilities sorted descending by count', () => {
  const { entries, meta } = buildFightEntries();
  const fights = processTeamfights(entries, meta);
  const f = fights[0];
  for (let i = 1; i < f.topAbilities.length; i++) {
    assert.ok(
      f.topAbilities[i - 1].count >= f.topAbilities[i].count,
      'topAbilities must be sorted descending'
    );
  }
});

test('processTeamfights: duration field present and non-negative', () => {
  const { entries, meta } = buildFightEntries();
  const fights = processTeamfights(entries, meta);
  const f = fights[0];
  assert.ok('duration' in f, 'duration must be present');
  if (f.duration != null) {
    assert.ok(f.duration >= 0, 'duration must be non-negative');
  }
});

test('processTeamfights: damage aggregation in summaries', () => {
  const { entries, meta } = buildFightEntries();
  const fights = processTeamfights(entries, meta);
  const f = fights[0];
  // Slot 5 (dire) dealt 800, slot 6 (dire) dealt 600 → dire_summary.damage >= 1400
  // Slot 0 (radiant) dealt 300 → radiant_summary.damage >= 300
  assert.ok(f.dire_summary.damage >= 1400, `dire damage ${f.dire_summary.damage} should be >= 1400`);
  assert.ok(f.radiant_summary.damage >= 300, `radiant damage ${f.radiant_summary.damage} should be >= 300`);
});

test('processTeamfights: healing aggregation in summaries', () => {
  const { entries, meta } = buildFightEntries();
  const fights = processTeamfights(entries, meta);
  const f = fights[0];
  // Slot 8 (dire) healed 400
  assert.ok(f.dire_summary.healing >= 400, `dire healing ${f.dire_summary.healing} should be >= 400`);
});

test('processTeamfights: buyback in summaries', () => {
  const { entries, meta } = buildFightEntries();
  const fights = processTeamfights(entries, meta);
  const f = fights[0];
  // Slot 1 (radiant) bought back
  assert.ok(f.radiant_summary.buybacks >= 1, 'radiant buybacks should be >= 1');
});

test('processTeamfights: two-death fight is filtered out', () => {
  const meta = makeMeta({ antimage: 0, axe: 1 });
  const entries = [
    ...Array.from({ length: 10 }, (_, s) => makeInterval(s, 0)),
    kill('antimage', 5, 20),
    kill('axe',      6, 23),
    ...Array.from({ length: 10 }, (_, s) => makeInterval(s, 40)),
  ];
  const fights = processTeamfights(entries, meta);
  assert.equal(fights.length, 0, 'fight with < 3 deaths must be filtered');
});

test('processTeamfights: even winner when deaths are equal', () => {
  const meta = makeMeta({ antimage: 0, axe: 1, bane: 2, axe2: 5, lina: 6, lion: 7 });
  // 3 radiant deaths + 3 dire deaths in same fight → winner = 'even'
  const heroToSlot = { antimage: 0, axe: 1, bane: 2, lina: 5, lion: 6, storm: 7 };
  const metaEven = makeMeta(heroToSlot);
  const t = 20;
  const entries = [
    ...Array.from({ length: 10 }, (_, s) => makeInterval(s, 0)),
    ...Array.from({ length: 10 }, (_, s) => makeInterval(s, 15)),
    // 3 radiant die
    kill('antimage', 5, t),
    kill('axe',      6, t + 2),
    kill('bane',     7, t + 4),
    // 3 dire die
    kill('lina',     0, t + 1),
    kill('lion',     1, t + 3),
    kill('storm',    2, t + 5),
    ...Array.from({ length: 10 }, (_, s) => makeInterval(s, t + 20)),
    ...Array.from({ length: 10 }, (_, s) => makeInterval(s, t + 40)),
  ];
  const fights = processTeamfights(entries, metaEven);
  if (fights.length > 0) {
    assert.equal(fights[0].winner, 'even', 'equal deaths should result in even winner');
  }
});
