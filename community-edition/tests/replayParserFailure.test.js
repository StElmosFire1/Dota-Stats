const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { requestReplay, decodeEvents } = require('../src/replay/parserResponse');
const { getReplayParser } = require('../src/replay/replayParser');

const complete = '{"type":"interval","time":1}\n{"type":"epilogue","key":"{}"}\n';

test('strict event decoder rejects empty, partial, malformed and error-shaped results', () => {
  for (const text of [
    '', '\n', '{"type":"interval"}\n', complete + '{"type":',
    '{"ok":false,"error":{"code":"REPLAY_DECODE_FAILED"}}',
    complete + '\nnull', complete + '\n[]', complete + '\n{}',
  ]) {
    assert.throws(() => decodeEvents(text), { code: /REPLAY_INCOMPLETE|PARSER_RESPONSE_INVALID/ });
  }
  assert.equal(decodeEvents(complete).length, 2);
});

test('HTTP failures, legacy 200s and broken responses never become parser success', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parser-response-'));
  const file = path.join(dir, 'bad.dem');
  fs.writeFileSync(file, 'malformed replay');
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      switch (req.url) {
        case '/decode':
          res.writeHead(422, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            ok: false, error: { code: 'REPLAY_DECODE_FAILED', message: 'private exception /server/path', requestId: 'test-id' },
          }));
        case '/http-error':
          res.writeHead(500);
          return res.end('private stack trace');
        case '/legacy':
          return res.end(complete);
        case '/disconnect':
          res.writeHead(200, { 'Content-Length': '9999', 'X-Replay-Parse-Complete': '1' });
          res.write(complete);
          return setImmediate(() => res.destroy());
        default:
          res.writeHead(200, { 'X-Replay-Parse-Complete': '1' });
          return res.end(complete);
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const [route, code] of [
    ['/decode', 'REPLAY_DECODE_FAILED'],
    ['/http-error', 'PARSER_RESPONSE_INVALID'],
    ['/legacy', 'REPLAY_INCOMPLETE'],
    ['/disconnect', 'PARSER_UNAVAILABLE'],
  ]) {
    await assert.rejects(requestReplay(file, url + route), error => {
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /private|stack trace|ECONNRESET|curl/);
      return true;
    });
  }
  assert.equal(await requestReplay(file, url + '/success'), complete);
});

test('partial data cannot reach aggregation, hashing, or match recording', async t => {
  const parser = getReplayParser();
  const originals = {
    parserReady: parser.parserReady, _sendToParser: parser._sendToParser,
    startParserService: parser.startParserService,
    _aggregateStats: parser._aggregateStats, computeFileHash: parser.computeFileHash,
  };
  t.after(() => Object.assign(parser, originals));
  parser.parserReady = true;
  parser.startParserService = async () => true; // transport/decoder test, not a health test
  parser.computeFileHash = () => assert.fail('must not hash rejected response');
  parser._aggregateStats = () => assert.fail('must not aggregate rejected response');
  for (const partial of ['{"type":"interval"}\n', complete + '{broken', '{"ok":false}']) {
    parser._sendToParser = async () => partial;
    await assert.rejects(parser.parseReplayFull(__filename), { code: /REPLAY_INCOMPLETE|PARSER_RESPONSE_INVALID/ });
  }
  parser._sendToParser = async () => complete;
  parser.computeFileHash = () => 'hash';
  parser._aggregateStats = events => ({ matchId: '123', count: events.length });
  assert.deepEqual(await parser.parseReplayFull(__filename), { matchId: '123', count: 2, fileHash: 'hash' });
});

test('Java HTTP handler returns structured failures for real malformed replays', { timeout: 60000 }, () => {
  const root = path.resolve(__dirname, '../..');
  const jar = path.join(root, 'odota-parser/target/stats-0.1.0.jar');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parser-java-test-'));
  try {
    execFileSync('javac', ['-proc:none', '-cp', jar, '-d', dir,
      path.join(root, 'odota-parser/src/test/java/opendota/ReplayHttpContractTest.java')], { timeout: 30000 });
    const output = execFileSync('java', ['-cp', `${dir}${path.delimiter}${jar}`, 'opendota.ReplayHttpContractTest'],
      { encoding: 'utf8', timeout: 30000 });
    assert.match(output, /Replay HTTP contract passed/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
