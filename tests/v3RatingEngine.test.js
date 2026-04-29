const test = require('node:test');
const assert = require('node:assert/strict');

const { getStatsService } = require('../src/stats/statsService');
const {
  computeSeasonTrueSkillV3,
  getMatchV3Modifiers,
  getPlayerV3ModifierHistory,
  _v3PerfScore,
  _v3PerfScoreBreakdown,
  _v3ScoresToModifiers,
  _v3HasCrossTeamCollision,
} = require('../src/db');

const stats = getStatsService();

const DEFAULT_MU = 25;
const DEFAULT_SIGMA = 8.333;
const SIGMA_FLOOR = 2.5;
const MMR_OFFSET = 2600;

function makeTeam(prefix, count, overrides = {}) {
  const team = [];
  for (let i = 0; i < count; i++) {
    team.push({
      id: `${prefix}${i}`,
      mu: overrides.mu ?? DEFAULT_MU,
      sigma: overrides.sigma ?? DEFAULT_SIGMA,
      ...(overrides.modifier !== undefined ? { modifier: overrides.modifier } : {}),
    });
  }
  return team;
}

function findById(results, id) {
  const r = results.find((x) => x.id === id);
  assert.ok(r, `expected result for id ${id}`);
  return r;
}

test('calculateNewRatingsV3: sigma floor enforced when prior sigma is well below 2.5', () => {
  // Veterans whose sigma has collapsed below the floor must come back out at >= 2.5.
  const radiant = makeTeam('R', 5, { sigma: 0.1 });
  const dire    = makeTeam('D', 5, { sigma: 0.1 });

  const results = stats.calculateNewRatingsV3(radiant, dire, true);

  assert.equal(results.length, 10);
  for (const r of results) {
    assert.ok(
      r.sigma >= SIGMA_FLOOR - 1e-9,
      `sigma ${r.sigma} for ${r.id} should be at least the floor ${SIGMA_FLOOR}`
    );
  }
});

test('calculateNewRatingsV3: sigma floor does not inflate already-large sigma', () => {
  // If post-update sigma is naturally above the floor, the floor must be a no-op.
  const radiant = makeTeam('R', 5, { sigma: DEFAULT_SIGMA });
  const dire    = makeTeam('D', 5, { sigma: DEFAULT_SIGMA });

  const results = stats.calculateNewRatingsV3(radiant, dire, true);
  for (const r of results) {
    assert.ok(r.sigma > SIGMA_FLOOR, `sigma ${r.sigma} should be > floor in fresh-rating case`);
  }
});

test('calculateNewRatingsV3: modifier clamped at lower bound 0.80', () => {
  // Build a fully symmetric match, then place one player on Radiant with an
  // out-of-range modifier (0.5). Clamp to 0.80 should be observable by
  // comparing against an identical player given modifier = 0.80 explicitly.
  const radiantClampInput = makeTeam('R', 5);
  radiantClampInput[0].modifier = 0.5; // below clamp
  const direClampInput = makeTeam('D', 5);

  const radiantExpected = makeTeam('R', 5);
  radiantExpected[0].modifier = 0.80;
  const direExpected = makeTeam('D', 5);

  const clamped  = stats.calculateNewRatingsV3(radiantClampInput, direClampInput, true);
  const expected = stats.calculateNewRatingsV3(radiantExpected, direExpected, true);

  const c = findById(clamped,  'R0');
  const e = findById(expected, 'R0');
  assert.ok(Math.abs(c.mu - e.mu) < 1e-9, `mu ${c.mu} should equal modifier=0.80 mu ${e.mu}`);
  assert.ok(Math.abs(c.sigma - e.sigma) < 1e-9);
});

test('calculateNewRatingsV3: modifier clamped at upper bound 1.20', () => {
  const radiantClampInput = makeTeam('R', 5);
  radiantClampInput[0].modifier = 5.0; // way above clamp
  const direClampInput = makeTeam('D', 5);

  const radiantExpected = makeTeam('R', 5);
  radiantExpected[0].modifier = 1.20;
  const direExpected = makeTeam('D', 5);

  const clamped  = stats.calculateNewRatingsV3(radiantClampInput, direClampInput, true);
  const expected = stats.calculateNewRatingsV3(radiantExpected, direExpected, true);

  const c = findById(clamped,  'R0');
  const e = findById(expected, 'R0');
  assert.ok(Math.abs(c.mu - e.mu) < 1e-9, `mu ${c.mu} should equal modifier=1.20 mu ${e.mu}`);
  assert.ok(Math.abs(c.sigma - e.sigma) < 1e-9);
});

test('calculateNewRatingsV3: missing modifier falls back to 1.0 (lobby-only matches)', () => {
  // When no `modifier` is supplied (lobby-only match), the V3 update for that
  // player must equal an explicit modifier=1.0 update.
  const radiantNoMod   = makeTeam('R', 5); // no modifier field at all
  const direNoMod      = makeTeam('D', 5);

  const radiantOneMod  = makeTeam('R', 5, { modifier: 1.0 });
  const direOneMod     = makeTeam('D', 5, { modifier: 1.0 });

  const noMod = stats.calculateNewRatingsV3(radiantNoMod, direNoMod, true);
  const oneMod = stats.calculateNewRatingsV3(radiantOneMod, direOneMod, true);

  assert.equal(noMod.length, oneMod.length);
  for (const r of noMod) {
    const o = findById(oneMod, r.id);
    assert.ok(Math.abs(r.mu - o.mu) < 1e-9,    `mu mismatch for ${r.id}: ${r.mu} vs ${o.mu}`);
    assert.ok(Math.abs(r.sigma - o.sigma) < 1e-9, `sigma mismatch for ${r.id}`);
    assert.equal(r.mmr, o.mmr);
  }
});

test('calculateNewRatingsV3: NaN/Infinite modifier falls back to 1.0', () => {
  const radiantNaN = makeTeam('R', 5);
  radiantNaN[0].modifier = NaN;
  const dire = makeTeam('D', 5);

  const radiantOne = makeTeam('R', 5, { modifier: 1.0 });
  const direOne    = makeTeam('D', 5, { modifier: 1.0 });

  const got      = stats.calculateNewRatingsV3(radiantNaN, dire,    true);
  const expected = stats.calculateNewRatingsV3(radiantOne, direOne, true);

  const g = findById(got,      'R0');
  const e = findById(expected, 'R0');
  assert.ok(Math.abs(g.mu - e.mu) < 1e-9, `NaN modifier should fall back to 1.0`);
});

test('_v3ScoresToModifiers: maps z=-2σ to 0.80 and z=+2σ to 1.20', () => {
  // Construct a 10-player distribution with one extreme outlier at each end
  // so both the min and max naturally clamp at z = ±2 → modifier = 0.80 / 1.20.
  // Mean = 0; raw z-scores at the extremes are well past ±2.
  const scoreByCanon = {
    low: -1000, high: 1000,
    a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, h: 0,
  };
  const mods = _v3ScoresToModifiers(scoreByCanon);

  assert.ok(Math.abs(mods.low  - 0.80) < 1e-9, `z=-2 should map to 0.80, got ${mods.low}`);
  assert.ok(Math.abs(mods.high - 1.20) < 1e-9, `z=+2 should map to 1.20, got ${mods.high}`);

  // Players sitting on the mean (score=0) should land on 1.0 exactly.
  for (const k of ['a','b','c','d','e','f','g','h']) {
    assert.ok(Math.abs(mods[k] - 1.0) < 1e-9, `score=mean should map to 1.0, got ${mods[k]} for ${k}`);
  }
});

test('_v3ScoresToModifiers: clamps extreme outliers to 0.80 / 1.20', () => {
  // One huge outlier — its raw z is far above 2 but must clamp at 1.20.
  const scores = { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1, h: 1, i: 1, j: 10000 };
  const mods = _v3ScoresToModifiers(scores);
  assert.ok(Math.abs(mods.j - 1.20) < 1e-9, `outlier should clamp to 1.20, got ${mods.j}`);
  // The 9 equal players are below the mean — they share the same negative z
  // and should be at or above the lower clamp.
  for (const k of ['a','b','c','d','e','f','g','h','i']) {
    assert.ok(mods[k] >= 0.80 - 1e-9, `under-mean modifier for ${k} should be >= 0.80, got ${mods[k]}`);
    assert.ok(mods[k] <= 1.0 - 1e-9,  `under-mean modifier for ${k} should be < 1.0, got ${mods[k]}`);
  }
});

test('_v3ScoresToModifiers: zero variance returns 1.0 for all players', () => {
  const scores = { a: 5, b: 5, c: 5, d: 5, e: 5 };
  const mods = _v3ScoresToModifiers(scores);
  for (const v of Object.values(mods)) {
    assert.ok(Math.abs(v - 1.0) < 1e-9, `equal scores should produce modifier 1.0, got ${v}`);
  }
});

test('_v3ScoresToModifiers: empty input returns empty object', () => {
  assert.deepEqual(_v3ScoresToModifiers({}), {});
});

test('_v3HasCrossTeamCollision: detects same canonical id on both teams', () => {
  // Same player ID landing on both Radiant and Dire after canonical merging
  // must be flagged so the caller can skip the match.
  assert.equal(
    _v3HasCrossTeamCollision(['1', '2', '3', '4', '5'], ['6', '7', '3', '8', '9']),
    true,
    'shared id "3" must be detected as a collision'
  );
});

test('_v3HasCrossTeamCollision: returns false when teams are disjoint', () => {
  assert.equal(
    _v3HasCrossTeamCollision(['1', '2', '3', '4', '5'], ['6', '7', '8', '9', '10']),
    false
  );
});

test('_v3HasCrossTeamCollision: returns false for empty teams', () => {
  assert.equal(_v3HasCrossTeamCollision([], []), false);
  assert.equal(_v3HasCrossTeamCollision(['a'], []), false);
  assert.equal(_v3HasCrossTeamCollision([], ['a']), false);
});

test('_v3PerfScore: smoke test — winning play scores higher than equal losing play', () => {
  const s = { kills: 10, deaths: 5, assists: 15, gpm: 600, xpm: 700,
              hero_dmg: 30000, tower_dmg: 5000, healing: 3000,
              obs: 5, sen: 6, dewards: 4, camps: 8 };
  const won  = _v3PerfScore(s, true);
  const lost = _v3PerfScore(s, false);
  assert.equal(won - lost, 25, 'win bonus should add exactly 25 to the score');
});

test('computeSeasonTrueSkillV3: cross-team canonical-id collision skips the match end-to-end', async () => {
  // Two raw account IDs ("100" and "200") share the same nickname so
  // canonical merging collapses them to "100" (lexicographically smallest).
  // Match A puts "200" on Radiant and "100" on Dire — after merging, the
  // same canonical id "100" lands on both teams. The defensive guard must
  // skip this match. Match B is a clean game with disjoint sides so we can
  // confirm the function still updates ratings normally for non-collision
  // matches.
  const NICK_ROWS = [
    { account_id: 100, nickname: 'twinAccount' },
    { account_id: 200, nickname: 'twinAccount' },
  ];

  const baseStats = {
    persona_name: null, kills: 0, deaths: 0, assists: 0,
    gpm: 0, xpm: 0, hero_damage: 0, tower_damage: 0, hero_healing: 0,
    obs_placed: 0, sen_placed: 0, wards_killed: 0, camps_stacked: 0,
  };
  const row = (matchId, accountId, team, radiantWin, persona) => ({
    match_id: matchId,
    date: new Date('2025-01-01T00:00:00Z'),
    radiant_win: radiantWin,
    account_id: accountId,
    persona_name: persona,
    team,
    ...baseStats,
  });

  // Match A — collision: "200" on Radiant, "100" on Dire (both canonicalise to "100").
  const matchA = [
    row('A', 200, 'radiant', true, 'twin'),
    row('A', 301, 'radiant', true, 'p1'),
    row('A', 302, 'radiant', true, 'p2'),
    row('A', 303, 'radiant', true, 'p3'),
    row('A', 304, 'radiant', true, 'p4'),
    row('A', 100, 'dire',    true, 'twin'),
    row('A', 401, 'dire',    true, 'p5'),
    row('A', 402, 'dire',    true, 'p6'),
    row('A', 403, 'dire',    true, 'p7'),
    row('A', 404, 'dire',    true, 'p8'),
  ];
  // Match B — clean: 10 disjoint players, none of them the merged twin id.
  const matchB = [
    row('B', 501, 'radiant', true, 'q1'),
    row('B', 502, 'radiant', true, 'q2'),
    row('B', 503, 'radiant', true, 'q3'),
    row('B', 504, 'radiant', true, 'q4'),
    row('B', 505, 'radiant', true, 'q5'),
    row('B', 601, 'dire',    true, 'q6'),
    row('B', 602, 'dire',    true, 'q7'),
    row('B', 603, 'dire',    true, 'q8'),
    row('B', 604, 'dire',    true, 'q9'),
    row('B', 605, 'dire',    true, 'q10'),
  ];

  const fakePool = {
    async query(sql /*, params */) {
      const text = String(sql);
      if (text.includes('FROM nicknames')) return { rows: NICK_ROWS };
      if (text.includes('FROM matches m')) {
        return { rows: [...matchA, ...matchB] };
      }
      throw new Error('unexpected query in test: ' + text.slice(0, 80));
    },
  };

  const { ratings, accountToCanonical } = await computeSeasonTrueSkillV3(null, fakePool);

  // Sanity: canonical merging actually happened for the twins.
  assert.equal(accountToCanonical['100'], '100');
  assert.equal(accountToCanonical['200'], '100');

  // The merged canonical "100" must NOT have been updated by Match A. If the
  // guard had failed and the match had been processed, "100" would have ended
  // up with rating data and a win/loss tally. Match B does not include "100".
  assert.equal(ratings['100'], undefined,
    'collided canonical id must have no rating after the collision-only match is skipped');

  // Match A's other 8 unique players also must not have been updated (the
  // entire match is skipped, not just the colliding player).
  for (const id of ['301','302','303','304','401','402','403','404']) {
    assert.equal(ratings[id], undefined,
      `player ${id} from skipped match A must have no rating`);
  }

  // Match B must still have produced normal ratings for all 10 players.
  for (const id of ['501','502','503','504','505','601','602','603','604','605']) {
    assert.ok(ratings[id], `player ${id} from clean match B should have a rating`);
    assert.ok(ratings[id].mu !== undefined && ratings[id].sigma !== undefined);
    assert.equal(ratings[id].wins + ratings[id].losses, 1, `${id} should have exactly one game recorded`);
  }
});

test('calculateNewRatingsV3: MMR formula = round((mu - 3*sigma) * 100) + 2600', () => {
  const radiant = makeTeam('R', 5);
  const dire    = makeTeam('D', 5);
  const results = stats.calculateNewRatingsV3(radiant, dire, true);
  for (const r of results) {
    const expected = Math.round((r.mu - 3 * r.sigma) * 100) + MMR_OFFSET;
    assert.equal(r.mmr, expected, `mmr formula mismatch for ${r.id}`);
  }
});

test('_v3PerfScoreBreakdown: component sum equals _v3PerfScore', () => {
  const cases = [
    [{ kills: 12, deaths: 2, assists: 18, gpm: 700, xpm: 750,
       hero_dmg: 35000, tower_dmg: 7000, healing: 12000,
       obs: 6, sen: 8, dewards: 5, camps: 4 }, true],
    [{ kills: 0, deaths: 12, assists: 1, gpm: 250, xpm: 300,
       hero_dmg: 4000, tower_dmg: 100, healing: 0,
       obs: 0, sen: 0, dewards: 0, camps: 0 }, false],
    [{ kills: 0, deaths: 0, assists: 0, gpm: 0, xpm: 0,
       hero_dmg: 0, tower_dmg: 0, healing: 0,
       obs: 0, sen: 0, dewards: 0, camps: 0 }, true],
  ];
  for (const [s, won] of cases) {
    const total = _v3PerfScore(s, won);
    const { total: bdTotal, parts } = _v3PerfScoreBreakdown(s, won);
    assert.ok(Math.abs(total - bdTotal) < 1e-9,
      `breakdown total ${bdTotal} should match score ${total}`);
    const sum = Object.values(parts).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - total) < 1e-9,
      `sum of parts ${sum} should equal total ${total}`);
    assert.equal(parts.win, won ? 25 : 0, 'win component must be exactly 0 or 25');
  }
});

test('_v3PerfScoreBreakdown: includes every documented component key', () => {
  const expected = ['kills','assists','deaths','gpm','xpm','hero_damage',
    'tower_damage','healing','camps','obs','sen','dewards','win'];
  const { parts } = _v3PerfScoreBreakdown(
    { kills: 1, deaths: 1, assists: 1, gpm: 1, xpm: 1,
      hero_dmg: 1, tower_dmg: 1, healing: 1,
      obs: 1, sen: 1, dewards: 1, camps: 1 }, true);
  for (const k of expected) {
    assert.ok(k in parts, `breakdown missing component "${k}"`);
  }
  assert.equal(Object.keys(parts).length, expected.length,
    'breakdown must not contain unexpected components');
});

// ── Per-match modifier breakdown (for the scoreboard "why did my MMR change") ─
function _baseMatchRows(matchId, radiantWin) {
  const blank = {
    persona_name: null, kills: 0, deaths: 0, assists: 0,
    gpm: 0, xpm: 0, hero_damage: 0, tower_damage: 0, hero_healing: 0,
    obs_placed: 0, sen_placed: 0, wards_killed: 0, camps_stacked: 0,
  };
  const mk = (accountId, team, persona, overrides = {}) => ({
    match_id: matchId,
    date: new Date('2025-01-01T00:00:00Z'),
    radiant_win: radiantWin,
    account_id: accountId,
    persona_name: persona,
    team,
    ...blank,
    ...overrides,
  });
  return mk;
}

test('getMatchV3Modifiers: returns per-player modifier + breakdown matching season math', async () => {
  const mk = _baseMatchRows('M1', true);
  const carry  = mk(11, 'radiant', 'carry',  { kills: 14, deaths: 2,  assists: 8,  gpm: 750, xpm: 800, hero_damage: 40000, tower_damage: 8000 });
  const mid    = mk(12, 'radiant', 'mid',    { kills: 9,  deaths: 4,  assists: 12, gpm: 600, xpm: 700, hero_damage: 28000, tower_damage: 3000 });
  const off    = mk(13, 'radiant', 'off',    { kills: 6,  deaths: 5,  assists: 14, gpm: 480, xpm: 520, hero_damage: 20000, tower_damage: 2000 });
  const sup4   = mk(14, 'radiant', 'sup4',   { kills: 3,  deaths: 7,  assists: 18, gpm: 320, xpm: 380, hero_damage: 9000,  hero_healing: 4000, obs_placed: 7,  sen_placed: 5, wards_killed: 4 });
  const sup5   = mk(15, 'radiant', 'sup5',   { kills: 2,  deaths: 9,  assists: 19, gpm: 280, xpm: 340, hero_damage: 6000,  hero_healing: 9000, obs_placed: 8,  sen_placed: 6, wards_killed: 3 });
  const dCarry = mk(21, 'dire',    'dcarry', { kills: 8,  deaths: 8,  assists: 5,  gpm: 600, xpm: 650, hero_damage: 30000, tower_damage: 2500 });
  const dMid   = mk(22, 'dire',    'dmid',   { kills: 7,  deaths: 9,  assists: 6,  gpm: 540, xpm: 600, hero_damage: 25000 });
  const dOff   = mk(23, 'dire',    'doff',   { kills: 5,  deaths: 10, assists: 7,  gpm: 420, xpm: 460, hero_damage: 18000 });
  const dSup4  = mk(24, 'dire',    'dsup4',  { kills: 2,  deaths: 11, assists: 9,  gpm: 250, xpm: 320, hero_damage: 7000,  obs_placed: 6, sen_placed: 4 });
  const dSup5  = mk(25, 'dire',    'dsup5',  { kills: 1,  deaths: 12, assists: 8,  gpm: 220, xpm: 290, hero_damage: 5000,  obs_placed: 7, sen_placed: 5 });

  const rows = [carry, mid, off, sup4, sup5, dCarry, dMid, dOff, dSup4, dSup5];

  const fakePool = {
    async query(sql) {
      const text = String(sql);
      if (text.includes('FROM nicknames')) return { rows: [] };
      if (text.includes('FROM matches m')) return { rows };
      throw new Error('unexpected query: ' + text.slice(0, 80));
    },
  };
  const result = await getMatchV3Modifiers('M1', fakePool);
  {
    assert.equal(result.hasStats, true, 'should detect non-trivial stats');
    assert.equal(result.modifiers.length, 10, 'should return one entry per player');
    // Modifiers must lie in [0.80, 1.20].
    for (const e of result.modifiers) {
      assert.ok(e.modifier >= 0.80 - 1e-9 && e.modifier <= 1.20 + 1e-9,
        `modifier ${e.modifier} for ${e.account_id} out of range`);
      assert.ok(e.components, 'each player should have a component breakdown');
      const sumParts = Object.values(e.components).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sumParts - e.score) < 1e-6,
        `components for ${e.account_id} should sum to score`);
    }
    // The carry should outscore dSup5 (worst game).
    const carryEntry  = result.modifiers.find(e => e.account_id === '11');
    const worstEntry  = result.modifiers.find(e => e.account_id === '25');
    assert.ok(carryEntry.modifier > worstEntry.modifier,
      'high-K/D/A winner should have higher modifier than low-K/D/A loser');
    // Win bonus must be present on radiant winners only.
    assert.equal(carryEntry.components.win, 25);
    assert.equal(worstEntry.components.win, 0);
  }
});

test('getMatchV3Modifiers: lobby-only match (no stats) defaults all modifiers to 1.0', async () => {
  const mk = _baseMatchRows('M2', false);
  const rows = [];
  for (let i = 0; i < 5; i++) rows.push(mk(100 + i, 'radiant', `r${i}`));
  for (let i = 0; i < 5; i++) rows.push(mk(200 + i, 'dire',    `d${i}`));

  const fakePool = {
    async query(sql) {
      const text = String(sql);
      if (text.includes('FROM nicknames')) return { rows: [] };
      if (text.includes('FROM matches m')) return { rows };
      throw new Error('unexpected query: ' + text.slice(0, 80));
    },
  };
  const result = await getMatchV3Modifiers('M2', fakePool);
  assert.equal(result.hasStats, false);
  assert.equal(result.modifiers.length, 10);
  for (const e of result.modifiers) {
    assert.equal(e.modifier, 1.0);
    assert.equal(e.has_stats, false);
    assert.equal(e.components, null);
  }
});

test('getMatchV3Modifiers: missing match returns empty modifier list', async () => {
  const fakePool = {
    async query(sql) {
      const text = String(sql);
      if (text.includes('FROM nicknames')) return { rows: [] };
      if (text.includes('FROM matches m')) return { rows: [] };
      throw new Error('unexpected query: ' + text.slice(0, 80));
    },
  };
  const result = await getMatchV3Modifiers('does-not-exist', fakePool);
  assert.deepEqual(result, { modifiers: [], hasStats: false, radiantWin: null });
});

test('getPlayerV3ModifierHistory: returns chronologically-ordered modifiers for matches the player participated in', async () => {
  const mk1 = _baseMatchRows('M1', true);
  // M2: radiant_win=true; target plays on dire → target loses.
  const mk2 = _baseMatchRows('M2', true);
  // Override dates so M2 sorts before M1 in raw order but we still expect
  // chronological ASC ordering in the output.
  const overrideDate = (rows, iso) => rows.map(r => ({ ...r, date: new Date(iso) }));
  const target = 11;
  const m1Rows = overrideDate([
    mk1(target, 'radiant', 'me',     { kills: 15, deaths: 1, assists: 10, gpm: 800, xpm: 850, hero_damage: 45000 }),
    mk1(12,     'radiant', 'mate1',  { kills: 5,  deaths: 5, assists: 8,  gpm: 500, xpm: 550, hero_damage: 18000 }),
    mk1(13,     'radiant', 'mate2',  { kills: 3,  deaths: 6, assists: 10, gpm: 400, xpm: 450, hero_damage: 12000 }),
    mk1(14,     'radiant', 'mate3',  { kills: 2,  deaths: 7, assists: 12, gpm: 350, xpm: 400, hero_damage: 9000  }),
    mk1(15,     'radiant', 'mate4',  { kills: 1,  deaths: 8, assists: 14, gpm: 300, xpm: 350, hero_damage: 7000  }),
    mk1(21,     'dire',    'enemy1', { kills: 6,  deaths: 8, assists: 4,  gpm: 550, xpm: 600, hero_damage: 22000 }),
    mk1(22,     'dire',    'enemy2', { kills: 4,  deaths: 9, assists: 5,  gpm: 480, xpm: 530, hero_damage: 16000 }),
    mk1(23,     'dire',    'enemy3', { kills: 3,  deaths: 10,assists: 6,  gpm: 400, xpm: 440, hero_damage: 12000 }),
    mk1(24,     'dire',    'enemy4', { kills: 2,  deaths: 11,assists: 7,  gpm: 320, xpm: 380, hero_damage: 8000  }),
    mk1(25,     'dire',    'enemy5', { kills: 1,  deaths: 12,assists: 8,  gpm: 260, xpm: 320, hero_damage: 6000  }),
  ], '2025-02-01T00:00:00Z');
  const m2Rows = overrideDate([
    mk2(target, 'dire',    'me',     { kills: 1,  deaths: 12,assists: 2,  gpm: 230, xpm: 280, hero_damage: 4000  }),
    mk2(31,     'radiant', 'a',      { kills: 8,  deaths: 4, assists: 10, gpm: 600, xpm: 650, hero_damage: 22000 }),
    mk2(32,     'radiant', 'b',      { kills: 7,  deaths: 5, assists: 11, gpm: 550, xpm: 600, hero_damage: 20000 }),
    mk2(33,     'radiant', 'c',      { kills: 6,  deaths: 6, assists: 12, gpm: 500, xpm: 550, hero_damage: 18000 }),
    mk2(34,     'radiant', 'd',      { kills: 5,  deaths: 7, assists: 13, gpm: 450, xpm: 500, hero_damage: 15000 }),
    mk2(35,     'radiant', 'e',      { kills: 4,  deaths: 8, assists: 14, gpm: 400, xpm: 450, hero_damage: 12000 }),
    mk2(41,     'dire',    'f',      { kills: 5,  deaths: 7, assists: 8,  gpm: 480, xpm: 520, hero_damage: 16000 }),
    mk2(42,     'dire',    'g',      { kills: 4,  deaths: 8, assists: 7,  gpm: 420, xpm: 470, hero_damage: 13000 }),
    mk2(43,     'dire',    'h',      { kills: 3,  deaths: 9, assists: 6,  gpm: 360, xpm: 420, hero_damage: 10000 }),
    mk2(44,     'dire',    'i',      { kills: 2,  deaths: 10,assists: 5,  gpm: 300, xpm: 360, hero_damage: 8000  }),
  ], '2025-01-15T00:00:00Z');

  const fakePool = {
    async query(sql, params) {
      const text = String(sql);
      if (text.includes('FROM nicknames')) return { rows: [] };
      if (text.includes('SELECT DISTINCT match_id')) {
        return { rows: [{ match_id: 'M1' }, { match_id: 'M2' }] };
      }
      if (text.includes('FROM matches m')) {
        // Return both matches' rows.
        return { rows: [...m1Rows, ...m2Rows] };
      }
      throw new Error('unexpected query: ' + text.slice(0, 80));
    },
  };

  const history = await getPlayerV3ModifierHistory(target, fakePool);
  assert.equal(history.length, 2, 'should have one entry per played match');
  // Must be sorted chronologically ascending.
  assert.ok(new Date(history[0].date) <= new Date(history[1].date),
    'history must be sorted by date ascending');
  // M2 (2025-01-15) is earlier — bad game, lost — modifier should be < 1.
  // M1 (2025-02-01) is later — strong winning game — modifier should be > 1.
  const earlier = history[0];
  const later   = history[1];
  assert.equal(earlier.match_id, 'M2');
  assert.equal(later.match_id,   'M1');
  assert.equal(earlier.won, false);
  assert.equal(later.won,   true);
  assert.ok(later.modifier > earlier.modifier,
    `dominant winning game (${later.modifier}) should have a higher modifier than blowout loss (${earlier.modifier})`);
  for (const h of history) {
    assert.ok(h.modifier >= 0.80 - 1e-9 && h.modifier <= 1.20 + 1e-9,
      `modifier ${h.modifier} out of clamp range`);
  }
});

test('getPlayerV3ModifierHistory: includes lobby-only matches as a 1.00× modifier', async () => {
  const mk = _baseMatchRows('LOBBY', true);
  const target = 99;
  // All-zero stats → lobby-only / no-stats match. V3 still applies a 1.00×
  // modifier (no penalty), so profile history should reflect that match.
  const rows = [
    mk(target, 'radiant', 'me'),
    mk(2, 'radiant', 'a'), mk(3, 'radiant', 'b'), mk(4, 'radiant', 'c'), mk(5, 'radiant', 'd'),
    mk(6, 'dire',    'e'), mk(7, 'dire',    'f'), mk(8, 'dire',    'g'), mk(9, 'dire',    'h'), mk(10, 'dire', 'i'),
  ];
  const fakePool = {
    async query(sql) {
      const text = String(sql);
      if (text.includes('FROM nicknames')) return { rows: [] };
      if (text.includes('SELECT DISTINCT match_id')) return { rows: [{ match_id: 'LOBBY' }] };
      if (text.includes('FROM matches m')) return { rows };
      throw new Error('unexpected query: ' + text.slice(0, 80));
    },
  };
  const history = await getPlayerV3ModifierHistory(target, fakePool);
  assert.equal(history.length, 1, 'lobby-only matches must still appear in modifier history');
  assert.equal(history[0].match_id, 'LOBBY');
  assert.equal(history[0].modifier, 1.0,
    'lobby-only matches must surface as a 1.00× modifier (no penalty)');
  assert.equal(history[0].score, 0);
  assert.equal(history[0].won, true,
    'target on radiant in a radiant_win=true match must be marked as a win');
  assert.equal(history[0].has_stats, false,
    'lobby-only entries must be flagged so the UI can annotate them');
});
