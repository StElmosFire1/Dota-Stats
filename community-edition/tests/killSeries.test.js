// Task #763 — kill-advantage sparkline series derivation (match cards).
// The ESM util lives in web/src/utils/killSeries.js; import it dynamically.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const utilPath = path.join(__dirname, '..', 'web', 'src', 'utils', 'killSeries.js');
const load = () => import(utilPath).then(m => m.deriveKillSeries);

const kill = (t, victimSlot) => ({ t, type: 'kill', victimSlot, killerSlot: 0, assistSlots: [] });

test('null when no timeline or events', async () => {
  const deriveKillSeries = await load();
  assert.strictEqual(deriveKillSeries(null, 100), null);
  assert.strictEqual(deriveKillSeries({}, 100), null);
  assert.strictEqual(deriveKillSeries({ events: [] }, 100), null);
  assert.strictEqual(deriveKillSeries({ events: [{ t: 5, type: 'roshan' }] }, 100), null);
});

test('single valid kill still renders a series', async () => {
  const deriveKillSeries = await load();
  const s = deriveKillSeries({ events: [kill(30, 7)] }, 120);
  assert.deepStrictEqual(s.points, [{ t: 0, d: 0 }, { t: 30, d: 1 }, { t: 120, d: 1 }]);
});

test('victimSlot boundary + invalid events skipped', async () => {
  const deriveKillSeries = await load();
  const s = deriveKillSeries({ events: [kill(10, 4), kill('bad', 5), kill(15, 12), kill(20, 5)] }, 60);
  assert.deepStrictEqual(s.points, [
    { t: 0, d: 0 }, { t: 10, d: -1 }, { t: 20, d: 0 }, { t: 60, d: 0 },
  ]);
  assert.strictEqual(s.maxAbs, 1);
});
