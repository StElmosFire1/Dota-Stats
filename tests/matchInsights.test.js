// Task #439 — Snapshot tests for the match-insights derivation module.
// Pure-function tests; no DB or HTTP required.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deriveAllInsights,
  derivePersistableFields,
  deriveLaneGrading,
  deriveItemTimingCohort,
  deriveNetWorthSwings,
  deriveFightParticipation,
  deriveDeathContext,
  deriveRoshanTimeline,
  classifyDeaths,
} = require('../src/insights/matchInsights');

function fixtureMatch() {
  return {
    duration: 2400,
    radiant_win: true,
    players: [
      // Radiant safe (pos 1+5), mid (pos 2), off (pos 3+4)
      { slot: 0, account_id: 'r1', hero_id: 1,  team: 'radiant', position: 1, laning_nw: 7000, deaths: 1, kills: 3, teamfight_participation: 0.4, killed_by: { npc_dota_hero_a: 1 }, item_first_times: { item_blink: 900, item_black_king_bar: 1500 } },
      { slot: 1, account_id: 'r2', hero_id: 5,  team: 'radiant', position: 2, laning_nw: 5500, deaths: 2, kills: 6, teamfight_participation: 0.8, killed_by: { npc_dota_hero_b: 1, npc_dota_hero_c: 1 }, item_first_times: { item_blink: 720 } },
      { slot: 2, account_id: 'r3', hero_id: 10, team: 'radiant', position: 3, laning_nw: 4500, deaths: 3, teamfight_participation: 0.75, killed_by: {} },
      { slot: 3, account_id: 'r4', hero_id: 11, team: 'radiant', position: 4, laning_nw: 2200, deaths: 4 },
      { slot: 4, account_id: 'r5', hero_id: 12, team: 'radiant', position: 5, laning_nw: 1900, deaths: 5 },
      { slot: 128, account_id: 'd1', hero_id: 20, team: 'dire', position: 1, laning_nw: 5200, deaths: 4 },
      { slot: 129, account_id: 'd2', hero_id: 21, team: 'dire', position: 2, laning_nw: 5300, deaths: 3 },
      { slot: 130, account_id: 'd3', hero_id: 22, team: 'dire', position: 3, laning_nw: 3500, deaths: 6 },
      { slot: 131, account_id: 'd4', hero_id: 23, team: 'dire', position: 4, laning_nw: 1100, deaths: 7 },
      { slot: 132, account_id: 'd5', hero_id: 24, team: 'dire', position: 5, laning_nw: 900,  deaths: 8 },
    ],
    game_timeline: {
      players: [
        { slot: 0,   samples: [{ t: 0, nw: 0 }, { t: 600, nw: 7000 }, { t: 1200, nw: 14000 }, { t: 1800, nw: 18000 }] },
        { slot: 1,   samples: [{ t: 0, nw: 0 }, { t: 600, nw: 5500 }, { t: 1200, nw: 11000 }, { t: 1800, nw: 15000 }] },
        { slot: 2,   samples: [{ t: 0, nw: 0 }, { t: 600, nw: 4500 }, { t: 1200, nw:  9000 }, { t: 1800, nw: 12000 }] },
        { slot: 3,   samples: [{ t: 0, nw: 0 }, { t: 600, nw: 2200 }, { t: 1200, nw:  5000 }, { t: 1800, nw:  7000 }] },
        { slot: 4,   samples: [{ t: 0, nw: 0 }, { t: 600, nw: 1900 }, { t: 1200, nw:  4500 }, { t: 1800, nw:  6000 }] },
        { slot: 128, samples: [{ t: 0, nw: 0 }, { t: 600, nw: 5200 }, { t: 1200, nw:  9000 }, { t: 1800, nw: 11000 }] },
        { slot: 129, samples: [{ t: 0, nw: 0 }, { t: 600, nw: 5300 }, { t: 1200, nw:  9500 }, { t: 1800, nw: 11500 }] },
        { slot: 130, samples: [{ t: 0, nw: 0 }, { t: 600, nw: 3500 }, { t: 1200, nw:  6500 }, { t: 1800, nw:  8000 }] },
        { slot: 131, samples: [{ t: 0, nw: 0 }, { t: 600, nw: 1100 }, { t: 1200, nw:  2500 }, { t: 1800, nw:  3000 }] },
        { slot: 132, samples: [{ t: 0, nw: 0 }, { t: 600, nw:  900 }, { t: 1200, nw:  2000 }, { t: 1800, nw:  2500 }] },
      ],
      events: [
        { t: 900,  type: 'roshan', team: 'radiant', detail: 'killed' },
        { t: 905,  type: 'aegis',  team: 'radiant', detail: 'picked_up' },
        { t: 1700, type: 'roshan', team: 'radiant' },
      ],
    },
  };
}

const FIGHTS = [
  { start_s: 580,  end_s: 640,  heroes: [0, 1, 128, 129, 130], winner: 'radiant', radiant_deaths: 0, dire_deaths: 2 },
  { start_s: 1180, end_s: 1240, heroes: [0, 1, 2, 128, 129, 130, 131], winner: 'radiant', radiant_deaths: 1, dire_deaths: 3 },
];

test('lane grading buckets by physical lane (radiant safe = dire off = bot)', () => {
  const ins = deriveLaneGrading(fixtureMatch().players);
  assert.equal(ins.key, 'match_insights_lane_grading');
  // Bot lane ("safe"): radiant 1+5 = 7000+1900 = 8900 vs dire 3+4 = 3500+1100 = 4600 → adv +4300 → stomp
  const radSafe = ins.rows.find(r => r.slot === 0);
  assert.equal(radSafe.lane, 'safe');
  assert.equal(radSafe.grade, 'stomp');
  const direInBotLane = ins.rows.find(r => r.slot === 130);
  assert.equal(direInBotLane.lane, 'safe');
  assert.equal(direInBotLane.grade, 'feed');
  // Top lane ("off"): radiant 3+4 = 4500+2200 = 6700 vs dire 1+5 = 5200+900 = 6100 → adv +600 → even
  const radOff = ins.rows.find(r => r.slot === 2);
  assert.equal(radOff.lane, 'off');
  assert.equal(radOff.grade, 'even');
});

test('item timing percentile against a cohort distribution', () => {
  const cohort = {
    1: { item_blink: [600, 800, 1000, 1200, 1400] }, // hero 1, blink times
  };
  const ins = deriveItemTimingCohort(fixtureMatch().players, cohort);
  const blink = ins.rows.find(r => r.hero_id === 1 && r.item === 'item_blink');
  assert.ok(blink);
  assert.equal(blink.time_s, 900);
  // 900 is faster than 1000, 1200, 1400 → 3 of 5 slower = 60th percentile
  assert.equal(blink.percentile, 60);
  assert.equal(blink.cohort_size, 5);
});

test('item timing handles empty cohort', () => {
  const ins = deriveItemTimingCohort(fixtureMatch().players, {});
  for (const r of ins.rows) assert.equal(r.percentile, null);
});

test('net-worth swings finds biggest team-gold-lead deltas', () => {
  const m = fixtureMatch();
  const ins = deriveNetWorthSwings(m.game_timeline, m.players, 3);
  assert.equal(ins.key, 'match_insights_nw_swings');
  assert.ok(ins.rows.length >= 1 && ins.rows.length <= 3);
  for (const sw of ins.rows) {
    assert.ok(typeof sw.delta === 'number');
    assert.ok(Array.isArray(sw.top_gainers));
  }
});

test('fight participation counts heroes in match_fights and computes participation %', () => {
  const m = fixtureMatch();
  const ins = deriveFightParticipation(m.game_timeline, m.players, FIGHTS);
  const r1 = ins.rows.find(r => r.slot === 0);
  assert.equal(r1.fights_participated, 2);
  assert.equal(r1.total_fights, 2);
  assert.equal(r1.participation_pct, 100);
  const r5 = ins.rows.find(r => r.slot === 4);
  assert.equal(r5.fights_participated, 0);
  assert.equal(r5.participation_pct, 0);
});

test('death-context classifier labels solo/ganked/teamfight from killer-count + tfp', () => {
  assert.equal(classifyDeaths({ deaths: 0 }, 0), 'no_deaths');
  assert.equal(classifyDeaths({ deaths: 3, teamfight_participation: 0.2 }, 1), 'solo_picks');
  assert.equal(classifyDeaths({ deaths: 4, teamfight_participation: 0.4 }, 3), 'ganked');
  assert.equal(classifyDeaths({ deaths: 5, teamfight_participation: 0.8 }, 2), 'teamfight_heavy');
  assert.equal(classifyDeaths({ deaths: 6, teamfight_participation: 0.1 }, 5), 'teamfight_heavy');
});

test('death context insight uses real killer counts from killed_by', () => {
  const m = fixtureMatch();
  const ins = deriveDeathContext(m.players, FIGHTS);
  const r2 = ins.rows.find(r => r.slot === 1);
  assert.equal(r2.distinct_killers, 2);
  assert.equal(r2.classification, 'teamfight_heavy');
});

test('roshan timeline pulls roshan + aegis events sorted by time', () => {
  const ins = deriveRoshanTimeline(fixtureMatch().game_timeline);
  assert.equal(ins.rows.length, 3);
  assert.deepEqual(ins.rows.map(r => r.t), [900, 905, 1700]);
});

test('deriveAllInsights returns the full canonical set of insights', () => {
  const m = fixtureMatch();
  const all = deriveAllInsights(m, { fights: FIGHTS });
  const keys = all.map(i => i.key);
  // All ten insights must be present and key-stable for the feature-flag system.
  assert.deepEqual(keys, [
    'match_insights_lane_grading',
    'match_insights_vision_report',
    'match_insights_item_timing_cohort',
    'match_insights_fight_participation',
    'match_insights_nw_swings',
    'match_insights_skill_build',
    'match_insights_death_context',
    'match_insights_roshan_timeline',
    'match_insights_save_events',
    'match_insights_parser_field_status',
  ]);
  // Each insight must have key/label/rows/summary/raw shape.
  for (const ins of all) {
    assert.ok(ins.key && ins.label);
    assert.ok(Array.isArray(ins.rows));
    assert.ok('summary' in ins && 'raw' in ins);
  }
});

test('derivePersistableFields produces per-slot lane_outcome + death_context + fight_arrival_time', () => {
  const m = fixtureMatch();
  const per = derivePersistableFields(m, { fights: FIGHTS });
  for (const p of m.players) {
    assert.ok(per[p.slot], `missing persistable row for slot ${p.slot}`);
    assert.ok('lane_outcome' in per[p.slot]);
    assert.ok('death_context' in per[p.slot]);
    assert.ok('fight_arrival_time' in per[p.slot]);
  }
});

test('handles match with no timeline gracefully', () => {
  const m = { ...fixtureMatch(), game_timeline: null };
  const all = deriveAllInsights(m, { fights: [] });
  // No throws, all insights present
  assert.equal(all.length, 10);
  const swings = all.find(i => i.key === 'match_insights_nw_swings');
  assert.equal(swings.rows.length, 0);
});
