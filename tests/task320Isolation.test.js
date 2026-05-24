// Task #320 — Tenant isolation + commission resolution unit tests.
// Mocks the `pg` Pool constructor BEFORE requiring src/db so all internal
// getPool() calls resolve to our in-memory query stub. No live Postgres needed.

const assert = require('assert');
const Module = require('module');

// ── In-memory tables ────────────────────────────────────────────────
const slots = [
  { id: 1, slug: 'home_banner', label: 'Default', tenant_id: null, is_active: true },
  { id: 2, slug: 'home_banner', label: 'AcmeLeague', tenant_id: 99, is_active: true },
  { id: 3, slug: 'tenant_only', label: 'Acme Only', tenant_id: 99, is_active: true },
];

const fakePool = {
  query: async (sql, args = []) => {
    if (/FROM sponsorship_slots WHERE slug = \$1 AND tenant_id = \$2/.test(sql)) {
      return { rows: slots.filter(s => s.slug === args[0] && s.tenant_id === args[1]) };
    }
    if (/FROM sponsorship_slots WHERE slug = \$1 AND tenant_id IS NULL/.test(sql)) {
      return { rows: slots.filter(s => s.slug === args[0] && s.tenant_id === null) };
    }
    if (/FROM site_settings/.test(sql)) return { rows: [{ value: '1000' }] };
    return { rows: [] };
  },
  on: () => {},
  end: async () => {},
};

// Intercept require('pg') so src/db sees our fake Pool.
const origResolve = Module._resolveFilename;
const origLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === 'pg') {
    return { Pool: function () { return fakePool; } };
  }
  return origLoad.call(this, request, parent, ...rest);
};

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://fake/fake';

(async () => {
  const db = require('../src/db/index.js');

  // ── Tenant isolation ─────────────────────────────────────────────
  const acme = await db.getSponsorshipSlot('home_banner', { tenantId: 99 });
  assert.strictEqual(acme && acme.id, 2, 'tenant-scoped slot wins over global');

  const global = await db.getSponsorshipSlot('home_banner', { tenantId: null });
  assert.strictEqual(global && global.id, 1, 'global slot resolves when no tenant');

  const leak = await db.getSponsorshipSlot('tenant_only', { tenantId: null });
  assert.strictEqual(leak, null, 'tenant-only slot must NOT leak to default tenant');

  const acmeOnly = await db.getSponsorshipSlot('tenant_only', { tenantId: 99 });
  assert.strictEqual(acmeOnly && acmeOnly.id, 3, 'tenant-only slot visible to its tenant');

  // ── Commission resolution ladder ─────────────────────────────────
  assert.strictEqual(
    await db.resolveCommissionBpsForCoach({ commission_override_bps: 500, is_premium: true, commission_tier: 'elite' }),
    500, 'override beats premium and tier'
  );
  assert.strictEqual(
    await db.resolveCommissionBpsForCoach({ commission_override_bps: null, is_premium: true, commission_tier: 'rookie' }),
    700, 'premium beats tier (700bps)'
  );
  // Rookie falls through to site default (1000bps from our pool stub).
  assert.strictEqual(
    await db.resolveCommissionBpsForCoach({ commission_override_bps: null, is_premium: false, commission_tier: 'rookie' }),
    1000, 'rookie tier inherits site default (1000bps)'
  );
  assert.strictEqual(
    await db.resolveCommissionBpsForCoach({ commission_override_bps: null, is_premium: false, commission_tier: 'established' }),
    1800, 'established tier = 1800bps (18%)'
  );
  assert.strictEqual(
    await db.resolveCommissionBpsForCoach({ commission_override_bps: null, is_premium: false, commission_tier: 'elite' }),
    1200, 'elite tier = 1200bps (12%)'
  );
  // No tier at all → site default
  assert.strictEqual(
    await db.resolveCommissionBpsForCoach({ commission_override_bps: null, is_premium: false, commission_tier: null }),
    1000, 'no tier → site default'
  );

  console.log('[task320Isolation] ✓ tenant scoping + commission ladder all pass');
  Module._load = origLoad;
  Module._resolveFilename = origResolve;
  process.exit(0);
})().catch(err => {
  console.error('[task320Isolation] FAIL:', err.message);
  process.exit(1);
});
