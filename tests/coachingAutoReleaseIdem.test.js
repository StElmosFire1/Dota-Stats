// Task #855 — the coaching auto-release cron's Stripe capture must carry an
// idempotency key so a retried/raced capture for the same booking replays the
// first Stripe response instead of double-capturing.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

function stubModule(specifier, exports, fromPath = __filename) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

test('auto-release cron capture passes idem key; DB flip only after capture', async () => {
  const captures = [];
  const released = [];

  // Stub stripe BEFORE bot.js's lazy require('stripe')(key) runs.
  stubModule('stripe', () => ({
    paymentIntents: {
      capture: async (pi, opts) => { captures.push({ pi, opts }); return { id: pi, status: 'succeeded' }; },
    },
  }));

  const dbStub = {
    async getFeatureFlag() { return { state: 'on' }; },
    async listAutoReleasableBookings() {
      return [{ id: 'b1', stripe_payment_intent: 'pi_auto_1' }];
    },
    async autoReleaseBooking(id) { released.push(id); return { id, status: 'completed' }; },
  };
  const proxiedDb = new Proxy(dbStub, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return async () => null;
    },
  });
  const dbPath = require.resolve('../src/db');
  delete require.cache[dbPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: proxiedDb };

  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

  // Capture the cron tick instead of letting a real interval run.
  const origSetInterval = global.setInterval;
  let tick = null;
  global.setInterval = (fn, ms) => {
    tick = fn;
    const id = origSetInterval(() => {}, 2 ** 30);
    if (id && typeof id.unref === 'function') id.unref();
    return id;
  };
  let bot;
  try {
    delete require.cache[require.resolve('../src/discord/bot')];
    const { getDiscordBot } = require('../src/discord/bot');
    bot = getDiscordBot();
    bot.startCoachingAutoReleaseCron();
  } finally {
    global.setInterval = origSetInterval;
  }
  assert.equal(typeof tick, 'function', 'cron tick registered');

  await tick();

  assert.equal(captures.length, 1);
  assert.equal(captures[0].pi, 'pi_auto_1');
  assert.equal(captures[0].opts?.idempotencyKey, 'oi:booking-capture:b1');
  // Same key as the confirm-completion route's capture for this booking.
  const { idemKey } = require('../src/payments/stripeIdem');
  assert.equal(captures[0].opts.idempotencyKey, idemKey('booking-capture', 'b1'));
  // DB flip happened only after a successful capture.
  assert.deepEqual(released, ['b1']);

  // Second tick (same booking still returned) re-captures with the SAME key —
  // Stripe would replay the original response, so no double charge.
  await tick();
  assert.equal(captures.length, 2);
  assert.equal(captures[1].opts?.idempotencyKey, captures[0].opts.idempotencyKey);

  await bot.shutdown?.().catch?.(() => {});
});
