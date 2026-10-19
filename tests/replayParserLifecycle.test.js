const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const { ParserServiceClient } = require('../src/replay/parserServiceClient');

const health = {
  service: 'oi-replay-parser', protocolVersion: 1, status: 'ok',
  buildSha256: 'a'.repeat(64), pid: 123,
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(30);
  }
  assert.fail('timed out waiting for parser state');
}

test('both actual edition clients are read-only, recover, and never evict an unhealthy listener', async t => {
  let response = health;
  let status = 200;
  const server = http.createServer((req, res) => {
    assert.equal(req.url, '/healthz');
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [
    require('../src/replay/replayParser').getReplayParser(),
    require('../community-edition/src/replay/replayParser').getReplayParser(),
  ];
  t.after(() => {
    clients.forEach(client => client.shutdown());
    server.close();
  });
  for (const client of clients) {
    client.parserUrl = url;
    client._healthIntervalMs = 30;
    assert.equal(await client.startParserService(), true);
    assert.equal(client.parserHealth.buildSha256, health.buildSha256);
    assert.ok(client instanceof ParserServiceClient);
  }
  status = 503;
  await until(() => clients.every(client => !client.parserReady));
  assert.equal(server.listening, true);
  status = 200;
  response = 'ok'; // old/unknown service must not be adopted
  assert.equal(await clients[0].startParserService(), false);
  response = { ...health, protocolVersion: 99 };
  assert.equal(await clients[0].startParserService(), false);
  response = { ...health, buildSha256: 'b'.repeat(64) };
  await until(() => clients.every(client => client.parserReady));
  clients[0].shutdown();
  assert.equal(await clients[1].startParserService(), true);
  assert.equal(server.listening, true);
  assert.equal(clients[0].parserReady, false);
  assert.equal(await clients[0].startParserService(), false);
  // Creating a new app instance has no effect on the listener or the other app.
  const restarted = new clients[0].constructor();
  restarted.parserUrl = url;
  t.after(() => restarted.shutdown());
  assert.equal(await restarted.startParserService(), true);
  assert.equal(clients[1].parserReady, true);
  for (const file of ['src/replay/replayParser.js', 'community-edition/src/replay/replayParser.js',
    'src/replay/parserServiceClient.js']) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    assert.doesNotMatch(source, /fuser|\.kill\(|spawn\(|_launchParser|PARSER_JAR/);
  }
});

test('absent service, bounded hung health checks and shutdown during a check settle safely', async t => {
  const server = http.createServer((req, res) => {
    setTimeout(() => res.end(JSON.stringify(health)), 150);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const client = new ParserServiceClient({ url, timeoutMs: 50 });
  t.after(() => { client.shutdown(); server.closeAllConnections(); server.close(); });
  assert.equal(await client.startParserService(), false);
  client._healthTimeoutMs = 500;
  const pending = client.startParserService();
  client.shutdown();
  assert.equal(await pending, false);
  assert.equal(client.parserReady, false);
  await new Promise(resolve => server.close(resolve));
  const absent = new ParserServiceClient({ url, timeoutMs: 50 });
  t.after(() => absent.shutdown());
  assert.equal(await absent.startParserService(), false);
});

test('packaged Java identity, duplicate-owner bind refusal, crash and restart recovery', { timeout: 30000 }, async t => {
  const jar = path.resolve(__dirname, '../odota-parser/target/stats-0.1.0.jar');
  const sha = createHash('sha256').update(fs.readFileSync(jar)).digest('hex');
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const url = `http://127.0.0.1:${port}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parser-owner-'));
  const log = path.join(dir, 'parser.log');
  const fd = fs.openSync(log, 'a');
  const children = [];
  const start = () => {
    const child = spawn('java', [`-Dparser.port=${port}`, '-jar', jar], {
      stdio: ['ignore', fd, fd],
    });
    children.push(child);
    return child;
  };
  const client = new ParserServiceClient({ url, intervalMs: 30, timeoutMs: 200 });
  t.after(async () => {
    client.shutdown();
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGKILL');
        await exited;
      }
    }
    fs.closeSync(fd);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  assert.equal(await client.startParserService(), false);
  const first = start();
  await until(() => client.parserReady);
  assert.equal(client.parserHealth.pid, first.pid);
  assert.equal(client.parserHealth.buildSha256, sha);
  const duplicate = start();
  const [code] = await once(duplicate, 'exit');
  assert.notEqual(code, 0);
  assert.equal(await client.startParserService(), true);
  assert.equal(client.parserHealth.pid, first.pid);
  const exited = once(first, 'exit');
  first.kill('SIGKILL'); // emulate a crash; only the independent owner restarts it
  await exited;
  await until(() => !client.parserReady);
  const recovered = start();
  await until(() => client.parserReady);
  assert.equal(client.parserHealth.pid, recovered.pid);
  assert.equal(client.parserHealth.buildSha256, sha);
  const logs = fs.readFileSync(log, 'utf8');
  assert.match(logs, /BindException/);
  assert.match(logs, new RegExp(`build=${sha}`));
});

test('service owns only its process group and retains rotating logs outside either checkout', () => {
  const unit = fs.readFileSync(path.resolve(__dirname, '../ops/replay-parser/replay-parser.service'), 'utf8');
  assert.match(unit, /Restart=on-failure/);
  assert.match(unit, /KillMode=control-group/);
  assert.match(unit, /ExecStart=\/usr\/bin\/java -jar \/opt\/oi-replay-parser\/current.jar/);
  assert.match(unit, /StandardError=append:\/var\/log\/oi-replay-parser\/stderr.log/);
  assert.doesNotMatch(unit, /fuser|pkill|ExecStartPre=.*kill/);
  assert.match(fs.readFileSync(path.resolve(__dirname, '../ops/replay-parser/logrotate.conf'), 'utf8'), /rotate 14/);
});
