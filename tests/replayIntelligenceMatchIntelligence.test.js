// tests/replayIntelligenceMatchIntelligence.test.js
//
// Full-edition replay intelligence — match intelligence builder tests.

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMatchIntelligence,
  buildMeta,
  buildDraft,
  buildLaneOutcomes,
  buildFights,
  buildPlayerStats,
  buildTeamAbilities,
  buildVisionSummary,
  buildBuybacking,
  buildObjectiveLog,
  buildRuneSummary,
  buildCoachingMetrics,
  stripForPublic,
  applyTelemetryFamilyFlags,
} = require('../src/replay/intelligence/matchIntelligence');

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeMatchPlayer(slot, team, overrides = {}) {
  const isRadiant = team === 'radiant';
  return {
    slot,
    account_id: `player_${slot}`,
    hero_id:    slot + 1,
    hero_name:  `hero_${slot}`,
    personaname: `Player${slot}`,
    team,
    position:   slot < 128 ? slot + 1 : (slot - 127),
    kills:      3,
    deaths:     2,
    assists:    5,
    last_hits:  80,
    denies:     10,
    gpm:        400,
    xpm:        450,
    net_worth:  8000,
    laning_nw:  isRadiant ? 6000 : 4500,
    hero_damage:    10000,
    tower_damage:   2000,
    hero_healing:   500,
    obs_placed:     3,
    sen_placed:     2,
    wards_killed:   1,
    teamfight_participation: 0.6,
    rank_tier:      50,
    level:          18,
    // participant-only fields
    killed_by:  { npc_dota_hero_1: 2 },
    item_first_times: { item_blink: 900 },
    stun_duration: 5.5,
    heal_saves: 1,
    ...overrides,
  };
}

function makeTimelinePlayer(slot, samples = []) {
  const defaultSamples = [
    { t: 0,   nw: 0 },
    { t: 300, nw: 3000 },
    { t: 600, nw: 6000 },
    { t: 900, nw: 8000 },
    { t: 1200, nw: 10000 },
  ];
  return {
    slot,
    name: `Player${slot}`,
    team: slot < 128 ? 'radiant' : 'dire',
    samples: samples.length > 0 ? samples : defaultSamples,
    buybackEvents: slot === 0 ? [{ t: 700, dieback: false }, { t: 1100, dieback: true }] : [],
    abilityLog: [
      { heroLevel: 1, abilityName: 'ability_q', abilityLevel: 1, time: 0 },
      { heroLevel: 3, abilityName: 'ability_w', abilityLevel: 1, time: 120 },
    ],
    purchaseLog: [
      { itemName: 'item_blink', time: 900 },
    ],
    smokeTimes: [300],
    smokeSuccesses: 1,
    positions: [{ t: 0, x: 100, y: 200 }],
  };
}

function makeMatch(overrides = {}) {
  const players = [
    makeMatchPlayer(0, 'radiant'),
    makeMatchPlayer(1, 'radiant'),
    makeMatchPlayer(2, 'radiant'),
    makeMatchPlayer(3, 'radiant'),
    makeMatchPlayer(4, 'radiant'),
    makeMatchPlayer(128, 'dire'),
    makeMatchPlayer(129, 'dire'),
    makeMatchPlayer(130, 'dire'),
    makeMatchPlayer(131, 'dire'),
    makeMatchPlayer(132, 'dire'),
  ];

  return {
    match_id:   12345,
    duration:   2400,
    radiant_win: true,
    game_mode:  22,
    parseMethod: 'odota-parser',
    players,
    draft: {
      picks: [
        { order: 0, hero_id: 1, hero_name: 'hero_a', team: 'radiant', phase: 1, timing: 30 },
        { order: 1, hero_id: 2, hero_name: 'hero_b', team: 'dire',    phase: 1, timing: 25 },
      ],
      bans: [
        { order: 0, hero_id: 10, hero_name: 'hero_x', team: 'radiant', phase: 1, timing: 15 },
      ],
    },
    game_timeline: {
      interval: 30,
      players: [0, 1, 2, 3, 4, 128, 129, 130, 131, 132].map(s => makeTimelinePlayer(s)),
      events: [
        { t: 500, type: 'kill', killerSlot: 0, victimSlot: 128, assistSlots: [1] },
        { t: 900, type: 'roshan', team: 'radiant', detail: 'killed' },
        { t: 1200, type: 'building_kill', team: 'radiant', buildingKey: 'npc_dota_goodguys_tower1_top' },
        { t: 1800, type: 'aegis', team: 'radiant', detail: 'expired' },
      ],
      fights: [
        { start_s: 490, end_s: 530, heroes: [0, 1, 128, 129], winner: 'radiant', radiant_deaths: 0, dire_deaths: 2 },
        { start_s: 1150, end_s: 1200, heroes: [0, 1, 2, 128, 129, 130], winner: 'radiant', radiant_deaths: 1, dire_deaths: 3 },
      ],
      wardDeaths: [
        { t: 400, type: 'observer', slot: 128, team: 'dire' },
      ],
      runePickups: [
        { t: 120, type: 'bounty',   slot: 0, team: 'radiant' },
        { t: 600, type: 'power_up', slot: 1, team: 'radiant' },
        { t: 300, type: 'bounty',   slot: 128, team: 'dire' },
      ],
      laneOutcomesSummary: [
        { lane: 'safe', radiantNW: 8000, direNW: 4000, radiantXP: 7000, direXP: 4500, radiantKills: 2, direKills: 1, winner: 'radiant' },
        { lane: 'mid',  radiantNW: 5500, direNW: 5300, radiantXP: 4500, direXP: 4300, radiantKills: 1, direKills: 1, winner: 'even' },
        { lane: 'off',  radiantNW: 4000, direNW: 5200, radiantXP: 3800, direXP: 4800, radiantKills: 0, direKills: 1, winner: 'dire' },
      ],
    },
    teamAbilities: {
      radiant: { avg_ability_uses: 45 },
      dire:    { avg_ability_uses: 38 },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildMeta
// ---------------------------------------------------------------------------

test('buildMeta: extracts correct match header', () => {
  const m = makeMatch();
  const meta = buildMeta(m);
  assert.equal(meta.matchId, 12345);
  assert.equal(meta.duration, 2400);
  assert.equal(meta.radiantWin, true);
  assert.equal(meta.gameMode, 22);
  assert.equal(meta.parseMethod, 'odota-parser');
});

test('buildMeta: handles missing fields gracefully', () => {
  const meta = buildMeta({});
  assert.equal(meta.matchId, null);
  assert.equal(meta.duration, 0);
  assert.equal(meta.radiantWin, false);
});

test('buildMeta: clamps duration to max', () => {
  const meta = buildMeta({ duration: 99999 });
  assert.equal(meta.duration, 12000);
});

test('buildMeta: camelCase and snake_case aliases both work', () => {
  const meta = buildMeta({ matchId: 999, radiantWin: true, gameMode: 1, parseMethod: 'test' });
  assert.equal(meta.matchId, 999);
  assert.equal(meta.radiantWin, true);
});

// ---------------------------------------------------------------------------
// buildDraft
// ---------------------------------------------------------------------------

test('buildDraft: returns null for null input', () => {
  assert.equal(buildDraft(null), null);
});

test('buildDraft: returns correct picks and bans counts', () => {
  const m = makeMatch();
  const draft = buildDraft(m.draft);
  assert.equal(draft.picks.length, 2);
  assert.equal(draft.bans.length, 1);
});

test('buildDraft: sequence is sorted by order', () => {
  const m = makeMatch();
  const draft = buildDraft(m.draft);
  const orders = draft.sequence.map(a => a.order);
  // orders should be non-decreasing
  for (let i = 1; i < orders.length; i++) {
    assert.ok(orders[i] >= orders[i - 1], 'sequence must be sorted by order');
  }
});

test('buildDraft: sequence entries have action field', () => {
  const m = makeMatch();
  const draft = buildDraft(m.draft);
  for (const action of draft.sequence) {
    assert.ok(action.action === 'pick' || action.action === 'ban',
      `action must be pick or ban, got: ${action.action}`);
  }
});

test('buildDraft: timing clamped to [0, 600]', () => {
  const draft = buildDraft({
    picks: [{ order: 0, hero_id: 1, team: 'radiant', phase: 1, timing: -10 }],
    bans: [],
  });
  assert.equal(draft.picks[0].timing, 0);
});

test('buildDraft: null timing preserved as null', () => {
  const draft = buildDraft({
    picks: [{ order: 0, hero_id: 1, team: 'radiant', phase: 1 }],
    bans: [],
  });
  assert.equal(draft.picks[0].timing, null);
});

test('buildDraft: empty picks and bans', () => {
  const draft = buildDraft({ picks: [], bans: [] });
  assert.equal(draft.picks.length, 0);
  assert.equal(draft.bans.length, 0);
  assert.equal(draft.sequence.length, 0);
});

test('buildDraft: accepts dedicated match_draft database rows', () => {
  const draft = buildDraft([
    { hero_id: 10, is_pick: false, order_num: 0, team: 0, draft_phase: 1, time_taken: 12 },
    { hero_id: 20, is_pick: true, order_num: 1, team: 1, draft_phase: 2, time_taken: 18, extra_time: 4 },
  ]);
  assert.equal(draft.sequence.length, 2);
  assert.equal(draft.bans[0].team, 'radiant');
  assert.equal(draft.picks[0].team, 'dire');
  assert.equal(draft.picks[0].timing, 18);
  assert.equal(draft.picks[0].extraTime, 4);
  assert.equal(draft.picks[0].phase, 2);
});

// ---------------------------------------------------------------------------
// buildLaneOutcomes
// ---------------------------------------------------------------------------

test('buildLaneOutcomes: handles null lane outcomes', () => {
  const result = buildLaneOutcomes(null, []);
  assert.deepEqual(result.perPlayer, []);
  assert.deepEqual(result.summary, []);
});

test('buildLaneOutcomes: summary passed through from laneOutcomesSummary', () => {
  const summary = [{ lane: 'safe', radiantNW: 8000, direNW: 4000, radiantXP: 7000, direXP: 4500, radiantKills: 2, direKills: 1, winner: 'radiant' }];
  const result = buildLaneOutcomes(null, summary);
  assert.equal(result.summary.length, 1);
  assert.equal(result.summary[0].lane, 'safe');
  assert.equal(result.summary[0].winner, 'radiant');
});

// ---------------------------------------------------------------------------
// buildFights
// ---------------------------------------------------------------------------

test('buildFights: empty when no fights provided', () => {
  assert.deepEqual(buildFights([], null), []);
});

test('buildFights: computes duration_s', () => {
  const fights = buildFights(
    [{ start_s: 100, end_s: 150, heroes: [0, 1], winner: 'radiant', radiant_deaths: 0, dire_deaths: 1 }],
    null
  );
  assert.equal(fights[0].duration_s, 50);
});

test('buildFights: computes nwSwing from timeline samples', () => {
  // Sample timestamps must be ≤ fight window boundaries for the lookup to capture them.
  // before = last sample at t ≤ start_s; after = last sample at t ≤ end_s.
  const tlPlayers = [
    makeTimelinePlayer(0,   [{ t: 90, nw: 5000 }, { t: 140, nw: 8000 }]),
    makeTimelinePlayer(128, [{ t: 90, nw: 5000 }, { t: 140, nw: 4000 }]),
  ];
  const timeline = { players: tlPlayers, events: [], fights: [], wardDeaths: [], runePickups: [], laneOutcomesSummary: [] };
  const fights = buildFights(
    [{ start_s: 100, end_s: 150, heroes: [0, 128], winner: 'radiant', radiant_deaths: 0, dire_deaths: 1 }],
    timeline
  );
  const swing = fights[0].nwSwing;
  assert.ok(swing !== null);
  assert.ok(typeof swing.radiant.delta === 'number');
  assert.ok(typeof swing.dire.delta === 'number');
  // Radiant: before=5000 (t=90 ≤ start_s=100), after=8000 (t=140 ≤ end_s=150) → delta=+3000
  // Dire:    before=5000, after=4000 → delta=-1000
  // net = (8000-5000) - (4000-5000) = 3000 - (-1000) = 4000
  assert.equal(swing.radiant.delta, 3000);
  assert.equal(swing.dire.delta, -1000);
  assert.equal(swing.net, 4000);
});

test('buildFights: identifies buybacks used within fight window', () => {
  const tlPlayers = [makeTimelinePlayer(0)];
  // Player 0 has buyback at t=700 (within fight 690-730)
  const timeline = {
    players: tlPlayers.map(p => ({ ...p, buybackEvents: [{ t: 700, dieback: false }] })),
    events: [],
  };
  const fights = buildFights(
    [{ start_s: 690, end_s: 730, heroes: [0], winner: 'radiant', radiant_deaths: 0, dire_deaths: 0 }],
    timeline
  );
  assert.equal(fights[0].buybacksUsed.length, 1);
  assert.equal(fights[0].buybacksUsed[0].slot, 0);
});

test('buildFights: winner defaults to draw for invalid value', () => {
  const fights = buildFights(
    [{ start_s: 100, end_s: 200, heroes: [], winner: null, radiant_deaths: 0, dire_deaths: 0 }],
    null
  );
  assert.equal(fights[0].winner, 'draw');
});

// ---------------------------------------------------------------------------
// buildPlayerStats
// ---------------------------------------------------------------------------

test('buildPlayerStats: public context excludes participant-only fields', () => {
  const m = makeMatch();
  const stats = buildPlayerStats(m.players, 'public');
  for (const p of stats) {
    assert.ok(!('killed_by' in p), 'killed_by must be excluded from public');
    assert.ok(!('item_first_times' in p), 'item_first_times must be excluded from public');
    assert.ok(!('stun_duration' in p), 'stun_duration must be excluded from public');
  }
});

test('buildPlayerStats: participant context includes extra fields', () => {
  const m = makeMatch();
  const stats = buildPlayerStats(m.players, 'participant');
  const p0 = stats.find(p => p.slot === 0);
  assert.ok(p0, 'player 0 missing');
  assert.ok('killed_by' in p0, 'killed_by must be present in participant');
  assert.ok('item_first_times' in p0);
  assert.ok('stun_duration' in p0);
});

test('buildPlayerStats: all public fields preserved', () => {
  const m = makeMatch();
  const stats = buildPlayerStats(m.players, 'public');
  const p0 = stats.find(p => p.slot === 0);
  assert.ok(p0);
  assert.equal(p0.kills, 3);
  assert.equal(p0.deaths, 2);
  assert.equal(p0.gpm, 400);
  assert.equal(p0.hero_id, 1);
});

test('buildPlayerStats: negative numbers clamped to 0', () => {
  const stats = buildPlayerStats([
    makeMatchPlayer(0, 'radiant', { kills: -5, gpm: -100 }),
  ], 'public');
  assert.equal(stats[0].kills, 0);
  assert.equal(stats[0].gpm, 0);
});

test('buildPlayerStats: returns empty array for non-array input', () => {
  assert.deepEqual(buildPlayerStats(null, 'public'), []);
  assert.deepEqual(buildPlayerStats('bad', 'public'), []);
});

// ---------------------------------------------------------------------------
// buildTeamAbilities
// ---------------------------------------------------------------------------

test('buildTeamAbilities: returns null for missing input', () => {
  assert.equal(buildTeamAbilities(null), null);
  assert.equal(buildTeamAbilities({}), null);
});

test('buildTeamAbilities: preserves radiant and dire data', () => {
  const result = buildTeamAbilities({ radiant: { avg: 10 }, dire: { avg: 8 } });
  assert.ok(result);
  assert.equal(result.radiant.avg, 10);
  assert.equal(result.dire.avg, 8);
});

// ---------------------------------------------------------------------------
// buildVisionSummary
// ---------------------------------------------------------------------------

test('buildVisionSummary: aggregates obs and sen placed', () => {
  const players = [
    makeMatchPlayer(0, 'radiant', { obs_placed: 3, sen_placed: 2, wards_killed: 1 }),
    makeMatchPlayer(1, 'radiant', { obs_placed: 5, sen_placed: 1, wards_killed: 0 }),
    makeMatchPlayer(128, 'dire', { obs_placed: 2, sen_placed: 3, wards_killed: 2 }),
  ];
  const result = buildVisionSummary(players, [{ t: 100 }, { t: 200 }]);
  assert.equal(result.totalObsPlaced, 10);
  assert.equal(result.totalSenPlaced, 6);
  assert.equal(result.totalDewarded, 3);
  assert.equal(result.wardDeathsLogged, 2);
});

test('buildVisionSummary: handles missing/undefined players gracefully', () => {
  const result = buildVisionSummary(null, []);
  assert.equal(result.totalObsPlaced, 0);
});

// ---------------------------------------------------------------------------
// buildBuybacking
// ---------------------------------------------------------------------------

test('buildBuybacking: returns sorted by time', () => {
  const tlPlayers = [
    { ...makeTimelinePlayer(0), buybackEvents: [{ t: 700, dieback: false }, { t: 400, dieback: true }] },
    { ...makeTimelinePlayer(128), buybackEvents: [{ t: 550, dieback: false }] },
  ];
  const result = buildBuybacking(tlPlayers);
  assert.equal(result.length, 3);
  assert.equal(result[0].t, 400);
  assert.equal(result[1].t, 550);
  assert.equal(result[2].t, 700);
});

test('buildBuybacking: approximates cost (200 + NW/13)', () => {
  const tlPlayers = [{
    slot: 0, team: 'radiant',
    samples: [{ t: 600, nw: 13000 }],
    buybackEvents: [{ t: 700, dieback: false }],
    abilityLog: [], purchaseLog: [], smokeTimes: [], smokeSuccesses: 0,
  }];
  const result = buildBuybacking(tlPlayers);
  // NW at t≤700 → 13000. cost = 200 + 13000/13 = 200 + 1000 = 1200
  assert.equal(result[0].cost, 1200);
});

test('buildBuybacking: cost capped at 2800', () => {
  const tlPlayers = [{
    slot: 0, team: 'radiant',
    samples: [{ t: 600, nw: 100000 }],
    buybackEvents: [{ t: 700, dieback: false }],
    abilityLog: [], purchaseLog: [], smokeTimes: [], smokeSuccesses: 0,
  }];
  const result = buildBuybacking(tlPlayers);
  assert.equal(result[0].cost, 2800);
});

test('buildBuybacking: returns empty for null input', () => {
  assert.deepEqual(buildBuybacking(null), []);
});

// ---------------------------------------------------------------------------
// buildObjectiveLog
// ---------------------------------------------------------------------------

test('buildObjectiveLog: filters to objective types only', () => {
  const events = [
    { t: 100, type: 'kill', killerSlot: 0, victimSlot: 1 },
    { t: 200, type: 'roshan', team: 'radiant', detail: 'killed' },
    { t: 300, type: 'building_kill', team: 'radiant', buildingKey: 'npc_dota_goodguys_tower1_top' },
    { t: 400, type: 'aegis', team: 'radiant', detail: 'picked_up' },
  ];
  const result = buildObjectiveLog(events);
  assert.equal(result.length, 3);
  for (const e of result) {
    assert.ok(['roshan', 'building_kill', 'aegis'].includes(e.type),
      `unexpected type: ${e.type}`);
  }
});

test('buildObjectiveLog: sorted by t', () => {
  const events = [
    { t: 300, type: 'roshan' },
    { t: 100, type: 'aegis' },
  ];
  const result = buildObjectiveLog(events);
  assert.equal(result[0].t, 100);
  assert.equal(result[1].t, 300);
});

test('buildObjectiveLog: returns empty for null', () => {
  assert.deepEqual(buildObjectiveLog(null), []);
});

// ---------------------------------------------------------------------------
// buildRuneSummary
// ---------------------------------------------------------------------------

test('buildRuneSummary: counts runes by type and team', () => {
  const runes = [
    { t: 120, type: 'bounty',   team: 'radiant' },
    { t: 300, type: 'bounty',   team: 'dire' },
    { t: 600, type: 'power_up', team: 'radiant' },
  ];
  const result = buildRuneSummary(runes);
  assert.equal(result.total, 3);
  assert.equal(result.byType.bounty, 2);
  assert.equal(result.byType.power_up, 1);
  assert.equal(result.byTeam.radiant, 2);
  assert.equal(result.byTeam.dire, 1);
});

test('buildRuneSummary: handles null', () => {
  const result = buildRuneSummary(null);
  assert.equal(result.total, 0);
  assert.deepEqual(result.byTeam, { radiant: 0, dire: 0 });
});

// ---------------------------------------------------------------------------
// buildCoachingMetrics
// ---------------------------------------------------------------------------

test('buildCoachingMetrics: computes fight attendance per player', () => {
  const fights = [
    { start_s: 100, end_s: 150, heroes: [0, 1, 128] },
    { start_s: 200, end_s: 250, heroes: [0, 128, 129] },
  ];
  const tlPlayers = [
    { ...makeTimelinePlayer(0), buybackEvents: [] },
    { ...makeTimelinePlayer(1), buybackEvents: [] },
    { ...makeTimelinePlayer(128), buybackEvents: [] },
  ];
  const result = buildCoachingMetrics(tlPlayers, fights, { radiantWin: true });
  const p0 = result.playerMetrics.find(p => p.slot === 0);
  const p1 = result.playerMetrics.find(p => p.slot === 1);
  assert.ok(p0);
  // Slot 0 attended both fights → 100%
  assert.equal(p0.fightAttendancePct, 100);
  // Slot 1 attended only first fight → 50%
  assert.equal(p1.fightAttendancePct, 50);
});

test('buildCoachingMetrics: detects throw when radiant had large lead but lost', () => {
  // Radiant builds a 15k lead but loses; dire stages a comeback
  const samples = (nwArr) => nwArr.map((nw, i) => ({ t: i * 300, nw }));
  const tlPlayers = [
    { ...makeTimelinePlayer(0),   samples: samples([0, 10000, 20000, 15000, 5000]) },
    { ...makeTimelinePlayer(128), samples: samples([0, 1000,  5000, 10000, 15000]) },
  ];
  const result = buildCoachingMetrics(tlPlayers, [], { radiantWin: false });
  assert.equal(result.throwDetected, 'radiant');
  assert.equal(result.comebackDetected, 'dire');
});

test('buildCoachingMetrics: detects comeback when dire had big lead but lost', () => {
  const samples = (nwArr) => nwArr.map((nw, i) => ({ t: i * 300, nw }));
  const tlPlayers = [
    { ...makeTimelinePlayer(0), samples: samples([0, 1000, 5000, 15000, 20000]) },
    { ...makeTimelinePlayer(128), samples: samples([0, 10000, 20000, 10000, 5000]) },
  ];
  const result = buildCoachingMetrics(tlPlayers, [], { radiantWin: true });
  assert.equal(result.comebackDetected, 'radiant');
});

test('buildCoachingMetrics: counts buyback-no-fight correctly', () => {
  const fights = [
    { start_s: 100, end_s: 140, heroes: [0], winner: 'radiant', radiant_deaths: 0, dire_deaths: 0 },
  ];
  const tlPlayers = [{
    slot: 0, team: 'radiant',
    samples: [{ t: 0, nw: 0 }],
    // Buyback at t=700 — far from any fight
    buybackEvents: [{ t: 700, dieback: false }],
    abilityLog: [], purchaseLog: [], smokeTimes: [], smokeSuccesses: 0,
  }];
  const result = buildCoachingMetrics(tlPlayers, fights, { radiantWin: true });
  const p = result.playerMetrics.find(p => p.slot === 0);
  assert.equal(p.buybackNoFight, 1);
});

test('buildCoachingMetrics: does not count dieback buybacks in buybackNoFight', () => {
  const tlPlayers = [{
    slot: 0, team: 'radiant',
    samples: [{ t: 0, nw: 0 }],
    buybackEvents: [{ t: 700, dieback: true }],
    abilityLog: [], purchaseLog: [], smokeTimes: [], smokeSuccesses: 0,
  }];
  const result = buildCoachingMetrics(tlPlayers, [], {});
  const p = result.playerMetrics.find(p => p.slot === 0);
  assert.equal(p.buybackNoFight, 0);
});

test('buildCoachingMetrics: nwAt10 from sample at t<=600', () => {
  const tlPlayers = [{
    slot: 0, team: 'radiant',
    samples: [{ t: 0, nw: 0 }, { t: 600, nw: 7500 }, { t: 900, nw: 10000 }],
    buybackEvents: [], abilityLog: [], purchaseLog: [], smokeTimes: [], smokeSuccesses: 0,
  }];
  const result = buildCoachingMetrics(tlPlayers, [], {});
  assert.equal(result.playerMetrics[0].nwAt10, 7500);
});

// ---------------------------------------------------------------------------
// stripForPublic
// ---------------------------------------------------------------------------

test('stripForPublic: removes coaching layer', () => {
  const intel = {
    meta: {},
    coaching: { playerMetrics: [] },
    timeline: { players: [{ slot: 0, positions: [{ t: 0, x: 1, y: 2 }] }] },
  };
  const safe = stripForPublic(intel);
  assert.ok(!('coaching' in safe), 'coaching must be stripped');
});

test('stripForPublic: removes positions from timeline players', () => {
  const intel = {
    meta: {},
    timeline: { players: [{ slot: 0, positions: [{ t: 0, x: 1, y: 2 }], samples: [] }] },
  };
  const safe = stripForPublic(intel);
  assert.ok(!('positions' in safe.timeline.players[0]));
});

test('stripForPublic: returns null for null input', () => {
  assert.equal(stripForPublic(null), null);
});

test('stripForPublic: preserves other layers', () => {
  const intel = {
    meta: { matchId: 1 },
    fights: [{ start_s: 100 }],
    coaching: {},
    timeline: { players: [] },
  };
  const safe = stripForPublic(intel);
  assert.equal(safe.meta.matchId, 1);
  assert.equal(safe.fights.length, 1);
});

// ---------------------------------------------------------------------------
// buildMatchIntelligence — top-level integration
// ---------------------------------------------------------------------------

test('buildMatchIntelligence: throws for non-object match', () => {
  assert.throws(() => buildMatchIntelligence(null), TypeError);
  assert.throws(() => buildMatchIntelligence('bad'), TypeError);
});

test('buildMatchIntelligence: throws for invalid context', () => {
  assert.throws(() => buildMatchIntelligence({}, { context: 'superadmin' }), RangeError);
});

test('buildMatchIntelligence: public context returns correct layers', () => {
  const m = makeMatch();
  const intel = buildMatchIntelligence(m, { context: 'public' });

  assert.ok(intel.meta);
  assert.ok(intel.draft);
  assert.ok(intel.laneOutcomes);
  assert.ok(Array.isArray(intel.fights));
  assert.ok(intel.timeline);
  assert.ok(Array.isArray(intel.playerStats));
  assert.ok(intel.visionSummary);
  assert.ok(Array.isArray(intel.objectiveLog));
  assert.ok(intel.runeSummary);
  // Coaching and buybacking must NOT be in public output
  assert.ok(!('coaching' in intel), 'coaching must be absent from public output');
  assert.ok(!('buybacking' in intel), 'buybacking must be absent from public output');
});

test('buildMatchIntelligence: participant context includes coaching and buybacking', () => {
  const m = makeMatch();
  const intel = buildMatchIntelligence(m, { context: 'participant' });
  assert.ok(intel.coaching, 'coaching must be in participant output');
  assert.ok(Array.isArray(intel.buybacking), 'buybacking must be in participant output');
});

test('buildMatchIntelligence: admin context includes participant-layer data', () => {
  const m = makeMatch();
  const intel = buildMatchIntelligence(m, { context: 'admin' });
  assert.ok(intel.coaching);
  assert.ok(Array.isArray(intel.buybacking));
});

test('buildMatchIntelligence: public context excludes positions from timeline', () => {
  const m = makeMatch();
  const intel = buildMatchIntelligence(m, { context: 'public' });
  for (const p of intel.timeline.players) {
    assert.ok(!('positions' in p), 'positions must not appear in public timeline');
  }
});

test('buildMatchIntelligence: public timeline exposes counts, not per-player event logs', () => {
  const intel = buildMatchIntelligence(makeMatch(), { context: 'public' });
  for (const player of intel.timeline.players) {
    assert.ok(!('samples' in player));
    assert.ok(!('purchaseLog' in player));
    assert.ok(!('abilityLog' in player));
    assert.ok(!('abilityCastLog' in player));
    assert.ok(!('itemUseLog' in player));
    assert.ok(!('buybackEvents' in player));
    assert.ok(!('smokeTimes' in player));
  }
});

test('applyTelemetryFamilyFlags removes disabled layers and position detail', () => {
  const intel = buildMatchIntelligence(makeMatch(), { context: 'participant' });
  const flags = Object.fromEntries([
    'draft', 'position', 'fights', 'economy', 'movement', 'vision',
    'abilities', 'combat', 'laning', 'objectives', 'coaching',
  ].map(family => [`replay_telemetry_${family}`, true]));
  flags.replay_telemetry_draft = false;
  flags.replay_telemetry_position = false;
  flags.replay_telemetry_coaching = false;

  const filtered = applyTelemetryFamilyFlags(intel, flags, 'participant');
  assert.ok(!('draft' in filtered));
  assert.ok(!('coaching' in filtered));
  assert.ok(filtered.timeline.players.every(player => !('positions' in player)));
  assert.ok(filtered.timeline.tpActivations.every(event => !('destX' in event) && !('destY' in event)));
});

test('applyTelemetryFamilyFlags removes disabled families from nested timeline data', () => {
  const intel = buildMatchIntelligence(makeMatch(), { context: 'participant' });
  const flags = Object.fromEntries([
    'draft', 'position', 'fights', 'economy', 'movement', 'vision',
    'abilities', 'combat', 'laning', 'objectives', 'coaching',
  ].map(family => [`replay_telemetry_${family}`, false]));

  const filtered = applyTelemetryFamilyFlags(intel, flags, 'participant');
  assert.equal(filtered.timeline.draftMeta, null);
  assert.deepEqual(filtered.timeline.fights, []);
  assert.deepEqual(filtered.timeline.players, []);
  assert.deepEqual(filtered.timeline.wardDeaths, []);
  assert.deepEqual(filtered.timeline.runePickups, []);
  assert.deepEqual(filtered.timeline.tpActivations, []);
  assert.ok(filtered.timeline.events.every(event =>
    !['kill', 'building_kill', 'roshan', 'aegis', 'rune', 'tower', 'barracks',
      'shrine', 'outpost', 'tormentor', 'lotus', 'teamfight_start', 'teamfight_end']
      .includes(event.type)
  ));
  for (const key of [
    'draft', 'laneOutcomes', 'fights', 'visionSummary', 'teamAbilities',
    'objectiveLog', 'runeSummary', 'playerStats', 'buybacking', 'coaching',
  ]) {
    assert.ok(!(key in filtered), `${key} should be removed when its family is disabled`);
  }
});

test('buildMatchIntelligence: participant context can include positions', () => {
  const m = makeMatch();
  const intel = buildMatchIntelligence(m, { context: 'participant' });
  const withPositions = intel.timeline.players.filter(p => Array.isArray(p.positions) && p.positions.length > 0);
  assert.ok(withPositions.length > 0, 'at least one player should have positions in participant context');
});

test('buildMatchIntelligence: never includes chat_log regardless of context', () => {
  const m = { ...makeMatch(), chat_log: 'secret message', chat_text: 'another secret' };
  for (const ctx of ['public', 'participant', 'admin']) {
    const intel = buildMatchIntelligence(m, { context: ctx });
    assert.ok(!('chat_log' in intel), `chat_log must not appear in ${ctx} output`);
    assert.ok(!('chat_text' in intel), `chat_text must not appear in ${ctx} output`);
  }
});

test('buildMatchIntelligence: never includes replay_path', () => {
  const m = { ...makeMatch(), replay_path: '/var/replays/match_12345.dem' };
  for (const ctx of ['public', 'participant', 'admin']) {
    const intel = buildMatchIntelligence(m, { context: ctx });
    assert.ok(!('replay_path' in intel));
    // Also not in nested objects
    const str = JSON.stringify(intel);
    assert.ok(!str.includes('/var/replays'), `replay_path must not leak into ${ctx} output`);
  }
});

test('buildMatchIntelligence: uses embedded timeline.fights when no fights passed', () => {
  const m = makeMatch();
  const intel = buildMatchIntelligence(m, { context: 'public' });
  // Timeline has 2 fights
  assert.equal(intel.fights.length, 2);
});

test('buildMatchIntelligence: external fights array overrides timeline fights', () => {
  const m = makeMatch();
  const externalFights = [
    { start_s: 50, end_s: 80, heroes: [0, 128], winner: 'dire', radiant_deaths: 1, dire_deaths: 0 },
  ];
  const intel = buildMatchIntelligence(m, { fights: externalFights, context: 'public' });
  assert.equal(intel.fights.length, 1);
  assert.equal(intel.fights[0].winner, 'dire');
});

test('buildMatchIntelligence: meta.radiantWin is boolean', () => {
  const intel = buildMatchIntelligence(makeMatch({ radiant_win: 1 }), { context: 'public' });
  // 1 is truthy but not === true for radiant_win: true check
  assert.equal(typeof intel.meta.radiantWin, 'boolean');
});

test('buildMatchIntelligence: player stats in public output lack private fields', () => {
  const intel = buildMatchIntelligence(makeMatch(), { context: 'public' });
  for (const p of intel.playerStats) {
    assert.ok(!('killed_by' in p));
    assert.ok(!('item_first_times' in p));
    assert.ok(!('save_events' in p));
  }
});

test('buildMatchIntelligence: vision summary has correct totals', () => {
  const m = makeMatch();
  const intel = buildMatchIntelligence(m, { context: 'public' });
  const vision = intel.visionSummary;
  // All 10 players each have obs_placed=3, sen_placed=2
  assert.equal(vision.totalObsPlaced, 30);
  assert.equal(vision.totalSenPlaced, 20);
});

test('buildMatchIntelligence: objective log contains roshan and building events only', () => {
  const intel = buildMatchIntelligence(makeMatch(), { context: 'public' });
  const types = new Set(intel.objectiveLog.map(e => e.type));
  assert.ok(!types.has('kill'), 'kill events should not appear in objective log');
  assert.ok(types.has('roshan'));
  assert.ok(types.has('building_kill'));
});

test('buildMatchIntelligence: rune summary counts correctly', () => {
  const intel = buildMatchIntelligence(makeMatch(), { context: 'public' });
  // Timeline has 3 rune pickups: 2 bounty + 1 power_up
  assert.equal(intel.runeSummary.total, 3);
  assert.equal(intel.runeSummary.byType.bounty, 2);
  assert.equal(intel.runeSummary.byType.power_up, 1);
});

test('buildMatchIntelligence: draft sequence covers picks and bans in order', () => {
  const intel = buildMatchIntelligence(makeMatch(), { context: 'public' });
  assert.ok(intel.draft);
  assert.ok(intel.draft.sequence.length >= 3); // 2 picks + 1 ban
});

test('buildMatchIntelligence: handles match with no draft gracefully', () => {
  const m = makeMatch({ draft: null });
  const intel = buildMatchIntelligence(m, { context: 'public' });
  assert.equal(intel.draft, null);
});

test('buildMatchIntelligence: handles match with no game_timeline gracefully', () => {
  const m = makeMatch({ game_timeline: null });
  const intel = buildMatchIntelligence(m, { context: 'public' });
  assert.ok(intel.timeline);
  assert.deepEqual(intel.timeline.players, []);
});

test('buildMatchIntelligence: teamAbilities layer present when available', () => {
  const intel = buildMatchIntelligence(makeMatch(), { context: 'public' });
  assert.ok(intel.teamAbilities);
  assert.ok(intel.teamAbilities.radiant);
  assert.ok(intel.teamAbilities.dire);
});

test('buildMatchIntelligence: teamAbilities null when not in match', () => {
  const m = makeMatch({ teamAbilities: null });
  const intel = buildMatchIntelligence(m, { context: 'public' });
  assert.equal(intel.teamAbilities, null);
});
