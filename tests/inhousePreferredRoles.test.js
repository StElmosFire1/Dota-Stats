'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parsePreferredPositions } = require('../src/inhouse/preferredRoles');

test('roles require a nonempty selection drawn only from P1–P5', () => {
  for (const value of [undefined, null, '', ' ', '0', '6', '1,', ',2', '1,6', '1.5', 'carry', true, {}, [], [1, 6], [null]]) {
    assert.equal(parsePreferredPositions(value), null, JSON.stringify(value));
  }
});

test('valid preferences normalize to the existing CSV storage format', () => {
  assert.equal(parsePreferredPositions('1'), '1');
  assert.equal(parsePreferredPositions(' 1, 3,5 '), '1,3,5');
  assert.equal(parsePreferredPositions([2, 4]), '2,4');
  assert.equal(parsePreferredPositions('2,2,4'), '2,4');
  assert.equal(parsePreferredPositions('1,2,3,4,5'), '1,2,3,4,5');
});

// Execute the real route callback in isolation so these checks cannot join a
// live lobby, create sessions or contact Discord.
function fixture(route, { denied = false } = {}) {
  const source = fs.readFileSync(require.resolve('../src/web/server'), 'utf8');
  const start = source.indexOf(`router.post('${route}',`);
  assert.ok(start >= 0);
  const handlerStart = source.indexOf('async (req, res) => {', start);
  const end = source.indexOf('\n  });', handlerStart);
  const calls = [];
  const session = { id: 10, status: 'open' };
  const handler = vm.runInNewContext(`(${source.slice(handlerStart, end)}\n})`, {
    parsePreferredPositions,
    _resolveInhouseActor: () => ({ accountId: 42 }),
    _enforceDiscordGuildGate: async () => denied ? { status: 403, body: { error: 'Discord membership required' } } : null,
    db: {
      getOrCreateOpenInhouseSession: async () => { calls.push('create'); return { session, created: true }; },
      getInhouseSession: async () => { calls.push('read'); return session; },
      joinInhouseSession: async (...args) => { calls.push(args); return { account_id: 42 }; },
      touchInhousePlayerHeartbeat: async () => {},
    },
  });
  return {
    calls,
    async run(value) {
      let status = 200;
      let body;
      const res = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
      await handler({ body: { preferredPositions: value }, params: { id: '10' } }, res);
      return { status, body };
    },
  };
}

for (const route of ['/inhouse/join', '/inhouse/:id/join']) {
  test(`${route}: invalid roles return 400 before any session or player writes`, async () => {
    for (const value of [undefined, '', '6', '1,6']) {
      const f = fixture(route);
      const response = await f.run(value);
      assert.equal(response.status, 400);
      assert.equal(response.body.code, 'PREFERRED_ROLES_REQUIRED');
      assert.equal(f.calls.length, 0);
    }
  });

  test(`${route}: selected roles are normalized and persisted`, async () => {
    const f = fixture(route);
    const response = await f.run(' 1,3 ');
    assert.equal(response.status, 200);
    const join = f.calls.find(Array.isArray);
    assert.equal(join[0], 10);
    assert.equal(join[1], 42);
    assert.equal(join[2], '1,3');
  });

  test(`${route}: role selection does not bypass Discord membership`, async () => {
    const f = fixture(route, { denied: true });
    const response = await f.run('1');
    assert.equal(response.status, 403);
    assert.equal(f.calls.length, 0);
  });
}
