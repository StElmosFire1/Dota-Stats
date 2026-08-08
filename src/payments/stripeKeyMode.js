// Task #855 — Stripe key-mode validation.
//
// Real-money launch guard: refuse to run with a test-mode key in production
// or a live-mode key outside production (a live key in dev would let a stray
// checkout charge a real card). Used both at startup (fail-fast) and by the
// feature-health probe (continuous check that also verifies the key against
// Stripe's own `livemode` and that a sample of configured Connect accounts
// resolve under this key — a live key with test Connect accounts fails with
// resource_missing).
//
// Escape hatch: STRIPE_ALLOW_MODE_MISMATCH=1 downgrades the startup failure
// to a loud warning (useful for one-off local debugging against live data).

'use strict';

// 'live' | 'test' | null (unrecognized/absent key)
function getKeyMode(key) {
  if (!key || typeof key !== 'string') return null;
  if (/^(sk|rk|pk)_live_/.test(key)) return 'live';
  if (/^(sk|rk|pk)_test_/.test(key)) return 'test';
  return null;
}

function expectedModeForEnv(nodeEnv = process.env.NODE_ENV) {
  return nodeEnv === 'production' ? 'live' : 'test';
}

// Static (no-network) check. Returns { ok, mode, expected, reason }.
function checkKeyModeStatic({
  key = process.env.STRIPE_SECRET_KEY,
  nodeEnv = process.env.NODE_ENV,
} = {}) {
  if (!key) return { ok: true, mode: null, expected: expectedModeForEnv(nodeEnv), reason: 'no key configured (payments disabled)' };
  const mode = getKeyMode(key);
  const expected = expectedModeForEnv(nodeEnv);
  if (!mode) {
    return { ok: false, mode, expected, reason: 'unrecognized STRIPE_SECRET_KEY format (expected sk_live_/sk_test_/rk_...)' };
  }
  if (mode !== expected) {
    return {
      ok: false, mode, expected,
      reason: `STRIPE_SECRET_KEY is a ${mode}-mode key but NODE_ENV=${nodeEnv || '(unset)'} expects ${expected} mode`,
    };
  }
  return { ok: true, mode, expected, reason: null };
}

// Full check: static + live verification against Stripe (balance.livemode
// must agree with the key prefix) + a sample of active Connect accounts
// must resolve under this key. Never throws.
async function checkKeyMode({ db = null, network = true } = {}) {
  const stat = checkKeyModeStatic();
  if (!stat.ok || !process.env.STRIPE_SECRET_KEY || !network) return stat;
  try {
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 0, timeout: 5000 });
    const bal = await stripe.balance.retrieve();
    const apiMode = bal.livemode ? 'live' : 'test';
    if (apiMode !== stat.mode) {
      return { ...stat, ok: false, reason: `Stripe reports livemode=${bal.livemode} but key prefix says ${stat.mode}` };
    }
    // Connect account sample: catches live key + test-mode acct_ ids (or vice
    // versa) which would break coaching capture/payouts at charge time.
    if (db && typeof db.getPool === 'function') {
      try {
        const r = await db.getPool().query(
          `SELECT stripe_account_id FROM coaches
            WHERE stripe_account_id IS NOT NULL AND stripe_account_status = 'active'
            ORDER BY id DESC LIMIT 3`
        );
        for (const row of r.rows) {
          try {
            await stripe.accounts.retrieve(row.stripe_account_id);
          } catch (e) {
            if (e && (e.code === 'resource_missing' || e.statusCode === 404 || e.statusCode === 403)) {
              return {
                ...stat, ok: false,
                reason: `Connect account ${row.stripe_account_id} not found under this ${stat.mode}-mode key — key/account mode mismatch`,
              };
            }
            // Transient/network errors: don't fail the mode check on them.
          }
        }
      } catch (_) { /* coaches table may not exist yet */ }
    }
    return { ...stat, ok: true, reason: `key + Stripe agree (${stat.mode} mode)` };
  } catch (e) {
    // Network/API failure — key mode itself already validated statically.
    return { ...stat, reason: `static check ok (${stat.mode}); live verification unavailable: ${e.message}` };
  }
}

// Startup gate. Exits the process on mismatch unless overridden.
function enforceKeyModeAtStartup({ exit = (code) => process.exit(code) } = {}) {
  const stat = checkKeyModeStatic();
  if (stat.ok) {
    if (stat.mode) console.log(`[Stripe] Key mode OK — ${stat.mode} key matches NODE_ENV=${process.env.NODE_ENV || '(unset)'}`);
    return stat;
  }
  const msg = `[Stripe] KEY MODE MISMATCH: ${stat.reason}`;
  if (process.env.STRIPE_ALLOW_MODE_MISMATCH === '1') {
    console.error(`${msg} — continuing because STRIPE_ALLOW_MODE_MISMATCH=1`);
    return stat;
  }
  console.error(`${msg} — refusing to start. Set the correct key, or set STRIPE_ALLOW_MODE_MISMATCH=1 to override (dangerous).`);
  exit(1);
  return stat;
}

module.exports = { getKeyMode, expectedModeForEnv, checkKeyModeStatic, checkKeyMode, enforceKeyModeAtStartup };
