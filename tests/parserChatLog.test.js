'use strict';

// Task #363 — chat log capture in ReplayParser._aggregateStats.
// We exercise the aggregator directly with a synthetic event stream so we
// don't need the Java jar / live parser service. Asserts: chat + chatwheel
// events are pulled out of the main event loop, slot mapping survives,
// per-line text is truncated, and the hard line cap is honoured.

const test = require('node:test');
const assert = require('node:assert');

// Avoid pulling node-fetch (ESM-only on newer versions) into the test
// process via the constructor's `require('node-fetch')` at the top of the
// module — we never call any of the network methods.
const Module = require('module');
const originalResolve = Module._resolve_filename || Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'node-fetch') return require.resolve('./fixtures/noopFetch.js');
  return originalResolve.call(this, request, ...rest);
};

// Tiny fixture so the require above resolves cleanly. Created lazily.
const fs = require('node:fs');
const path = require('node:path');
const fixDir = path.join(__dirname, 'fixtures');
if (!fs.existsSync(fixDir)) fs.mkdirSync(fixDir, { recursive: true });
const noopFetchPath = path.join(fixDir, 'noopFetch.js');
if (!fs.existsSync(noopFetchPath)) {
  fs.writeFileSync(noopFetchPath, 'module.exports = function noopFetch() { throw new Error("network disabled in test"); };\n');
}

const { getReplayParser } = require('../src/replay/replayParser');

function baseEvents() {
  // Minimum events to make _aggregateStats not crash: needs an epilogue with
  // dota.matchId + 10 player_slot entries. We only assert on chatLog so we
  // intentionally keep this minimal.
  return [
    {
      type: 'epilogue',
      key: JSON.stringify({
        gameInfo: {
          dota: { matchId: 9999000001, gameMode: 22, endTime: 1700000000 },
        },
      }),
    },
  ];
}

test('chat + chatwheel events are captured into chatLog with slot mapping', () => {
  const parser = getReplayParser();
  const events = baseEvents().concat([
    { type: 'chat',      time: 30,  slot: 3, key: 'gg ez',          unit: '' },
    { type: 'chatwheel', time: 45,  slot: 7, key: '85',             unit: '' },
    { type: 'chat',      time: 600, slot: 5, key: 'nice mid',       unit: '' },
    { type: 'chat',      time: 90,  slot: -1, key: 'announcer msg', unit: 'PlayerBlue' }, // legacy: no slot
    { type: 'chat',      time: 1,   slot: 2, key: '',               unit: '' }, // empty: skipped
    { type: 'chat',      time: 2,   slot: 9, key: null,             unit: '' }, // null:  skipped
  ]);
  const result = parser._aggregateStats(events);
  assert.ok(result.chatLog, 'chatLog should be present on output');
  // 4 valid lines, sorted by time
  assert.deepStrictEqual(
    result.chatLog.map((c) => [c.t, c.slot, c.type, c.text]),
    [
      [30,  3, 'chat',      'gg ez'],
      [45,  7, 'chatwheel', '85'],
      [90, -1, 'chat',      'announcer msg'],
      [600, 5, 'chat',      'nice mid'],
    ],
  );
});

test('chat lines are truncated to 512 chars and capped to 500 lines per match', () => {
  const parser = getReplayParser();
  const longText = 'x'.repeat(2000);
  const flood = [];
  for (let i = 0; i < 600; i++) flood.push({ type: 'chat', time: i, slot: i % 10, key: longText });
  const events = baseEvents().concat(flood);
  const result = parser._aggregateStats(events);
  assert.ok(result.chatLog, 'chatLog populated');
  assert.strictEqual(result.chatLog.length, 500, 'line cap enforced');
  for (const line of result.chatLog) {
    assert.ok(line.text.length <= 512, `text length ${line.text.length} exceeds 512`);
  }
});

test('zero chat events → chatLog is null (so DB column stays NULL)', () => {
  const parser = getReplayParser();
  const result = parser._aggregateStats(baseEvents());
  assert.strictEqual(result.chatLog, null);
});
