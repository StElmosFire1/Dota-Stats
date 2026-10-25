const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { getPlayerScouting } = require('../src/inhouse/playerScouting');

test('scouting ranks proven heroes, distinguishes comfort picks, and bounds recent samples', async () => {
  const queries = [];
  const matches = Array.from({ length: 20 }, (_, i) => ({
    match_id: i + 1, hero_id: 5, position: i < 15 ? 2 : 4,
    kills: 10, deaths: 2, assists: 12, won: i % 2 === 0,
  }));
  const result = await getPlayerScouting('42', {
    getMergedAccountIds: async id => { assert.equal(id, '42'); return ['42', '43']; },
    getPool: () => ({
      query: async (sql, params) => {
        queries.push({ sql, params });
        if (sql.includes('COUNT(*)::int AS games')) return { rows: [
          { hero_id: 5, games: 20, wins: 10 },
          { hero_id: 1, games: 5, wins: 4 },
          { hero_id: 2, games: 1, wins: 1 },
          { hero_id: 3, games: 3, wins: 2 },
        ] };
        if (sql.includes('LIMIT 20')) return { rows: matches };
        return { rows: [{ custom_title: 'The Captain', pinned_hero_id: 5, pinned_hero_caption: 'My favourite', private_field: 'not public' }] };
      },
    }),
  });
  assert.deepEqual(result.bestHeroes.map(h => h.hero_id), [1, 3, 5]);
  assert.equal(result.comfortHeroes[0].hero_id, 5);
  assert.equal(result.preferredHero, 5);
  assert.equal(result.customTitle, 'The Captain');
  assert.equal(result.private_field, undefined);
  assert.equal(result.recentMatches.length, 5);
  assert.equal(result.recentSample, 20);
  assert.deepEqual(result.recentRoles, [{ position: 2, games: 15 }, { position: 4, games: 5 }]);
  for (const q of queries.slice(0, 2)) {
    assert.deepEqual(q.params, [['42', '43']]);
    assert.match(q.sql, /ps.account_id = ANY\(\$1::bigint\[\]\)/);
    assert.match(q.sql, /DISTINCT ON \(ps.match_id\)/);
  }
});

test('new players have explicit empty scouting data, not fabricated heroes or roles', async () => {
  const result = await getPlayerScouting('42', {
    getMergedAccountIds: async () => ['42'],
    getPool: () => ({ query: async () => ({ rows: [] }) }),
  });
  assert.deepEqual(result.bestHeroes, []);
  assert.deepEqual(result.comfortHeroes, []);
  assert.deepEqual(result.recentMatches, []);
  assert.deepEqual(result.recentRoles, []);
  assert.equal(result.preferredHero, null);
});

function handlerFixture({ hidden = false, hiddenError = false } = {}) {
  const source = fs.readFileSync('src/web/server.js', 'utf8');
  const start = source.indexOf("router.get('/inhouse/players/:accountId/scouting',");
  const body = source.indexOf('async (req, res) => {', start);
  const end = source.indexOf('\n  });', body);
  let loaded = false;
  const handler = vm.runInNewContext(`(${source.slice(body, end)}\n})`, {
    db: { isAccountHidden: async () => { if (hiddenError) throw Error('offline'); return hidden; } },
    require: () => ({ getPlayerScouting: async () => { loaded = true; return { bestHeroes: [] }; } }),
    console: { warn() {} },
  });
  return async accountId => {
    let status = 200, data;
    const res = { status(v) { status = v; return this; }, set() { return this; }, json(v) { data = v; return this; } };
    await handler({ params: { accountId } }, res);
    return { status, data, loaded };
  };
}

test('scouting validates IDs and fails closed for hidden accounts or privacy lookup failures', async () => {
  assert.equal((await handlerFixture()('bad')).status, 400);
  const hidden = await handlerFixture({ hidden: true })('42');
  assert.equal(hidden.status, 404);
  assert.equal(hidden.loaded, false);
  const unavailable = await handlerFixture({ hiddenError: true })('42');
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.loaded, false);
  assert.equal((await handlerFixture()('42')).status, 200);
});
