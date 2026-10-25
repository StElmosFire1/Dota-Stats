const test = require('node:test');
const assert = require('node:assert/strict');
const { createChatHandlers, messageBody } = require('../src/inhouse/chat');

function fixture() {
  const state = { session: { id: 1, status: 'open', tenant_id: null }, roster: [{ account_id: 7, status: 'registered' }], messages: [], released: 0 };
  let tail = Promise.resolve();
  async function query(sql, args = []) {
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
    if (sql.startsWith('SELECT * FROM inhouse_sessions')) return { rows: state.session ? [state.session] : [] };
    if (sql.startsWith('SELECT account_id, status')) return { rows: state.roster };
    if (sql.includes('SELECT nickname')) return { rows: [{ nickname: '<script>nickname</script>' }] };
    if (sql.includes("INTERVAL '2 seconds'")) return { rows: state.messages.filter(m => m.session_id === args[0] && m.account_id === args[1] && Date.now() - new Date(m.created_at) < 2000) };
    if (sql.startsWith('INSERT')) {
      const message = { id: state.messages.length + 1, session_id: args[0], account_id: args[1], display_name: args[2], body: args[3], created_at: new Date().toISOString() };
      state.messages.push(message);
      return { rows: [message] };
    }
    if (sql.startsWith('DELETE')) {
      const match = state.messages.find(m => m.id === args[0] && m.session_id === args[1]);
      if (match) state.messages = state.messages.filter(m => m !== match);
      return { rows: match ? [match] : [] };
    }
    if (sql.startsWith('SELECT id, account_id')) return { rows: state.messages.filter(m => m.session_id === args[0]).slice(-50).reverse() };
    throw new Error(`Unexpected SQL ${sql}`);
  }
  const pool = {
    query,
    async connect() {
      const before = tail;
      let unlock;
      tail = new Promise(resolve => { unlock = resolve; });
      await before;
      return { query, release() { state.released++; unlock(); } };
    },
  };
  const handlers = createChatHandlers({
    db: { getPool: () => pool, getInhouseSession: async () => state.session },
    isAdmin: async req => req.liveAdmin === true,
    resolveScope: req => req.scope ?? null,
    visibleInScope: (session, scope) => !!session && session.tenant_id === scope,
  });
  async function call(action, overrides = {}) {
    const req = { params: { id: '1', messageId: '1' }, session: { accountId: 7 }, body: { body: 'Hello lobby' }, ...overrides };
    const res = { code: 200, set() { return this; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handlers[action](req, res);
    return res;
  }
  return { state, call };
}

test('validates readable Unicode text, trims whitespace, rejects oversized and nontext payloads', () => {
  assert.equal(messageBody('  Hello\nteam  '), 'Hello\nteam');
  assert.equal([...messageBody('😀'.repeat(500))].length, 500);
  for (const body of ['', '  ', null, {}, 'a'.repeat(501), '\u0000bad']) {
    assert.throws(() => messageBody(body), e => e.status === 400);
  }
});
test('requires Steam identity and active membership, not cached admin flags', async () => {
  const { state, call } = fixture();
  assert.equal((await call('list', { session: {} })).code, 401);
  state.roster = [];
  assert.equal((await call('list', { session: { accountId: 7, isAdmin: true } })).code, 403);
  state.roster = [{ account_id: 7, status: 'declined' }];
  assert.equal((await call('send')).code, 403);
  assert.equal((await call('list', { liveAdmin: true })).body.canModerate, true);
});
test('all operations hide other-tenant lobbies, including live admins', async () => {
  const { state, call } = fixture();
  state.session.tenant_id = 2;
  for (const action of ['list', 'send', 'remove']) {
    assert.equal((await call(action, { liveAdmin: true })).code, 404);
  }
  assert.equal(state.messages.length, 0);
  assert.equal((await call('list', { scope: 2 })).code, 200);
});
test('persists server-authoritative sender and text without interpreting HTML', async () => {
  const { state, call } = fixture();
  const result = await call('send', { body: { body: '<img src=x onerror=alert(1)>', account_id: 99, display_name: 'Forged' } });
  assert.equal(result.code, 201);
  assert.equal(result.body.message.account_id, 7);
  assert.equal(result.body.message.display_name, '<script>nickname</script>');
  assert.equal(state.messages[0].body, '<img src=x onerror=alert(1)>');
  assert.equal(state.released, 1);
});
test('serializes simultaneous sends and enforces per-sender rate limit', async () => {
  const { state, call } = fixture();
  const results = await Promise.all([call('send'), call('send')]);
  assert.deepEqual(results.map(r => r.code).sort(), [201, 429]);
  assert.equal(state.messages.length, 1);
  assert.equal(state.released, 2);
  state.messages[0].created_at = new Date(Date.now() - 3000).toISOString();
  assert.equal((await call('send')).code, 201);
});
test('returns only the latest 50 messages in chronological order for the requested lobby', async () => {
  const { state, call } = fixture();
  state.messages = Array.from({ length: 70 }, (_, i) => ({ id: i + 1, session_id: i === 69 ? 2 : 1 }));
  const result = await call('list');
  assert.equal(result.body.messages.length, 50);
  assert.equal(result.body.messages[0].id, 20);
  assert.equal(result.body.messages.at(-1).id, 69);
});
test('ended lobbies are read-only, unknown phases fail closed', async () => {
  const { state, call } = fixture();
  for (const status of ['completed', 'cancelled', 'unknown']) {
    state.session.status = status;
    assert.equal((await call('list')).body.canSend, false);
    assert.equal((await call('send')).code, 409);
  }
  assert.equal(state.messages.length, 0);
});
test('only live admins can delete, with message and lobby scope enforced', async () => {
  const { state, call } = fixture();
  await call('send');
  assert.equal((await call('remove')).code, 403);
  assert.equal((await call('remove', { liveAdmin: true, params: { id: 1, messageId: 2 } })).code, 404);
  assert.equal((await call('remove', { liveAdmin: true })).code, 200);
  assert.equal(state.messages.length, 0);
});
test('rejects malformed IDs before querying messages', async () => {
  const { call } = fixture();
  for (const id of ['1 OR 1=1', '-1', '0', '9007199254740993']) {
    assert.equal((await call('list', { params: { id } })).code, 400);
  }
});
