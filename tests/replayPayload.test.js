'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCompactKillTimeline,
  compactMatchListRow,
  isMatchParticipant,
  resolveReplayIntelligenceContext,
  sanitizeMatchDetail,
} = require('../src/web/replayPayload');

function sampleMatch() {
  return {
    match_id: '42',
    replay_path: '/srv/private/42.dem',
    replay_file_path: '/tmp/replays/42.dem',
    chat_log: [
      { t: 1, slot: 0, type: 'chat', text: 'secret text' },
      { t: 2, slot: 0, type: 'chatwheel', text: '7' },
      { t: 3, slot: -1, type: 'system', text: 'pause' },
    ],
    players: [{ account_id: '100', player_slot: 0 }],
    game_timeline: {
      players: [{
        slot: 0,
        positions: [{ t: 0, x: 1, y: 2 }],
        positionTrail: [{ t: 1, x: 2, y: 3 }],
        samples: [{ t: 30, nw: 1200 }],
      }],
      events: [
        { type: 'kill', t: 20, victimSlot: 5 },
        { type: 'roshan', t: 30 },
        { type: 'kill', t: 10, victimSlot: 4 },
      ],
    },
  };
}

test('buildCompactKillTimeline emits sorted bounded kill tuples', () => {
  assert.deepEqual(buildCompactKillTimeline(sampleMatch().game_timeline), [
    [10, -1],
    [20, 1],
  ]);
  assert.deepEqual(buildCompactKillTimeline(JSON.stringify(sampleMatch().game_timeline), 1), [
    [10, -1],
  ]);
});

test('compactMatchListRow removes heavyweight and private fields', () => {
  const compact = compactMatchListRow(sampleMatch());
  assert.deepEqual(compact.kill_timeline, [[10, -1], [20, 1]]);
  assert.equal(compact.game_timeline, undefined);
  assert.equal(compact.chat_log, undefined);
  assert.equal(compact.replay_path, undefined);
  assert.equal(compact.replay_file_path, undefined);
});

test('participant matching uses exact registered account ids', () => {
  const match = sampleMatch();
  assert.equal(isMatchParticipant(match, '100'), true);
  assert.equal(isMatchParticipant(match, 100), true);
  assert.equal(isMatchParticipant(match, '10'), false);
  assert.equal(isMatchParticipant(match, null), false);
});

test('replay intelligence context is based on staff or exact participation only', () => {
  const match = sampleMatch();
  assert.equal(resolveReplayIntelligenceContext(match, { isStaff: true }), 'admin');
  assert.equal(resolveReplayIntelligenceContext(match, { accountId: '100' }), 'participant');
  assert.equal(resolveReplayIntelligenceContext(match, { accountId: '999' }), 'public');
  assert.equal(resolveReplayIntelligenceContext(match, {}), 'public');
});

test('public detail strips chat, raw replay paths and exact movement trails', () => {
  const safe = sanitizeMatchDetail(sampleMatch(), { chatFlagState: 'on' });
  assert.equal(safe.chat_log, undefined);
  assert.equal(safe.replay_path, undefined);
  assert.equal(safe.replay_file_path, undefined);
  assert.equal(safe.game_timeline.players[0].positions, undefined);
  assert.equal(safe.game_timeline.players[0].positionTrail, undefined);
  assert.deepEqual(safe.game_timeline.players[0].samples, [{ t: 30, nw: 1200 }]);
  assert.equal(safe.replay_detail_level, 'public');
});

test('participant sees non-text communication only when the flag is on', () => {
  const safe = sanitizeMatchDetail(sampleMatch(), {
    accountId: '100',
    chatFlagState: 'on',
  });
  assert.deepEqual(safe.chat_log.map((event) => event.type), ['chatwheel', 'system']);
  assert.equal(safe.chat_log.some((event) => event.type === 'chat'), false);
  assert.equal(safe.chat_log_state, 'participant');
  assert.equal(safe.replay_detail_level, 'participant');

  const preview = sanitizeMatchDetail(sampleMatch(), {
    accountId: '100',
    chatFlagState: 'preview',
  });
  assert.equal(preview.chat_log, undefined);
});

test('staff preview may inspect bounded chat while public callers cannot', () => {
  const safe = sanitizeMatchDetail(sampleMatch(), {
    isStaff: true,
    chatFlagState: 'preview',
  });
  assert.equal(safe.chat_log.length, 3);
  assert.equal(safe.chat_log_state, 'preview');
  assert.equal(safe.replay_detail_level, 'staff');
});