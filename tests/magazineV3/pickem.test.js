'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDb } = require('../../src/monetization/magazineV3/pickem');
const { makePool } = require('./_helpers');

function makeDb(handlers, { hasPerk = false } = {}) {
  const pool = makePool(handlers, { strict: true });
  const db = createDb({ getPool: () => pool, hasOneOffPerk: async () => hasPerk });
  return { db, pool };
}

test('pickem.getActivePickemSeason: returns first row or null', async () => {
  const { db: a } = makeDb([{ match: 'FROM pickem_seasons', respond: () => [{ id: 7 }] }]);
  assert.deepEqual(await a.getActivePickemSeason(), { id: 7 });
  const { db: b } = makeDb([{ match: 'FROM pickem_seasons', respond: () => [] }]);
  assert.equal(await b.getActivePickemSeason(), null);
});

test('pickem.ensureDefaultPickemSeason: skips insert when a season already exists', async () => {
  const { db, pool } = makeDb([
    { match: 'SELECT 1 FROM pickem_seasons', respond: () => [{ '?column?': 1 }] },
  ]);
  await db.ensureDefaultPickemSeason();
  assert.equal(pool.calls.length, 1, 'must not issue INSERT when season exists');
});

test('pickem.ensureDefaultPickemSeason: inserts a year-slug season when empty', async () => {
  const { db, pool } = makeDb([
    { match: 'SELECT 1 FROM pickem_seasons', respond: () => [] },
    { match: 'INSERT INTO pickem_seasons', respond: () => [] },
  ]);
  await db.ensureDefaultPickemSeason();
  const insert = pool.calls.find(c => c.sql.startsWith('INSERT'));
  assert.ok(insert);
  // [slug, label, start, end, ...]
  const year = new Date().getUTCFullYear();
  assert.equal(insert.params[0], `pickem-${year}`);
  assert.equal(insert.params[1], `Inhouse Pickem ${year}`);
  // 90-day window
  const span = insert.params[3] - insert.params[2];
  assert.equal(span, 90 * 24 * 60 * 60 * 1000);
});

test('pickem.submitPickemPick: forwards all 7 params and stringifies matchRef', async () => {
  const { db, pool } = makeDb([
    { match: 'INSERT INTO pickem_picks', respond: (p) => [{ ok: true, params: p }] },
  ]);
  const out = await db.submitPickemPick({
    seasonId: 1, accountId: 2, matchRef: 333, pickedWinner: 'radiant',
    pickedFirstBlood: 'dire', pickedTotalKillsBucket: 'over', pickedDurationTier: 'medium',
  });
  assert.ok(out.ok);
  const insert = pool.calls.find(c => c.sql.startsWith('INSERT'));
  // Prop bets v2 appended firstTower / mvpTeam / comeback / firstRosh (null when omitted).
  assert.deepEqual(insert.params, [1, 2, '333', 'radiant', 'dire', 'over', 'medium', null, null, null, null]);
});

test('pickem.submitPickemPick: defaults side bets to null when not provided', async () => {
  const { db, pool } = makeDb([
    { match: 'INSERT INTO pickem_picks', respond: () => [{ id: 1 }] },
  ]);
  await db.submitPickemPick({ seasonId: 1, accountId: 2, matchRef: 'm', pickedWinner: 'dire' });
  const insert = pool.calls.find(c => c.sql.startsWith('INSERT'));
  // 3 original side bets + 4 prop-bets-v2 dims, all null when not provided.
  assert.deepEqual(insert.params.slice(4), [null, null, null, null, null, null, null]);
});

test('pickem.resolvePickemMatch: passes the 8 documented params in order', async () => {
  const { db, pool } = makeDb([
    { match: 'UPDATE pickem_picks', respond: () => [{ account_id: 1 }] },
  ]);
  await db.resolvePickemMatch({
    seasonId: 9, matchRef: 42, actualWinner: 'radiant',
    points: 10, sidePoints: 5,
    actualFirstBlood: 'radiant', actualTotalKillsBucket: 'under', actualDurationTier: 'long',
  });
  const upd = pool.calls.find(c => c.sql.startsWith('UPDATE'));
  // Prop bets v2 appended actualFirstTower / actualMvpTeam / actualComeback / actualFirstRosh.
  assert.deepEqual(upd.params, [9, '42', 'radiant', 10, 5, 'radiant', 'under', 'long', null, null, null, null]);
});

test('pickem.autoResolvePickemForMatch: returns [] when no active season', async () => {
  const { db } = makeDb([
    { match: 'FROM pickem_seasons', respond: () => [] },
  ]);
  assert.deepEqual(await db.autoResolvePickemForMatch('m1', true), []);
});

test('pickem.autoResolvePickemForMatch: buckets totalKills at 50 (under boundary -> "over")', async () => {
  let captured;
  const { db } = makeDb([
    { match: 'FROM pickem_seasons', respond: () => [{ id: 1 }] },
    { match: 'UPDATE pickem_picks', respond: (p) => { captured = p; return []; } },
  ]);
  await db.autoResolvePickemForMatch('m1', true, { totalKills: 50 });
  // p[6] = actualTotalKillsBucket
  assert.equal(captured[6], 'over', '50 must map to "over" (>=50 boundary)');
});

test('pickem.autoResolvePickemForMatch: buckets totalKills under 50 as "under"', async () => {
  let captured;
  const { db } = makeDb([
    { match: 'FROM pickem_seasons', respond: () => [{ id: 1 }] },
    { match: 'UPDATE pickem_picks', respond: (p) => { captured = p; return []; } },
  ]);
  await db.autoResolvePickemForMatch('m1', false, { totalKills: 49 });
  assert.equal(captured[6], 'under');
  assert.equal(captured[2], 'dire', 'radiantWin=false -> dire');
});

test('pickem.autoResolvePickemForMatch: tiers duration <30/30-45/>45 minutes', async () => {
  async function dur(seconds) {
    let captured;
    const { db } = makeDb([
      { match: 'FROM pickem_seasons', respond: () => [{ id: 1 }] },
      { match: 'UPDATE pickem_picks', respond: (p) => { captured = p; return []; } },
    ]);
    await db.autoResolvePickemForMatch('m1', true, { durationSeconds: seconds });
    return captured[7]; // actualDurationTier
  }
  assert.equal(await dur(1799), 'short');
  assert.equal(await dur(1800), 'medium', '1800 (30:00) is medium');
  assert.equal(await dur(2700), 'medium', '2700 (45:00) is still medium');
  assert.equal(await dur(2701), 'long');
});

test('pickem.autoResolvePickemForMatch: ignores invalid firstBloodTeam', async () => {
  let captured;
  const { db } = makeDb([
    { match: 'FROM pickem_seasons', respond: () => [{ id: 1 }] },
    { match: 'UPDATE pickem_picks', respond: (p) => { captured = p; return []; } },
  ]);
  await db.autoResolvePickemForMatch('m1', true, { firstBloodTeam: 'mars' });
  assert.equal(captured[5], null);
});

test('pickem.autoResolvePickemForMatch: swallows underlying errors and returns []', async () => {
  // Throwing season fetch shouldn't bubble up — best-effort by design.
  const pool = makePool([
    { match: 'FROM pickem_seasons', respond: () => { throw new Error('db down'); } },
  ], { strict: false });
  const db = createDb({ getPool: () => pool, hasOneOffPerk: async () => false });
  assert.deepEqual(await db.autoResolvePickemForMatch('m1', true), []);
});

test('pickem.awardPickemSeasonChampion: returns null when leaderboard empty', async () => {
  const { db } = makeDb([
    { match: 'FROM pickem_picks', respond: () => [] },
  ]);
  assert.equal(await db.awardPickemSeasonChampion(42), null);
});

test('pickem.awardPickemSeasonChampion: returns null when champion has 0 points', async () => {
  const { db } = makeDb([
    { match: 'FROM pickem_picks', respond: () => [{ account_id: 1, points: 0 }] },
  ]);
  assert.equal(await db.awardPickemSeasonChampion(42), null);
});

test('pickem.awardPickemSeasonChampion: skips insert when perk already granted', async () => {
  const { db, pool } = makeDb([
    { match: 'FROM pickem_picks', respond: () => [{ account_id: 1, points: 100 }] },
  ], { hasPerk: true });
  assert.equal(await db.awardPickemSeasonChampion(42), null);
  // Only the leaderboard read — no INSERT.
  assert.ok(!pool.calls.find(c => c.sql.startsWith('INSERT')));
});

test('pickem.awardPickemSeasonChampion: writes correct perk_key + metadata', async () => {
  let captured;
  const { db } = makeDb([
    { match: 'FROM pickem_picks', respond: () => [{ account_id: 7, points: 50 }] },
    { match: 'INSERT INTO user_one_off_perks',
      respond: (p) => { captured = p; return [{ id: 1, account_id: p[0], perk_key: p[1] }]; } },
  ]);
  const row = await db.awardPickemSeasonChampion(42);
  assert.deepEqual(captured.slice(0, 2), [7, 'cosmetic:pickem_champion_frame:S42']);
  assert.deepEqual(JSON.parse(captured[2]), { season_id: 42, points: 50 });
  assert.equal(row.perk_key, 'cosmetic:pickem_champion_frame:S42');
});

test('pickem.getPickemLeaderboard: passes seasonId + limit', async () => {
  const { db, pool } = makeDb([
    { match: 'FROM pickem_picks', respond: () => [{ account_id: 1, points: 10 }] },
  ]);
  await db.getPickemLeaderboard(99, 25);
  const q = pool.calls[0];
  assert.deepEqual(q.params, [99, 25]);
});

test('pickem.getMyPickemPicks: filters by season + account', async () => {
  const { db, pool } = makeDb([
    { match: 'FROM pickem_picks', respond: () => [{ match_ref: 'm' }] },
  ]);
  const rows = await db.getMyPickemPicks(1, 2);
  assert.equal(rows.length, 1);
  assert.deepEqual(pool.calls[0].params, [1, 2]);
});
