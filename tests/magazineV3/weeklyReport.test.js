'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const wr = require('../../src/monetization/magazineV3/weeklyReport');
const { makePool } = require('./_helpers');

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
test('weeklyReport.validateWeeklyReportJson: rejects non-objects', () => {
  for (const bad of [null, undefined, 'x', 5, []]) {
    assert.equal(wr.validateWeeklyReportJson(bad).ok, false);
  }
});

test('weeklyReport.validateWeeklyReportJson: rejects short summary', () => {
  const v = wr.validateWeeklyReportJson({
    summary: 'x', insights: ['ok ok ok'], top_heroes: [], deltas: {},
  });
  assert.equal(v.ok, false);
  assert.equal(v.error, 'summary-too-short');
});

test('weeklyReport.validateWeeklyReportJson: rejects insights with too-short strings', () => {
  const v = wr.validateWeeklyReportJson({
    summary: 'long enough text', insights: ['hi'], top_heroes: [], deltas: {},
  });
  assert.equal(v.ok, false);
  assert.equal(v.error, 'insights-bad-strings');
});

test('weeklyReport.validateWeeklyReportJson: rejects non-array top_heroes', () => {
  const v = wr.validateWeeklyReportJson({
    summary: 'long enough text', insights: ['real insight'],
    top_heroes: 'nope', deltas: {},
  });
  assert.equal(v.ok, false);
  assert.equal(v.error, 'top_heroes-not-array');
});

test('weeklyReport.validateWeeklyReportJson: rejects null deltas', () => {
  const v = wr.validateWeeklyReportJson({
    summary: 'long enough text', insights: ['real insight'],
    top_heroes: [], deltas: null,
  });
  assert.equal(v.ok, false);
  assert.equal(v.error, 'deltas-not-object');
});

test('weeklyReport._safeParseJsonObject: handles markdown fences and prose wrap', () => {
  assert.deepEqual(wr._safeParseJsonObject('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(wr._safeParseJsonObject('Sure! {"a":1} here you go.'), { a: 1 });
});

test('weeklyReport._safeParseJsonObject: returns null for junk', () => {
  assert.equal(wr._safeParseJsonObject(null), null);
  assert.equal(wr._safeParseJsonObject(''), null);
  assert.equal(wr._safeParseJsonObject('no braces here'), null);
  assert.equal(wr._safeParseJsonObject('{not json}'), null);
});

test('weeklyReport._renderWeeklyMd: renders summary, insights, and top heroes', () => {
  const md = wr._renderWeeklyMd({
    summary: 'You played a lot.',
    insights: ['hit more last hits'],
    top_heroes: [{ hero_id: 1, games: 3, winrate: 0.667 }],
    deltas: {},
  });
  assert.match(md, /### Weekly Report/);
  assert.match(md, /You played a lot/);
  assert.match(md, /- hit more last hits/);
  assert.match(md, /Hero 1: 3 games, 67% WR/);
});

test('weeklyReport._renderWeeklyMd: omits top heroes section when empty', () => {
  const md = wr._renderWeeklyMd({
    summary: 'short and sweet', insights: ['x'], top_heroes: [], deltas: {},
  });
  assert.doesNotMatch(md, /\*\*Top heroes\*\*/);
});

test('weeklyReport._renderWeeklyDeterministic: 0 matches -> 0% WR, 0.00 PERF', () => {
  assert.match(wr._renderWeeklyDeterministic({ matches: [] }), /0 matches/);
  assert.match(wr._renderWeeklyDeterministic({ matches: [] }), /0% WR/);
  assert.match(wr._renderWeeklyDeterministic({ matches: [] }), /PERF \*\*0\.00\*\*/);
});

test('weeklyReport._renderWeeklyDeterministic: rolls up wins and avg perf', () => {
  const md = wr._renderWeeklyDeterministic({
    matches: [
      { win: true, perf: 7 },
      { win: false, perf: 3 },
      { win: true, perf: 5 },
    ],
  });
  assert.match(md, /3 matches/);
  assert.match(md, /67% WR/);
  assert.match(md, /PERF \*\*5\.00\*\*/);
});

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------
test('weeklyReport._weekStart: returns ISO date of Monday for any weekday', () => {
  const { _weekStart } = wr.createDb({ getPool: () => makePool([]) });
  // 2024-03-13 is a Wednesday.
  assert.equal(_weekStart(new Date(Date.UTC(2024, 2, 13))), '2024-03-11');
  // 2024-03-11 is the Monday — should return itself.
  assert.equal(_weekStart(new Date(Date.UTC(2024, 2, 11))), '2024-03-11');
  // 2024-03-17 is a Sunday — Monday is the 11th.
  assert.equal(_weekStart(new Date(Date.UTC(2024, 2, 17))), '2024-03-11');
});

test('weeklyReport.getCachedWeeklyReport: short-circuits without accountId', async () => {
  const pool = makePool([], { strict: true });
  const { getCachedWeeklyReport } = wr.createDb({ getPool: () => pool });
  assert.equal(await getCachedWeeklyReport(0), null);
  assert.equal(pool.calls.length, 0);
});

test('weeklyReport.getCachedWeeklyReport: returns row when present, null otherwise', async () => {
  const row = { content_md: 'cached', stats: {} };
  const present = wr.createDb({ getPool: () => makePool([
    { match: 'FROM weekly_ai_reports', respond: () => [row] },
  ]) });
  const empty = wr.createDb({ getPool: () => makePool([
    { match: 'FROM weekly_ai_reports', respond: () => [] },
  ]) });
  assert.equal(await present.getCachedWeeklyReport(1), row);
  assert.equal(await empty.getCachedWeeklyReport(1), null);
});

test('weeklyReport.saveWeeklyReport: stringifies stats, passes null for missing stats', async () => {
  const captures = [];
  const db = wr.createDb({ getPool: () => makePool([
    { match: 'INSERT INTO weekly_ai_reports',
      respond: (p) => { captures.push(p); return [{ id: 1 }]; } },
  ]) });
  await db.saveWeeklyReport(1, '2024-03-11', 'md', { foo: 1 });
  assert.equal(captures[0][3], JSON.stringify({ foo: 1 }));
  await db.saveWeeklyReport(1, '2024-03-11', 'md', null);
  assert.equal(captures[1][3], null);
});

test('weeklyReport.getWeeklyReportSourceData: rolls wins, win_rate, avgs from rows', async () => {
  // Three games: radiant winner on team 0 (win), team 1 on radiant_win (loss), team 0 again (loss)
  const games = [
    { match_id: 'a', date: new Date(), duration: 1800, radiant_win: true,
      team: 0, hero_id: 1, kills: 10, deaths: 2, assists: 4,
      gpm: 600, xpm: 700, hero_damage: 20000, hero_healing: 0,
      tower_damage: 1000, last_hits: 250, position: 1, perf: 7 },
    { match_id: 'b', date: new Date(), duration: 1800, radiant_win: true,
      team: 1, hero_id: 2, kills: 2, deaths: 8, assists: 3,
      gpm: 300, xpm: 400, hero_damage: 5000, hero_healing: 0,
      tower_damage: 100, last_hits: 80, position: 5, perf: 3 },
    { match_id: 'c', date: new Date(), duration: 1800, radiant_win: false,
      team: 0, hero_id: 3, kills: 4, deaths: 6, assists: 7,
      gpm: 400, xpm: 500, hero_damage: 12000, hero_healing: 0,
      tower_damage: 500, last_hits: 150, position: 3, perf: 5 },
  ];
  const db = wr.createDb({ getPool: () => makePool([
    { match: 'FROM player_stats ps', respond: () => games },
  ]) });
  const out = await db.getWeeklyReportSourceData(7);
  assert.equal(out.games_count, 3);
  assert.equal(out.wins, 1, 'only the team=0 + radiant_win game counts');
  assert.equal(out.losses, 2);
  assert.equal(out.win_rate, 33.3);
  assert.equal(out.avg_kills, 5.3);
  assert.equal(out.avg_perf, 5);
  assert.equal(out.matches.length, 3);
  assert.deepEqual(out.matches[0].kda, { k: 10, d: 2, a: 4 });
  assert.equal(out.best_match.match_id, 'a', 'highest perf wins best_match');
});

test('weeklyReport.getWeeklyReportSourceData: empty -> null avg_perf and zeros', async () => {
  const db = wr.createDb({ getPool: () => makePool([
    { match: 'FROM player_stats ps', respond: () => [] },
  ]) });
  const out = await db.getWeeklyReportSourceData(1);
  assert.equal(out.games_count, 0);
  assert.equal(out.win_rate, 0);
  assert.equal(out.avg_perf, null);
  assert.deepEqual(out.matches, []);
  assert.equal(out.best_match, null);
});

test('weeklyReport.setUserEmail: rejects malformed addresses', async () => {
  const db = wr.createDb({ getPool: () => makePool([], { strict: true }) });
  for (const bad of ['', 'no-at-sign', 'a@b', 'a b@c.d', 'a@b.', 'x'.repeat(255) + '@y.z']) {
    await assert.rejects(() => db.setUserEmail(1, bad), /Bad email/);
  }
  await assert.rejects(() => db.setUserEmail(1, 12345), /Bad email/);
});

test('weeklyReport.setUserEmail: stores lowercased email', async () => {
  let captured;
  const db = wr.createDb({ getPool: () => makePool([
    { match: 'INSERT INTO magv3_user_emails',
      respond: (p) => { captured = p; return [{ email: p[1] }]; } },
  ]) });
  const r = await db.setUserEmail(7, 'Hello@Example.COM');
  assert.equal(r.email, 'hello@example.com');
  assert.deepEqual(captured, [7, 'hello@example.com']);
});

test('weeklyReport.getUserEmail: returns null when missing, value otherwise', async () => {
  const present = wr.createDb({ getPool: () => makePool([
    { match: 'FROM magv3_user_emails', respond: () => [{ email: 'a@b.c' }] },
  ]) });
  const empty = wr.createDb({ getPool: () => makePool([
    { match: 'FROM magv3_user_emails', respond: () => [] },
  ]) });
  assert.equal(await present.getUserEmail(1), 'a@b.c');
  assert.equal(await empty.getUserEmail(1), null);
});
