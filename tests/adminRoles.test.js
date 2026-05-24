// Task #313 — coverage for src/auth/adminRoles.js.
//
// Doesn't touch a real Postgres — uses an in-memory pg fake that supports
// the four queries the module actually issues (SELECT/INSERT/DELETE on
// admin_users + INSERT on admin_audit_log) plus BEGIN/COMMIT/ROLLBACK on
// a fake client. That's the smallest surface the helpers need.

const test = require('node:test');
const assert = require('node:assert');
const {
  ROLES,
  rankOf,
  hasRole,
  isValidRole,
  getAdminRole,
  setAdminRole,
  ensureBootstrapAdmin,
  createRoleGate,
} = require('../src/auth/adminRoles');

function makeFakeDb() {
  const adminUsers = new Map(); // account_id -> { role, granted_by, granted_at }
  const audit = [];
  const exec = async (text, params = []) => {
    const sql = text.replace(/\s+/g, ' ').trim().toUpperCase();
    if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK')) {
      return { rows: [] };
    }
    if (sql.startsWith('SELECT ROLE FROM ADMIN_USERS')) {
      const row = adminUsers.get(Number(params[0]));
      return { rows: row ? [{ role: row.role }] : [] };
    }
    if (sql.startsWith('INSERT INTO ADMIN_USERS')) {
      adminUsers.set(Number(params[0]), {
        role: params[1],
        granted_by: params[2],
        granted_at: new Date(),
      });
      return { rows: [] };
    }
    if (sql.startsWith('DELETE FROM ADMIN_USERS')) {
      adminUsers.delete(Number(params[0]));
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO ADMIN_AUDIT_LOG')) {
      audit.push({
        actor_account_id: params[0],
        actor_role: params[1],
        action: params[2],
        target_account_id: params[3],
        meta: JSON.parse(params[4]),
      });
      return { rows: [] };
    }
    throw new Error('unexpected query: ' + text);
  };
  const client = { query: exec, release: () => {} };
  const pool = { query: exec, connect: async () => client };
  return { getPool: () => pool, _adminUsers: adminUsers, _audit: audit };
}

test('rank ordering + hasRole', () => {
  assert.strictEqual(rankOf('none'), 0);
  assert.strictEqual(rankOf('moderator'), 1);
  assert.strictEqual(rankOf('admin'), 2);
  assert.strictEqual(rankOf('superuser'), 3);
  assert.strictEqual(rankOf('bogus'), 0);
  assert.ok(hasRole('admin', 'moderator'));
  assert.ok(hasRole('superuser', 'admin'));
  assert.ok(hasRole('admin', 'admin'));
  assert.ok(!hasRole('moderator', 'admin'));
  assert.ok(!hasRole('none', 'moderator'));
  assert.ok(isValidRole('admin'));
  assert.ok(!isValidRole('owner'));
});

test('setAdminRole upserts + writes one audit row per change', async () => {
  const db = makeFakeDb();
  let r = await setAdminRole(db, 12345, ROLES.ADMIN, 999);
  assert.strictEqual(r.previousRole, ROLES.NONE);
  assert.strictEqual(r.role, ROLES.ADMIN);
  assert.strictEqual(await getAdminRole(db, 12345), ROLES.ADMIN);
  assert.strictEqual(db._audit.length, 1);
  assert.deepStrictEqual(db._audit[0].meta, { from: 'none', to: 'admin' });

  r = await setAdminRole(db, 12345, ROLES.SUPERUSER, 999);
  assert.strictEqual(r.previousRole, ROLES.ADMIN);
  assert.strictEqual(await getAdminRole(db, 12345), ROLES.SUPERUSER);
  assert.strictEqual(db._audit.length, 2);
  assert.deepStrictEqual(db._audit[1].meta, { from: 'admin', to: 'superuser' });

  // Demoting to NONE removes the row + audits the change.
  r = await setAdminRole(db, 12345, ROLES.NONE, 999);
  assert.strictEqual(r.previousRole, ROLES.SUPERUSER);
  assert.strictEqual(await getAdminRole(db, 12345), ROLES.NONE);
  assert.strictEqual(db._audit.length, 3);
});

test('setAdminRole rejects invalid role', async () => {
  const db = makeFakeDb();
  await assert.rejects(() => setAdminRole(db, 1, 'owner', 2), /invalid role/);
  await assert.rejects(() => setAdminRole(db, 0, ROLES.ADMIN, 2), /accountId is required/);
});

test('ensureBootstrapAdmin is idempotent and skipped without env', async () => {
  const db = makeFakeDb();
  // No env -> no-op
  assert.strictEqual(await ensureBootstrapAdmin(db, {}), null);
  // With env -> inserts on first call, no-op on second
  const env = { BOOTSTRAP_ADMIN_STEAM_ID: '42' };
  const first = await ensureBootstrapAdmin(db, env);
  assert.deepStrictEqual(first, { accountId: 42, role: ROLES.SUPERUSER });
  assert.strictEqual(await getAdminRole(db, 42), ROLES.SUPERUSER);
  const second = await ensureBootstrapAdmin(db, env);
  assert.strictEqual(second, null);
  // Invalid env value -> no-op
  assert.strictEqual(await ensureBootstrapAdmin(db, { BOOTSTRAP_ADMIN_STEAM_ID: 'abc' }), null);
});

test('createRoleGate: 401 anonymous, 403 underprivileged, 200 sufficient', async () => {
  const db = makeFakeDb();
  await setAdminRole(db, 555, ROLES.MODERATOR, null);
  const needAdmin = createRoleGate(db, ROLES.ADMIN);

  const run = (req) => new Promise((resolve) => {
    const res = {
      statusCode: 200,
      _json: null,
      status(c) { this.statusCode = c; return this; },
      json(b) { this._json = b; resolve({ status: this.statusCode, body: b, req }); },
    };
    needAdmin(req, res, () => resolve({ status: 200, body: { passed: true }, req }));
  });

  // No session -> 401
  let r = await run({ session: {}, get: () => null });
  assert.strictEqual(r.status, 401);
  assert.strictEqual(r.body.error, 'insufficient_role');

  // Moderator session -> 403 (under-tier)
  r = await run({ session: { accountId: 555 }, get: () => null });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.have, ROLES.MODERATOR);

  // Admin session -> 200
  await setAdminRole(db, 777, ROLES.ADMIN, null);
  r = await run({ session: { accountId: 777 }, get: () => null });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.req.adminRole, ROLES.ADMIN);
});

test('createRoleGate: SUPERUSER_PASSWORD header short-circuits', async () => {
  const db = makeFakeDb();
  const prev = process.env.SUPERUSER_PASSWORD;
  process.env.SUPERUSER_PASSWORD = 'unit-test-secret';
  try {
    const needSuperuser = createRoleGate(db, ROLES.SUPERUSER);
    const headers = { 'x-superuser-password': 'unit-test-secret' };
    const req = { session: {}, get: (k) => headers[k.toLowerCase()] };
    const result = await new Promise((resolve) => {
      const res = {
        status(c) { return this; },
        json(b) { resolve({ status: 'json', body: b }); },
      };
      needSuperuser(req, res, () => resolve({ status: 'next', req }));
    });
    assert.strictEqual(result.status, 'next');
    assert.strictEqual(result.req.adminRole, ROLES.SUPERUSER);
    assert.strictEqual(result.req.adminViaSharedSecret, true);
  } finally {
    if (prev == null) delete process.env.SUPERUSER_PASSWORD;
    else process.env.SUPERUSER_PASSWORD = prev;
  }
});
