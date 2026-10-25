const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRosterSummaryLoader, enrichRoster } = require('../src/inhouse/rosterSummary');

test('roster shares displayed leaderboard ratings and canonical account rank without altering draft identity', async () => {
  const load = createRosterSummaryLoader(async () => [
    { player_id: '1', nickname: 'Captain', mmr: 6800, wins: 20, losses: 5, dota_rank_tier: 74, privateValue: 'not public' },
  ]);
  const player = { account_id: '2', nickname: 'CAPTAIN', trueskill_mmr: 10, founder_ring: 'phoenix', profile_frame: 'gold' };
  enrichRoster([player], await load());
  assert.equal(player.account_id, '2');
  assert.equal(player.nickname, 'CAPTAIN');
  assert.equal(player.inhouse_mmr, 6800);
  assert.equal(player.leaderboard_rank, 1);
  assert.equal(player.trueskill_mmr, 10);
  assert.equal(player.founder_ring, 'phoenix');
  assert.equal(player.profile_frame, 'gold');
  assert.equal(player.privateValue, undefined);
  assert.equal(player.wins, 20);
});

test('concurrent polls and TTL reuse one leaderboard load, then refresh', async () => {
  let clock = 0;
  let calls = 0;
  const load = createRosterSummaryLoader(async () => {
    calls++;
    return [{ player_id: '1', mmr: calls * 100 }];
  }, { now: () => clock, ttl: 30000 });
  const [one, two] = await Promise.all([load(), load()]);
  assert.equal(calls, 1);
  assert.deepEqual(one, two);
  clock = 29999;
  await load();
  assert.equal(calls, 1);
  clock = 30000;
  assert.equal((await load())[0].inhouse_mmr, 200);
});

test('failed summary loads do not invent ranks or fan out retries', async () => {
  let clock = 0;
  let calls = 0;
  const load = createRosterSummaryLoader(async () => {
    if (++calls === 1) throw new Error('offline');
    return [];
  }, { now: () => clock });
  await assert.rejects(load(), /offline/);
  assert.equal(await load(), null);
  assert.equal(calls, 1);
  const player = { account_id: '1', trueskill_mmr: 10 };
  enrichRoster([player], null);
  assert.equal(player.inhouse_mmr, undefined);
  clock = 5000;
  assert.deepEqual(await load(), []);
  assert.equal(calls, 2);
});

test('session roster query batches only equipped public cosmetics and preserves roster ordering', async () => {
  const source = fs.readFileSync(require.resolve('../src/db'), 'utf8');
  const start = source.indexOf('async function getInhouseSessionPlayers(');
  const end = source.indexOf('\n}', start);
  let query;
  const read = vm.runInNewContext(`(${source.slice(start, end + 2)})`, {
    getPool: () => ({ query: async (sql, params) => { query = { sql, params }; return { rows: [] }; } }),
  });
  await read(10);
  assert.deepEqual(Array.from(query.params), [10]);
  assert.match(query.sql, /pp\.profile_frame/);
  assert.match(query.sql, /pp\.equipped_founder_ring AS founder_ring/);
  assert.match(query.sql, /LEFT JOIN player_profiles pp ON pp.account_id = isp.account_id/);
  assert.match(query.sql, /ORDER BY isp.registered_at ASC/);
});

test('automation controls remain admin-only on screen and behind live server authorization', () => {
  const ui = fs.readFileSync('web/src/pages/Inhouse.jsx', 'utf8');
  const server = fs.readFileSync('src/web/server.js', 'utf8');
  assert.match(ui, /<LobbyAutomationControl\s+editable=\{isAdmin \|\| hasAdminRole\}\s+visible=\{isAdmin \|\| hasAdminRole\}/);
  assert.match(server, /router\.put\('\/admin\/inhouse\/automation', requireAdmin,/);
  assert.match(server, /const requireAdmin = requireTier\('admin'\)/);
});
