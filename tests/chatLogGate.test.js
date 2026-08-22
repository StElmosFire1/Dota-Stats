'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  compactMatchListRow,
  sanitizeMatchDetail,
} = require('../src/web/replayPayload');

function sampleMatch() {
  return {
    match_id: '1',
    radiant_win: true,
    players: [{ account_id: '111' }, { account_id: '222' }],
    game_timeline: {
      players: [{ slot: 0, positions: [{ t: 10, x: 1, y: 2 }] }],
      events: [{ type: 'kill', t: 30, victimSlot: 5 }],
    },
    chat_log: [
      { t: 30, slot: 0, type: 'chat', text: 'private free text' },
      { t: 31, slot: 0, type: 'chatwheel', key: 'well_played' },
      { t: 32, type: 'system', state: 'pause' },
    ],
  };
}

test('detail: flag=off strips chat even for staff', () => {
  const body = sanitizeMatchDetail(sampleMatch(), {
    accountId: '111',
    isStaff: true,
    chatFlagState: 'off',
  });
  assert.strictEqual(body.chat_log, undefined);
  assert.strictEqual(body.chat_log_state, undefined);
});

test('detail: preview exposes text only to staff', () => {
  const publicBody = sanitizeMatchDetail(sampleMatch(), {
    chatFlagState: 'preview',
  });
  assert.strictEqual(publicBody.chat_log, undefined);

  const participantBody = sanitizeMatchDetail(sampleMatch(), {
    accountId: '111',
    chatFlagState: 'preview',
  });
  assert.strictEqual(participantBody.chat_log, undefined);

  const staffBody = sanitizeMatchDetail(sampleMatch(), {
    accountId: '999',
    isStaff: true,
    chatFlagState: 'preview',
  });
  assert.strictEqual(staffBody.chat_log.length, 3);
  assert.strictEqual(staffBody.chat_log_state, 'preview');
});

test('detail: flag=on remains fail-closed for anonymous callers', () => {
  const body = sanitizeMatchDetail(sampleMatch(), { chatFlagState: 'on' });
  assert.strictEqual(body.chat_log, undefined);
  assert.strictEqual(body.chat_log_state, undefined);
});

test('detail: participant sees non-text events only when fully enabled', () => {
  const body = sanitizeMatchDetail(sampleMatch(), {
    accountId: '111',
    chatFlagState: 'on',
  });
  assert.deepStrictEqual(body.chat_log.map(event => event.type), ['chatwheel', 'system']);
  assert.ok(body.chat_log.every(event => event.text == null));
  assert.strictEqual(body.chat_log_state, 'participant');
});

test('detail: invalid or missing flag state fails closed', () => {
  const body = sanitizeMatchDetail(sampleMatch(), {
    accountId: '111',
    isStaff: true,
    chatFlagState: undefined,
  });
  assert.strictEqual(body.chat_log, undefined);
});

test('list: replay payload is compact and chat-free', () => {
  const body = compactMatchListRow(sampleMatch());
  assert.strictEqual(body.chat_log, undefined);
  assert.strictEqual(body.game_timeline, undefined);
  assert.deepStrictEqual(body.kill_timeline, [[30, 1]]);
});