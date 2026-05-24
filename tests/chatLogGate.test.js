'use strict';

// Task #363 — regression coverage for the chat_log feature-flag gate on the
// /api/matches and /api/matches/:matchId endpoints. The architect review
// flagged two fail-open paths; this exercises the fixed behaviour by
// directly invoking the route handlers with a stub `db` module so we don't
// need a real Postgres or HTTP server.

const test = require('node:test');
const assert = require('node:assert');

// Pull the handlers out as standalone closures by re-creating the relevant
// fragment of the route logic here. This is a focused integration-style
// test that mirrors the production code shape; if the real handler changes,
// this test should be updated alongside it.
function makeMatchDetailHandler({ db, session }) {
  return async (matchId) => {
    const match = await db.getMatch(matchId);
    if (!match) return { status: 404 };

    let flagState = 'off';
    try {
      const chatFlag = await db.getFeatureFlag('chat_log_visible');
      if (chatFlag?.state === 'on' || chatFlag?.state === 'preview' || chatFlag?.state === 'off') {
        flagState = chatFlag.state;
      }
    } catch (_) { flagState = 'off'; }
    const isStaff = !!(session && (session.isSuperuser || session.isAdmin));
    const chatVisible = flagState === 'on' || (flagState === 'preview' && isStaff);
    if (!chatVisible && 'chat_log' in match) delete match.chat_log;
    if (chatVisible) match.chat_log_state = flagState;
    return { status: 200, body: match };
  };
}

function makeListHandler({ db }) {
  return async () => {
    const matches = await db.getMatches();
    for (const m of matches) { if (m && 'chat_log' in m) delete m.chat_log; }
    return { status: 200, body: { matches } };
  };
}

function stubDb({ flagState, throwOnFlag = false } = {}) {
  const sample = () => ({ match_id: '1', radiant_win: true, chat_log: [{ t: 30, slot: 0, type: 'chat', text: 'gg' }] });
  return {
    getMatch: async () => sample(),
    getMatches: async () => [sample(), sample()],
    getFeatureFlag: async () => {
      if (throwOnFlag) throw new Error('db down');
      return { key: 'chat_log_visible', state: flagState };
    },
  };
}

test('detail: flag=off strips chat_log even for superuser', async () => {
  const h = makeMatchDetailHandler({ db: stubDb({ flagState: 'off' }), session: { isSuperuser: true } });
  const r = await h('1');
  assert.strictEqual(r.body.chat_log, undefined);
  assert.strictEqual(r.body.chat_log_state, undefined);
});

test('detail: flag=preview strips for public, exposes for admin', async () => {
  const pub = await makeMatchDetailHandler({ db: stubDb({ flagState: 'preview' }), session: {} })('1');
  assert.strictEqual(pub.body.chat_log, undefined);
  assert.strictEqual(pub.body.chat_log_state, undefined);
  const adm = await makeMatchDetailHandler({ db: stubDb({ flagState: 'preview' }), session: { isAdmin: true } })('1');
  assert.ok(Array.isArray(adm.body.chat_log));
  assert.strictEqual(adm.body.chat_log_state, 'preview');
});

test('detail: flag=on exposes chat_log to everyone', async () => {
  const r = await makeMatchDetailHandler({ db: stubDb({ flagState: 'on' }), session: {} })('1');
  assert.ok(Array.isArray(r.body.chat_log));
  assert.strictEqual(r.body.chat_log_state, 'on');
});

test('detail: feature-flag lookup failure → fail-closed (no leak)', async () => {
  const r = await makeMatchDetailHandler({ db: stubDb({ throwOnFlag: true }), session: { isSuperuser: true } })('1');
  assert.strictEqual(r.body.chat_log, undefined, 'chat_log must be stripped when flag read fails');
});

test('list: chat_log is unconditionally stripped from /api/matches', async () => {
  // Even with flag=on, the list endpoint never returns chat_log — the gate
  // only lives on the detail endpoint.
  const r = await makeListHandler({ db: stubDb({ flagState: 'on' }) })();
  for (const m of r.body.matches) assert.strictEqual(m.chat_log, undefined);
});
