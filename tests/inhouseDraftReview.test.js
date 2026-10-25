const test = require('node:test');
const assert = require('node:assert/strict');
const { getDraftReview, updateDraftReview, isDraftReviewApproved } = require('../src/inhouse/draftReview');

function roster() {
  return Array.from({ length: 10 }, (_, i) => ({
    account_id: i + 1, team: i < 5 ? 1 : 2, status: 'drafted',
    inhouse_mmr: i < 5 ? 6000 - i * 300 : 2500 + i * 200,
  }));
}
function fixture(overrides = {}, players = roster()) {
  let state = { session: { id: 1, status: 'drafting', captain1_account_id: 1, captain2_account_id: 6, ...overrides }, players };
  let tail = Promise.resolve();
  const pool = { connect: async () => {
    const before = tail;
    let unlock, tx;
    tail = new Promise(resolve => { unlock = resolve; });
    return {
      async query(sql, args) {
        if (sql === 'BEGIN') { await before; tx = structuredClone(state); }
        else if (sql === 'COMMIT') state = tx;
        else if (sql === 'ROLLBACK') tx = null;
        else if (sql.startsWith('SELECT * FROM inhouse_sessions')) return { rows: tx.session ? [tx.session] : [] };
        else if (sql.startsWith('SELECT * FROM inhouse_session_players')) return { rows: tx.players };
        else if (sql.startsWith('UPDATE inhouse_session_players')) {
          const changed = tx.players.filter(p => (p.account_id === args[1] && p.team === 1) || (p.account_id === args[2] && p.team === 2));
          changed.forEach(p => { p.team = p.account_id === args[1] ? 2 : 1; });
          return { rows: structuredClone(changed), rowCount: changed.length };
        } else if (sql.startsWith('UPDATE inhouse_sessions')) tx.session.draft_review = JSON.parse(args[1]);
        else throw Error(`Unexpected SQL: ${sql}`);
        return { rows: [], rowCount: 0 };
      },
      release() { unlock(); },
    };
  } };
  return {
    pool, state: () => state,
    review: () => getDraftReview(state.session, state.players),
    change: (action, requesterAccountId = 1, args = {}) => updateDraftReview(pool, {
      sessionId: 1, requesterAccountId, action, revision: getDraftReview(state.session, state.players).revision, ...args,
    }),
  };
}

test('completed draft offers real rating-improving swaps, never captains or zero-filled unknown ratings', () => {
  const f = fixture();
  const r = f.review();
  assert.equal(r.available, true);
  assert.equal(r.approved, false);
  assert.ok(r.suggestions.length > 0 && r.suggestions.length <= 3);
  for (const s of r.suggestions) {
    assert.ok(s.afterGap < s.beforeGap);
    assert.notEqual(s.team1AccountId, 1);
    assert.notEqual(s.team2AccountId, 6);
  }
  delete f.state().players[2].inhouse_mmr;
  const unknown = f.review();
  assert.equal(unknown.balance.knownCount, 9);
  assert.equal(unknown.balance.gap, null);
  assert.deepEqual(unknown.suggestions, []);
});

test('both distinct captains must confirm; decisions persist and final approval locks changes', async () => {
  const f = fixture();
  await f.change('confirm');
  assert.deepEqual(f.review().confirmations, [1]);
  assert.equal(isDraftReviewApproved(f.state().session, f.state().players), false);
  await f.change('confirm', 6);
  assert.equal(f.review().approved, true);
  assert.equal(isDraftReviewApproved(f.state().session, f.state().players), true);
  for (const action of ['revoke', 'propose', 'confirm']) await assert.rejects(f.change(action), /locked/);
});

test('proposals and accepted trades reset confirmations; only the opponent can accept', async () => {
  const f = fixture();
  await f.change('confirm');
  await f.change('propose', 1, { team1AccountId: 2, team2AccountId: 7 });
  assert.deepEqual(f.review().confirmations, []);
  const proposalId = f.review().pendingTrade.id;
  await assert.rejects(f.change('accept', 1, { proposalId }), e => e.status === 403);
  await assert.rejects(f.change('confirm', 6), /Resolve/);
  await f.change('accept', 6, { proposalId });
  assert.equal(f.state().players.find(p => p.account_id === 2).team, 2);
  assert.equal(f.state().players.find(p => p.account_id === 7).team, 1);
  assert.ok([1, 2].every(team => f.state().players.filter(p => p.team === team).length === 5));
  assert.deepEqual(f.review().confirmations, []);
  assert.equal(f.review().pendingTrade, null);
  assert.equal(f.review().approved, false);
  await assert.rejects(f.change('accept', 6, { proposalId }), /no longer pending/);
  await f.change('confirm', 1);
  await f.change('confirm', 6);
  assert.equal(f.review().approved, true);
});

test('captains may decline, withdraw and revoke, with correct proposal ownership', async () => {
  const f = fixture();
  await f.change('propose', 1, { team1AccountId: 3, team2AccountId: 8 });
  let proposalId = f.review().pendingTrade.id;
  await assert.rejects(f.change('decline', 1, { proposalId }), e => e.status === 403);
  await assert.rejects(f.change('withdraw', 6, { proposalId }), e => e.status === 403);
  await f.change('decline', 6, { proposalId });
  assert.equal(f.review().pendingTrade, null);
  await f.change('propose', 6, { team1AccountId: 3, team2AccountId: 8 });
  proposalId = f.review().pendingTrade.id;
  await f.change('withdraw', 6, { proposalId });
  await f.change('confirm');
  await f.change('revoke');
  assert.deepEqual(f.review().confirmations, []);
});

test('anonymous, non-captain and stale clients cannot change review; captains cannot be traded', async () => {
  const f = fixture();
  await assert.rejects(f.change('confirm', null), e => e.status === 401);
  await assert.rejects(f.change('confirm', 3), e => e.status === 403);
  for (const pair of [[1, 7], [2, 6], [2, 3], [900, 7]]) {
    await assert.rejects(f.change('propose', 1, { team1AccountId: pair[0], team2AccountId: pair[1] }), e => e.status === 400);
  }
  await assert.rejects(f.change('confirm', 1, { revision: '0' }), e => e.status === 409);
  await f.change('confirm');
  await assert.rejects(f.change('confirm', 6, { revision: 0 }), e => e.status === 409);
});

test('concurrent approvals and duplicate accept requests serialize against revision and capacity', async () => {
  const f = fixture();
  const approvals = await Promise.allSettled([1, 6].map(id => f.change('confirm', id, { revision: 0 })));
  assert.equal(approvals.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.review().approved, false);
  await f.change('propose', 1, { team1AccountId: 4, team2AccountId: 9 });
  const { revision, pendingTrade } = f.review();
  const trades = await Promise.allSettled([0, 1].map(() => f.change('accept', 6, { revision, proposalId: pendingTrade.id })));
  assert.equal(trades.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.state().players.filter(p => p.team === 1).length, 5);
  assert.equal(f.state().players.filter(p => p.team === 2).length, 5);
});

test('an externally changed roster invalidates prior approval and stale proposals', async () => {
  const f = fixture();
  await f.change('confirm');
  await f.change('confirm', 6);
  f.state().players.find(p => p.account_id === 2).team = 2;
  f.state().players.find(p => p.account_id === 7).team = 1;
  assert.equal(f.review().approved, false);
  assert.deepEqual(f.review().confirmations, []);
  assert.equal(isDraftReviewApproved(f.state().session, f.state().players), false);
  await assert.rejects(f.change('confirm', 1, { revision: 2 }), /changed/);
});

test('incomplete/overfilled drafts cannot review, and closed/live matches cannot trade', async () => {
  for (const kind of ['incomplete', 'overfilled', 'in_progress', 'cancelled']) {
    const f = fixture();
    if (kind === 'incomplete') f.state().players[4].team = 0;
    else if (kind === 'overfilled') f.state().players[5].team = 1;
    else f.state().session.status = kind;
    assert.equal(f.review().available, false);
    await assert.rejects(f.change('confirm'), e => e.status === 409);
  }
});
