const test = require('node:test');
const assert = require('node:assert/strict');
const { pickPlayer, getNextPickDeadline } = require('../src/inhouse/draftPick');
const { currentPickerTeam } = require('../src/inhouse/draftSequence');

function fixture(players, overrides = {}) {
  let state = { session: { id: 1, status: 'drafting', captain1_account_id: 1, captain2_account_id: 2, draft_pick_seconds: 30, ...overrides }, players };
  let tail = Promise.resolve();
  let releases = 0;
  const pool = { connect: async () => {
    const previous = tail;
    let unlock;
    tail = new Promise(resolve => { unlock = resolve; });
    let transaction;
    return {
      async query(sql, args) {
        if (sql === 'BEGIN') { await previous; transaction = structuredClone(state); }
        else if (sql === 'COMMIT') state = transaction;
        else if (sql === 'ROLLBACK') transaction = null;
        else if (sql.startsWith('SELECT * FROM inhouse_sessions')) return { rows: [structuredClone(transaction.session)] };
        else if (sql.startsWith('SELECT * FROM inhouse_session_players')) return { rows: structuredClone(transaction.players) };
        else if (sql.startsWith('UPDATE inhouse_session_players')) {
          const target = transaction.players.find(p => Number(p.account_id) === Number(args[3]));
          Object.assign(target, { team: args[0], pick_order: args[1], status: 'drafted', pick_source: args[4] });
          return { rowCount: 1, rows: [structuredClone(target)] };
        } else if (sql.startsWith('UPDATE inhouse_sessions')) transaction.session.draft_pick_deadline_at = args[1];
        else throw Error('Unexpected query');
        return { rows: [], rowCount: 0 };
      },
      release() { releases++; unlock(); },
    };
  } };
  return { pool, state: () => state, releases: () => releases };
}
const roster = () => Array.from({ length: 10 }, (_, i) => ({
  account_id: i + 1, team: i === 0 ? 1 : i === 1 ? 2 : 0, status: 'accepted',
}));
const request = (extra = {}) => ({ sessionId: 1, accountId: 3, team: 1, requesterAccountId: 1, source: 'captain', ...extra });

test('only the very first clock has a ten-second lead-in', () => {
  assert.equal(getNextPickDeadline({ draft_pick_seconds: 30 }, 1000, true).getTime(), 41000);
  assert.equal(getNextPickDeadline({ draft_pick_seconds: 60 }, 1000, true).getTime(), 71000);
  assert.equal(getNextPickDeadline({ draft_pick_seconds: 30 }, 1000).getTime(), 31000);
  assert.equal(getNextPickDeadline({ draft_pick_seconds: 60 }, 1000).getTime(), 61000);
});

test('only the active captain can make normal picks, including during the lead-in', async () => {
  for (const [extra, status] of [
    [{ requesterAccountId: null }, 401], [{ requesterAccountId: 8 }, 403],
    [{ team: 2 }, 403], [{ requesterAccountId: 2, team: 2 }, 409],
  ]) {
    const f = fixture(roster());
    await assert.rejects(pickPlayer(f.pool, request(extra)), e => e.status === status);
    assert.equal(f.state().players[2].team, 0);
  }
  const f = fixture(roster(), { draft_pick_deadline_at: new Date(Date.now() + 40000) });
  const before = Date.now();
  await pickPlayer(f.pool, request());
  assert.equal(f.state().players[2].team, 1);
  const next = f.state().session.draft_pick_deadline_at.getTime();
  assert.ok(next >= before + 30000 && next < before + 31000, 'Picking during the first grace immediately starts the next normal timer');
});

test('serialized concurrent captain picks cannot both consume the same turn', async () => {
  const f = fixture(roster());
  const results = await Promise.allSettled([
    pickPlayer(f.pool, request()), pickPlayer(f.pool, request({ accountId: 4 })),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.state().players.filter(p => p.team === 1).length, 2);
  assert.equal(f.releases(), 2);
});

test('admins cannot exceed five including the captain, even with concurrent requests', async () => {
  const players = roster();
  for (const id of [3, 4, 5]) players[id - 1].team = 1;
  for (const id of [6, 7]) players[id - 1].team = 2;
  const f = fixture(players);
  const results = await Promise.allSettled([8, 9].map(accountId =>
    pickPlayer(f.pool, request({ accountId, isAdmin: true }))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.state().players.filter(p => p.team === 1).length, 5);
  assert.equal(currentPickerTeam(f.state().players, f.state().session), 2);
  await assert.rejects(pickPlayer(f.pool, request({ accountId: 10, isAdmin: true })), /five players/);
});

test('stale deadline workers cannot pick after a captain advances the draft', async () => {
  const deadline = new Date(Date.now() - 1000);
  const f = fixture(roster(), { draft_pick_deadline_at: deadline });
  await pickPlayer(f.pool, request());
  await assert.rejects(pickPlayer(f.pool, request({
    accountId: 4, team: 2, isAdmin: true, source: 'auto_deadline', expectedPickDeadlineAt: deadline,
  })), /deadline or turn has changed/);
  assert.equal(f.state().players[3].team, 0);
});

test('deadline pick runs only after the full grace and pick budget, then renews the next clock', async () => {
  const expired = new Date(Date.now() - 10);
  const f = fixture(roster(), { draft_pick_deadline_at: expired });
  const result = await pickPlayer(f.pool, request({ isAdmin: true, source: 'auto_deadline', expectedPickDeadlineAt: expired }));
  assert.equal(result.player.pick_source, 'auto_deadline');
  const early = new Date(Date.now() + 39000);
  const pending = fixture(roster(), { draft_pick_deadline_at: early });
  await assert.rejects(pickPlayer(pending.pool, request({ isAdmin: true, source: 'auto_deadline', expectedPickDeadlineAt: early })), /deadline/);
});

test('last pick caps both teams at five and clears the deadline atomically', async () => {
  const players = roster();
  [3, 4, 5].forEach(id => { players[id - 1].team = 1; });
  [6, 7, 8, 9].forEach(id => { players[id - 1].team = 2; });
  const f = fixture(players);
  const result = await pickPlayer(f.pool, request({ accountId: 10, expectedPickIndex: 7 }));
  assert.equal(result.complete, true);
  assert.equal(f.state().session.draft_pick_deadline_at, null);
  assert.equal(f.state().players.filter(p => p.team === 1).length, 5);
  assert.equal(f.state().players.filter(p => p.team === 2).length, 5);
});

test('captains, declined, already picked and stale screen selections are not eligible', async () => {
  for (const extra of [{ accountId: 1 }, { expectedPickIndex: 2 }]) {
    const f = fixture(roster());
    await assert.rejects(pickPlayer(f.pool, request(extra)), e => e.status === 409);
  }
  const players = roster(); players[2].status = 'declined';
  await assert.rejects(pickPlayer(fixture(players).pool, request()), /no longer eligible/);
});
