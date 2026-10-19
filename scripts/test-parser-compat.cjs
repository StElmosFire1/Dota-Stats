// Usage: node scripts/test-parser-compat.cjs replay.dem expectedMatchId [parser.jar]
// Offline/local-only: never starts the app or writes match records.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, execFile, execFileSync } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const [fixture, expectedMatch, jar = 'odota-parser/target/stats-0.1.0.jar'] = process.argv.slice(2);
if (!fixture || !expectedMatch) throw Error('Supply replay.dem and expected match ID');
fs.mkdirSync('generated-artifacts/parser-compat', { recursive: true });
const dir = fs.mkdtempSync('generated-artifacts/parser-compat/run-');
const eventsPath = path.join(dir, 'events.jsonl');
// Compile onto the same classloader as the production package-private handlers.
execFileSync('javac', ['-proc:none', '-cp', jar, '-d', dir, 'scripts/ReplayHttpProbe.java']);
const log = fs.createWriteStream(path.join(dir, 'http-parser.log'));
const child = spawn('java', ['-Xmx1536m', '-cp', jar + path.delimiter + dir, 'opendota.ReplayHttpProbe'], { stdio: ['ignore', 'pipe', 'pipe'] });
child.stderr.pipe(log);
const originalLog = console.log, originalWarn = console.warn;
const aggregateLog = fs.openSync(path.join(dir, 'aggregation.log'), 'w');
(async () => {
  try {
    const port = await new Promise((resolve, reject) => {
      let text = '';
      const timeout = setTimeout(() => reject(Error('Test parser startup timed out')), 30000);
      child.on('error', e => { clearTimeout(timeout); reject(e); });
      child.on('exit', code => { clearTimeout(timeout); reject(Error(`Parser exited: ${code}`)); });
      child.stdout.on('data', chunk => {
        text += chunk;
        const match = text.match(/TEST_PORT=(\d+)/);
        if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
      });
    });
    const base = `http://127.0.0.1:${port}`;
    const health = await run('curl', ['-fsS', '--max-time', '5', base + '/healthz']);
    assert.equal(health.stdout, 'ok');
    await run('curl', ['-f', '-s', '-S', '--max-time', '600', '--connect-timeout', '10',
      '-X', 'POST', '-H', 'Content-Type: application/octet-stream', '--data-binary', `@${fixture}`,
      '-o', eventsPath, base + '/'], { timeout: 660000 });
    const events = fs.readFileSync(eventsPath, 'utf8').trim().split('\n').map(JSON.parse);
    assert(events.length > 1000, 'Expected populated replay data');
    const counts = {};
    for (const e of events) counts[e.type] = (counts[e.type] || 0) + 1;
    assert(counts.obs > 0, 'Observer placement events missing');
    assert(counts.obs_left > 0, 'Observer removal events missing');
    assert(counts.sen > 0, 'Sentry placement events missing');
    const results = [];
    console.log = console.warn = (...args) => fs.writeSync(aggregateLog, args.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n');
    for (const edition of ['community-edition/', '']) {
      const parser = require(path.resolve(edition + 'src/replay/replayParser.js')).getReplayParser();
      const stats = parser._aggregateStats(events);
      assert.equal(String(stats.matchId), expectedMatch);
      assert.equal(stats.players.length, 10);
      assert(stats.duration > 0);
      assert.equal(typeof stats.radiantWin, 'boolean');
      assert.equal(new Set(stats.players.map(p => p.slot)).size, 10);
      assert(stats.players.some(p => p.wardPlacements?.length > 0), 'Ward stats missing');
      for (const p of stats.players) for (const field of ['kills', 'deaths', 'assists', 'goldPerMin', 'xpPerMin'])
        assert(Number.isFinite(p[field]) && p[field] >= 0, `Invalid ${field}`);
      results.push({ edition: edition ? 'community' : 'full', matchId: stats.matchId,
        duration: stats.duration, radiantWin: stats.radiantWin, players: stats.players.length });
    }
    console.log = originalLog; console.warn = originalWarn;
    const report = { passed: true, eventCount: events.length, wardEvents: { obs: counts.obs, obs_left: counts.obs_left, sen: counts.sen }, results };
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log('Evidence:', dir);
  } finally {
    console.log = originalLog; console.warn = originalWarn;
    fs.closeSync(aggregateLog);
    child.kill('SIGTERM');
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
