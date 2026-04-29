const test = require('node:test');
const assert = require('node:assert/strict');

const { getStatsService } = require('../src/stats/statsService');
const {
  computeSeasonTrueSkillV3,
  _v3PerfScore,
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
