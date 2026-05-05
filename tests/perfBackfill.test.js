const test = require('node:test');
const assert = require('node:assert/strict');

const { backfillPerf } = require('../src/perf/perfService');

// Build a mocked pg pool that:
//   • Captures the backfill match-list SELECT (for WHERE-clause assertions).
//   • Serves per-match queries used by computeAndSavePerfForMatch so each
//     match resolves to a deterministic ok / failed outcome based on the
//     `failingMatchIds` set (those return no rows for the matches lookup,
//     causing computeAndSavePerfForMatch to return { ok: false, reason: 'no_match' }).
function _makeBackfillPool({ matchIds, failingMatchIds = new Set() }) {
  const captured = { listQueries: [] };
  const pool = {
    async query(sql, params) {
      const text = String(sql);

      // The backfill match-list SELECT — uses "FROM matches m" and ORDER BY m.match_id.
      if (text.includes('FROM matches m') && text.includes('ORDER BY m.match_id')) {
        captured.listQueries.push({ sql: text, params: params ? [...params] : [] });
        return { rows: matchIds.map(mid => ({ match_id: mid })) };
      }

      // Per-match SELECTs issued by computeAndSavePerfForMatch:
      if (text.startsWith('SELECT match_id, duration')) {
        const mid = params[0];
        if (failingMatchIds.has(mid)) return { rows: [] };
        return { rows: [{ match_id: mid, duration: 1800, radiant_win: true }] };
      }
      if (text.startsWith('SELECT slot, account_id')) {
        const mid = params[0];
        // Minimal viable player roster so computePerfForPlayer succeeds.
        const players = [];
        for (let i = 0; i < 10; i++) {
          players.push({
            slot: i,
            account_id: 1000 + i,
            team: i < 5 ? 'radiant' : 'dire',
            position: 3,
            kills: 3, deaths: 3, assists: 5, last_hits: 60,
            gpm: 380, xpm: 460,
            hero_damage: 8400, tower_damage: 2100, hero_healing: 0,
            obs_placed: 0, sen_placed: 0, wards_killed: 0, stun_duration: 0,
          });
        }
        return { rows: players };
      }
      if (text.includes("game_timeline->'players'")) {
        return { rows: [{ has_timeline: false, game_timeline: null }] };
      }
      if (text.startsWith('UPDATE player_stats')) {
        return { rows: [] };
      }
      throw new Error('unexpected query: ' + text.slice(0, 80));
    },
  };
  return { pool, captured };
}

// Silence the [PERF backfill] stdout noise during tests so the node:test
// reporter output stays readable.
function _silenceConsole() {
  const orig = console.log;
  console.log = () => {};
  return () => { console.log = orig; };
}

// ── WHERE-clause selection ─────────────────────────────────────────────────

test('backfillPerf: default WHERE clause only picks matches with at least one NULL perf row', async () => {
  const { pool, captured } = _makeBackfillPool({ matchIds: [] });
  const restore = _silenceConsole();
  try {
    await backfillPerf(() => pool, { sleepMs: 0 });
  } finally { restore(); }
  assert.equal(captured.listQueries.length, 1);
  const sql = captured.listQueries[0].sql;
  assert.ok(
    sql.includes('EXISTS (SELECT 1 FROM player_stats ps WHERE ps.match_id = m.match_id AND ps.perf IS NULL)'),
    `default WHERE should restrict to matches with NULL perf rows, got:\n${sql}`,
  );
  assert.ok(!sql.includes('WHERE 1=1'), 'default WHERE must not be the all-matches branch');
});

test('backfillPerf: { all: true } WHERE clause picks every match in history', async () => {
  const { pool, captured } = _makeBackfillPool({ matchIds: [] });
  const restore = _silenceConsole();
  try {
    await backfillPerf(() => pool, { all: true, sleepMs: 0 });
  } finally { restore(); }
  assert.equal(captured.listQueries.length, 1);
  const sql = captured.listQueries[0].sql;
  assert.ok(sql.includes('WHERE 1=1'), `all:true WHERE should be unrestricted, got:\n${sql}`);
  assert.ok(
    !sql.includes('ps.perf IS NULL'),
    'all:true WHERE must not include the NULL-perf filter',
  );
});

test('backfillPerf: { limit } adds a parameterised LIMIT clause', async () => {
  const { pool, captured } = _makeBackfillPool({ matchIds: [] });
  const restore = _silenceConsole();
  try {
    await backfillPerf(() => pool, { limit: 7, sleepMs: 0 });
  } finally { restore(); }
  assert.equal(captured.listQueries.length, 1);
  assert.ok(captured.listQueries[0].sql.includes('LIMIT $1'));
  assert.deepEqual(captured.listQueries[0].params, [7]);
});

// ── ok/failed counting on mixed results ────────────────────────────────────

test('backfillPerf: counts ok and failed correctly when computeAndSavePerfForMatch returns mixed results', async () => {
  // 5 matches; matches 'B' and 'D' fail (no_match → ok:false), the rest succeed.
  const matchIds = ['A', 'B', 'C', 'D', 'E'];
  const failingMatchIds = new Set(['B', 'D']);
  const { pool } = _makeBackfillPool({ matchIds, failingMatchIds });
  const restore = _silenceConsole();
  let result;
  try {
    result = await backfillPerf(() => pool, { sleepMs: 0 });
  } finally { restore(); }
  assert.equal(result.total, 5);
  assert.equal(result.processed, 5);
  assert.equal(result.ok, 3);
  assert.equal(result.failed, 2);
});

test('backfillPerf: returns zeroed totals when no matches are pending', async () => {
  const { pool } = _makeBackfillPool({ matchIds: [] });
  const restore = _silenceConsole();
  let result;
  try {
    result = await backfillPerf(() => pool, { sleepMs: 0 });
  } finally { restore(); }
  assert.deepEqual(result, { total: 0, processed: 0, ok: 0, failed: 0 });
});

// ── onProgress callback semantics ──────────────────────────────────────────

test('backfillPerf: onProgress fires once per batch with cumulative totals', async () => {
  // 7 matches, batchSize 3 → batches of [3, 3, 1] → 3 onProgress invocations.
  // Make match 'm5' fail so we can observe failed counter incrementing on the
  // second batch only.
  const matchIds = ['m1','m2','m3','m4','m5','m6','m7'];
  const { pool } = _makeBackfillPool({ matchIds, failingMatchIds: new Set(['m5']) });
  const calls = [];
  const restore = _silenceConsole();
  try {
    await backfillPerf(() => pool, {
      batchSize: 3,
      sleepMs: 0,
      onProgress: (p) => { calls.push({ ...p }); },
    });
  } finally { restore(); }
  assert.equal(calls.length, 3, `expected 3 onProgress calls (one per batch), got ${calls.length}`);
  // total is constant; done is cumulative; ok+failed === done at every step.
  assert.deepEqual(calls[0], { done: 3, total: 7, ok: 3, failed: 0 });
  assert.deepEqual(calls[1], { done: 6, total: 7, ok: 5, failed: 1 });
  assert.deepEqual(calls[2], { done: 7, total: 7, ok: 6, failed: 1 });
});

test('backfillPerf: a throwing onProgress does not break the loop', async () => {
  const matchIds = ['x1','x2','x3','x4'];
  const { pool } = _makeBackfillPool({ matchIds });
  let invoked = 0;
  const restore = _silenceConsole();
  let result;
  try {
    result = await backfillPerf(() => pool, {
      batchSize: 2,
      sleepMs: 0,
      onProgress: () => { invoked++; throw new Error('boom'); },
    });
  } finally { restore(); }
  assert.equal(invoked, 2, 'onProgress should still be called once per batch even if it throws');
  assert.equal(result.total, 4);
  assert.equal(result.processed, 4);
  assert.equal(result.ok, 4);
  assert.equal(result.failed, 0);
});
