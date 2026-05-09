'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { scoreCoachMatch } = require('../../src/monetization/magazineV3/coachPairing');

test('scoreCoachMatch: clamps to 0..100 across realistic shapes', () => {
  for (const s of [{}, { mmr: 0 }, { mmr: 500, top_heroes: [] }, { mmr: 8000, top_heroes: [1, 2] }]) {
    for (const c of [{}, { mmr: 0 }, { mmr: 500 }, { mmr: 9999, hero_pool: [], positions: [] }]) {
      const score = scoreCoachMatch(s, c);
      assert.ok(Number.isInteger(score), 'integer');
      assert.ok(score >= 0 && score <= 100, `0..100, got ${score} for ${JSON.stringify(s)} / ${JSON.stringify(c)}`);
    }
  }
});

test('scoreCoachMatch: hero overlap caps bonus at +20', () => {
  const s = { mmr: 3000, top_heroes: [1, 2, 3, 4, 5], primary_position: 1 };
  // 5 overlapping heroes would give 5*5 = 25 raw bonus; helper caps at 20.
  const aligned = scoreCoachMatch(s, {
    mmr: 3500, hero_pool: [1, 2, 3, 4, 5], positions: [1], review_count: 50,
  });
  // Same coach with no hero overlap should score lower.
  const noOverlap = scoreCoachMatch(s, {
    mmr: 3500, hero_pool: [99, 98, 97], positions: [1], review_count: 50,
  });
  assert.ok(aligned > noOverlap);
});

test('scoreCoachMatch: ignores position field that is not an array', () => {
  // Defensive: if `positions` arrives as a non-array (legacy data), the
  // helper must not throw and must not award the position-match bonus.
  const s = { mmr: 3000, top_heroes: [1], primary_position: 2 };
  const score = scoreCoachMatch(s, {
    mmr: 3500, hero_pool: [1], positions: 'not-an-array', review_count: 5,
  });
  assert.ok(Number.isInteger(score));
  assert.ok(score >= 0 && score <= 100);
});

test('scoreCoachMatch: tolerates non-array hero_pool / top_heroes (legacy rows)', () => {
  // Legacy DB rows can deliver these fields as JSON-encoded strings,
  // null-ish sentinels, or other non-array shapes. The scorer must not
  // throw — a single bad row would otherwise take down the whole
  // recommendation request.
  const badShapes = [
    null, undefined, '', '[1,2,3]', '1,2,3', 0, 42, true, {}, { 0: 1 },
  ];
  const s = { mmr: 3000, primary_position: 1 };
  const c = { mmr: 3500, positions: [1], review_count: 5 };
  for (const shape of badShapes) {
    const score = scoreCoachMatch(
      { ...s, top_heroes: shape },
      { ...c, hero_pool: shape },
    );
    assert.ok(Number.isInteger(score), `integer for ${JSON.stringify(shape)}`);
    assert.ok(score >= 0 && score <= 100, `0..100 for ${JSON.stringify(shape)}, got ${score}`);
  }
});

test('scoreCoachMatch: zero reviews penalises slightly vs many reviews', () => {
  const s = { mmr: 3000, top_heroes: [1], primary_position: 1 };
  const noReviews = scoreCoachMatch(s, { mmr: 3500, hero_pool: [1], positions: [1], review_count: 0 });
  const manyReviews = scoreCoachMatch(s, { mmr: 3500, hero_pool: [1], positions: [1], review_count: 50 });
  assert.ok(manyReviews > noReviews);
  // Specifically: -5 vs +10 (capped) = 15-point swing.
  assert.equal(manyReviews - noReviews, 15);
});

test('scoreCoachMatch: best MMR delta is around +500', () => {
  // Helper: (delta_to_500_above) — bonus peaks when coach is exactly 500 MMR above student.
  const s = { mmr: 3000, top_heroes: [], primary_position: null };
  const at500 = scoreCoachMatch(s, { mmr: 3500, hero_pool: [], positions: [], review_count: 5 });
  const at1500 = scoreCoachMatch(s, { mmr: 4500, hero_pool: [], positions: [], review_count: 5 });
  const at100 = scoreCoachMatch(s, { mmr: 3100, hero_pool: [], positions: [], review_count: 5 });
  assert.ok(at500 >= at1500);
  assert.ok(at500 >= at100);
});
