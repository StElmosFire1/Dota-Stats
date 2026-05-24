// Task #313 — Admin role tiers + audit log helpers.
//
// Background. The legacy admin model is two opaque shared secrets:
// `UPLOAD_KEY` (admin-ish; granted by some operators for replay uploads etc.)
// and `SUPERUSER_PASSWORD` (full god-mode). There's no way to grant a
// person "admin" without also giving them the password. This module adds a
// tiered, per-Steam-account role model on top of those secrets without
// removing them — the shared-secret path stays as a break-glass and is
// always treated as the highest tier (`superuser`).
//
// Tiers (low → high):
//   none       — default; no admin powers
//   moderator  — community moderation (deferred: hook into existing mod routes)
//   admin      — full admin minus a few destructive superuser-only ops
//   superuser  — everything; matches the existing SUPERUSER_PASSWORD scope
//
// Storage. A small `admin_users` table keyed by 32-bit Steam account id +
// an append-only `admin_audit_log`. Both are created in db/index.js init()
// alongside the rest of the schema (see Task #313 patch). We deliberately
// did NOT add a column to `players` — admin assignment is sparse and the
// players table is hot.
//
// Bootstrap. If `BOOTSTRAP_ADMIN_STEAM_ID` is set in env and matches a
// row that doesn't exist yet, `ensureBootstrapAdmin()` inserts it as
// `superuser` on startup. This gives operators a way to land the first
// admin without manually editing the DB.
//
// Audit. Every role change goes through `setAdminRole`, which writes an
// audit row in the same transaction as the role mutation. Read-only
// `recordAuditEvent()` is exported for other modules (route handlers,
// admin tools) to log mutating actions; the row gets the actor's
// account_id + role at the time + a free-form `action` + JSON `meta`.

const ROLES = Object.freeze({
  NONE: 'none',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
  SUPERUSER: 'superuser',
});

const RANK = Object.freeze({
  none: 0,
  moderator: 1,
  admin: 2,
  superuser: 3,
});

function isValidRole(role) {
  return Object.prototype.hasOwnProperty.call(RANK, role);
}

function rankOf(role) {
  return RANK[role] != null ? RANK[role] : 0;
}

// Returns true iff `have` meets or exceeds `need`. Both must be valid tier
// strings; unknown roles are treated as `none`.
function hasRole(have, need) {
  return rankOf(have) >= rankOf(need);
}

// Lightweight DB shape — the helpers accept a `db` object with a `getPool()`
// method so they're trivial to unit-test against an in-memory fake.
async function getAdminRole(db, accountId) {
  if (!accountId) return ROLES.NONE;
  const pool = db.getPool();
  const r = await pool.query(
    'SELECT role FROM admin_users WHERE account_id = $1 LIMIT 1',
    [Number(accountId)]
  );
  if (r.rows.length === 0) return ROLES.NONE;
  const role = r.rows[0].role;
  return isValidRole(role) ? role : ROLES.NONE;
}

// Upsert a role + audit the change atomically. Pass `actorAccountId=null` for
// system-initiated changes (e.g. bootstrap); otherwise it should be the
// account performing the mutation.
async function setAdminRole(db, accountId, role, actorAccountId, meta = {}) {
  if (!isValidRole(role)) throw new Error(`invalid role: ${role}`);
  if (!accountId) throw new Error('accountId is required');
  const pool = db.getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const prev = await client.query(
      'SELECT role FROM admin_users WHERE account_id = $1 LIMIT 1',
      [Number(accountId)]
    );
    const previousRole = prev.rows[0]?.role || ROLES.NONE;
    if (role === ROLES.NONE) {
      await client.query('DELETE FROM admin_users WHERE account_id = $1', [Number(accountId)]);
    } else {
      await client.query(
        `INSERT INTO admin_users (account_id, role, granted_by, granted_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (account_id) DO UPDATE SET
           role = EXCLUDED.role,
           granted_by = EXCLUDED.granted_by,
           granted_at = NOW()`,
        [Number(accountId), role, actorAccountId ? Number(actorAccountId) : null]
      );
    }
    await client.query(
      `INSERT INTO admin_audit_log (actor_account_id, actor_role, action, target_account_id, meta, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        actorAccountId ? Number(actorAccountId) : null,
        await _actorRoleInTxn(client, actorAccountId),
        'set_role',
        Number(accountId),
        JSON.stringify({ from: previousRole, to: role, ...meta }),
      ]
    );
    await client.query('COMMIT');
    return { previousRole, role };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function _actorRoleInTxn(client, actorAccountId) {
  if (!actorAccountId) return 'system';
  const r = await client.query(
    'SELECT role FROM admin_users WHERE account_id = $1 LIMIT 1',
    [Number(actorAccountId)]
  );
  return r.rows[0]?.role || ROLES.NONE;
}

// Used by callers (route handlers, CLI tools) to log a privileged action.
// Best-effort: failures are logged but never thrown — audit must not break
// the action itself.
async function recordAuditEvent(db, { actorAccountId, actorRole, action, targetAccountId, meta }) {
  try {
    const pool = db.getPool();
    await pool.query(
      `INSERT INTO admin_audit_log (actor_account_id, actor_role, action, target_account_id, meta, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        actorAccountId ? Number(actorAccountId) : null,
        actorRole || 'unknown',
        String(action || 'unknown'),
        targetAccountId ? Number(targetAccountId) : null,
        JSON.stringify(meta || {}),
      ]
    );
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[adminRoles] audit insert failed:', err.message);
    return false;
  }
}

// Returns the bootstrapped admin if one was inserted, or null if nothing
// to do. Safe to call on every startup — only inserts when env var is set
// AND the target account has no existing role.
async function ensureBootstrapAdmin(db, env = process.env) {
  const raw = env.BOOTSTRAP_ADMIN_STEAM_ID;
  if (!raw) return null;
  const accountId = Number(String(raw).trim());
  if (!accountId || Number.isNaN(accountId)) return null;
  const existing = await getAdminRole(db, accountId);
  if (existing !== ROLES.NONE) return null;
  await setAdminRole(db, accountId, ROLES.SUPERUSER, null, { source: 'bootstrap' });
  return { accountId, role: ROLES.SUPERUSER };
}

// Express middleware factory. Resolves the caller's role from the express
// session (Steam-OpenID-authenticated `req.session.accountId`) AND from the
// legacy SUPERUSER_PASSWORD header — whichever is higher wins. The shared
// secret is preserved as break-glass per the task spec.
//
// Usage:
//   const requireAdmin = createRoleGate(db, ROLES.ADMIN);
//   app.post('/api/something', requireAdmin, handler);
function createRoleGate(db, needed) {
  if (!isValidRole(needed)) throw new Error(`invalid role: ${needed}`);
  return async function roleGate(req, res, next) {
    try {
      // Legacy shared-secret short-circuit: SUPERUSER_PASSWORD === superuser.
      const provided = req.get('x-superuser-password') || req.body?.superuserPassword;
      if (provided && process.env.SUPERUSER_PASSWORD && provided === process.env.SUPERUSER_PASSWORD) {
        req.adminRole = ROLES.SUPERUSER;
        req.adminViaSharedSecret = true;
        return next();
      }
      const accountId = req.session?.accountId || req.session?.steamId;
      const role = accountId ? await getAdminRole(db, accountId) : ROLES.NONE;
      req.adminRole = role;
      if (!hasRole(role, needed)) {
        return res.status(role === ROLES.NONE ? 401 : 403).json({
          error: 'insufficient_role',
          required: needed,
          have: role,
        });
      }
      return next();
    } catch (err) {
      return res.status(500).json({ error: 'role_check_failed', detail: err.message });
    }
  };
}

module.exports = {
  ROLES,
  RANK,
  isValidRole,
  rankOf,
  hasRole,
  getAdminRole,
  setAdminRole,
  recordAuditEvent,
  ensureBootstrapAdmin,
  createRoleGate,
};
