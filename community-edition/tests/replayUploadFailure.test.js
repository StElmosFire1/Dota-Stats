const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const db = require('../src/db');
const { getReplayParser } = require('../src/replay/replayParser');
const { parserError } = require('../src/replay/parserResponse');
const { processReplayInternal } = require('../src/web/server');
const { getDiscordBot } = require('../src/discord/bot');

test('web upload reports malformed replay without deleting an existing match or changing stats/ratings', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bad-replay-upload-'));
  const file = path.join(dir, 'bad.dem');
  fs.writeFileSync(file, 'not a replay');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const parser = getReplayParser();
  t.mock.method(parser, '_sendToParser', async () => '{"type":"interval","time":1}\n');
  const ready = parser.parserReady;
  parser.parserReady = true;
  t.after(() => { parser.parserReady = ready; });
  t.mock.method(db, 'isFileHashRecorded', async () => 'existing-match');
  const logs = [];
  t.mock.method(db, 'logServerError', async (...args) => logs.push(args));
  for (const method of ['deleteMatch', 'recordMatch', 'reparseMatchFromStats', 'recalculateAllRatings']) {
    t.mock.method(db, method, () => assert.fail(`${method} must not run for a failed parse`));
  }
  await assert.rejects(processReplayInternal(file, 'test'), error => {
    assert.match(error.message, /incomplete replay data/);
    assert.match(error.message, /Re-download/);
    assert.doesNotMatch(error.message, /curl|connection reset|SyntaxError/);
    return true;
  });
  assert.equal(fs.existsSync(file), false, 'failed upload is cleaned up');
  assert.equal(logs.length, 1, 'failure is logged on the server');
});

test('Discord shows actionable parse failure and never falls back to recording header data', async t => {
  const parser = getReplayParser();
  const bot = getDiscordBot();
  const ready = parser.parserReady;
  parser.parserReady = true;
  t.after(() => { parser.parserReady = ready; });
  t.mock.method(parser, 'downloadReplay', async () => '/tmp/synthetic-bad.dem');
  t.mock.method(parser, 'parseReplayFull', async () => {
    throw parserError('REPLAY_DECODE_FAILED', 'private decoder stack');
  });
  let cleaned = false;
  t.mock.method(parser, 'cleanup', () => { cleaned = true; });
  t.mock.method(parser, 'parseReplayHeader', () => assert.fail('must not fall back after decode failure'));
  for (const method of ['_recordMatchData', '_processRatings', '_markRecorded', '_sendMatchSummary']) {
    t.mock.method(bot, method, () => assert.fail(`${method} must not run`));
  }
  const edits = [];
  const msg = {
    author: { username: 'test' },
    reply: async () => ({ edit: async text => edits.push(text) }),
    channel: { send: async () => assert.fail('should edit upload status, not silently retry') },
  };
  await bot._handleReplayUpload(msg, { url: 'https://example.invalid/bad.dem' });
  assert.match(edits.at(-1), /could not be decoded.*Re-download/);
  assert.doesNotMatch(edits.at(-1), /private|connection reset|curl/);
  assert.equal(cleaned, true);
});
