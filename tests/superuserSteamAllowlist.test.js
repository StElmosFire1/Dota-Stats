// Regression coverage for the password-free, Steam-account-bound superuser
// allow-list helpers in src/web/server.js.
//
// These two pure helpers are the single source of truth for "is this caller the
// owner?" and are consumed in three production-critical places:
//   - the FULL_SITE_LOCKDOWN gate (createServer → lockdownMiddleware), which is
//     the ONLY way the owner gets past the private-preview lock now that there
//     is no password,
//   - /api/auth/complete (stamps req.session.isSuperuser on sign-in),
//   - getEffectiveRole()/requireSuperuser() (admin-panel access).
//
// They were previously defined inside createApiRouter() and so were NOT in
// scope for the lockdown middleware in createServer() — calling them there
// threw a ReferenceError and locked the owner out. They now live at module
// scope. This test guards both the pure logic AND that they remain exported /
// reachable from module scope.

const test = require('node:test');
const assert = require('node:assert/strict');

const { _stubServerDeps, _loadServerFresh } = require('./fixtures/serverHarness');

_stubServerDeps();
const { parseSuperuserSteamIds, isAllowlistedSteamSuperuser } = _loadServerFresh();

function withEnv(val, fn) {
  const prev = process.env.SUPERUSER_STEAM_IDS;
  if (val === undefined) delete process.env.SUPERUSER_STEAM_IDS;
  else process.env.SUPERUSER_STEAM_IDS = val;
  try { return fn(); }
  finally {
    if (prev === undefined) delete process.env.SUPERUSER_STEAM_IDS;
    else process.env.SUPERUSER_STEAM_IDS = prev;
  }
}

test('helpers are exported from module scope (so the lockdown gate can call them)', () => {
  assert.equal(typeof parseSuperuserSteamIds, 'function');
  assert.equal(typeof isAllowlistedSteamSuperuser, 'function');
});

test('parseSuperuserSteamIds: unset/empty/whitespace → empty set', () => {
  withEnv(undefined, () => assert.equal(parseSuperuserSteamIds().size, 0));
  withEnv('', () => assert.equal(parseSuperuserSteamIds().size, 0));
  withEnv('   \n\t ', () => assert.equal(parseSuperuserSteamIds().size, 0));
});

test('parseSuperuserSteamIds: comma/space/newline separated, trims + drops blanks', () => {
  withEnv('35944021', () => {
    const s = parseSuperuserSteamIds();
    assert.equal(s.size, 1);
    assert.ok(s.has('35944021'));
  });
  withEnv(' 35944021, 111 \n222\t333 ,, ', () => {
    const s = parseSuperuserSteamIds();
    assert.deepEqual([...s].sort(), ['111', '222', '333', '35944021'].sort());
  });
});

test('isAllowlistedSteamSuperuser: allow-listed account (number or string) → true', () => {
  withEnv('35944021', () => {
    assert.equal(isAllowlistedSteamSuperuser({ session: { accountId: 35944021 } }), true);
    assert.equal(isAllowlistedSteamSuperuser({ session: { accountId: '35944021' } }), true);
  });
});

test('isAllowlistedSteamSuperuser: signed-in but not allow-listed → false', () => {
  withEnv('35944021', () => {
    assert.equal(isAllowlistedSteamSuperuser({ session: { accountId: 999 } }), false);
    assert.equal(isAllowlistedSteamSuperuser({ session: { accountId: '99999999' } }), false);
  });
});

test('isAllowlistedSteamSuperuser: no session / no accountId → false', () => {
  withEnv('35944021', () => {
    assert.equal(isAllowlistedSteamSuperuser({}), false);
    assert.equal(isAllowlistedSteamSuperuser({ session: {} }), false);
    assert.equal(isAllowlistedSteamSuperuser({ session: { accountId: null } }), false);
    assert.equal(isAllowlistedSteamSuperuser({ session: { accountId: 0 } }), false);
  });
});

test('isAllowlistedSteamSuperuser: empty/unset allow-list fails closed even for a matching-looking session', () => {
  withEnv('', () => {
    assert.equal(isAllowlistedSteamSuperuser({ session: { accountId: 35944021 } }), false);
  });
  withEnv(undefined, () => {
    assert.equal(isAllowlistedSteamSuperuser({ session: { accountId: 35944021 } }), false);
  });
});
