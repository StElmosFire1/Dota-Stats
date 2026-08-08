// Task #855 — Stripe key-mode validation unit tests (static, no network).

const test = require('node:test');
const assert = require('node:assert/strict');

const { getKeyMode, checkKeyModeStatic, enforceKeyModeAtStartup } =
  require('../src/payments/stripeKeyMode');

test('getKeyMode classifies key prefixes', () => {
  assert.equal(getKeyMode('sk_live_abc'), 'live');
  assert.equal(getKeyMode('sk_test_abc'), 'test');
  assert.equal(getKeyMode('rk_live_abc'), 'live');
  assert.equal(getKeyMode('rk_test_abc'), 'test');
  assert.equal(getKeyMode('whsec_abc'), null);
  assert.equal(getKeyMode(''), null);
  assert.equal(getKeyMode(null), null);
});

test('static check: matching modes pass', () => {
  assert.equal(checkKeyModeStatic({ key: 'sk_live_x', nodeEnv: 'production' }).ok, true);
  assert.equal(checkKeyModeStatic({ key: 'sk_test_x', nodeEnv: 'development' }).ok, true);
  assert.equal(checkKeyModeStatic({ key: 'sk_test_x', nodeEnv: undefined }).ok, true);
});

test('static check: test key in production fails', () => {
  const r = checkKeyModeStatic({ key: 'sk_test_x', nodeEnv: 'production' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /test-mode key/);
});

test('static check: live key outside production fails', () => {
  const r = checkKeyModeStatic({ key: 'sk_live_x', nodeEnv: 'development' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /live-mode key/);
});

test('static check: no key is ok (payments disabled)', () => {
  const r = checkKeyModeStatic({ key: '', nodeEnv: 'production' });
  assert.equal(r.ok, true);
  assert.equal(r.mode, null);
});

test('static check: unrecognized key format fails', () => {
  const r = checkKeyModeStatic({ key: 'not-a-stripe-key', nodeEnv: 'production' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /unrecognized/);
});

test('startup gate exits on mismatch, passes on match, honors override', () => {
  const origKey = process.env.STRIPE_SECRET_KEY;
  const origEnv = process.env.NODE_ENV;
  const origOverride = process.env.STRIPE_ALLOW_MODE_MISMATCH;
  try {
    // Mismatch → exit(1)
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.NODE_ENV = 'production';
    delete process.env.STRIPE_ALLOW_MODE_MISMATCH;
    let exitCode = null;
    enforceKeyModeAtStartup({ exit: (c) => { exitCode = c; } });
    assert.equal(exitCode, 1);

    // Override → no exit
    process.env.STRIPE_ALLOW_MODE_MISMATCH = '1';
    exitCode = null;
    enforceKeyModeAtStartup({ exit: (c) => { exitCode = c; } });
    assert.equal(exitCode, null);

    // Match → no exit
    delete process.env.STRIPE_ALLOW_MODE_MISMATCH;
    process.env.STRIPE_SECRET_KEY = 'sk_live_x';
    exitCode = null;
    enforceKeyModeAtStartup({ exit: (c) => { exitCode = c; } });
    assert.equal(exitCode, null);
  } finally {
    if (origKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = origKey;
    if (origEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = origEnv;
    if (origOverride === undefined) delete process.env.STRIPE_ALLOW_MODE_MISMATCH; else process.env.STRIPE_ALLOW_MODE_MISMATCH = origOverride;
  }
});
