// Integration test: spawn the *actual* Java parser jar against a known Dota 2
// replay and verify timeline_v1 PERF cumulative fields flow end-to-end.
//
// This is the loud-failure hook against an un-rebuilt parser jar: if the
// running jar stops emitting hero_damage_cumulative / tower_damage_cumulative
// / wards_killed_cumulative on interval entries, this test fails immediately.
//
// Prerequisites (test skips cleanly when any are missing — the fast
// fixture-driven unit tests in perfTimelineParserCumulative.test.js still
// guard the JS aggregator behaviour):
//   - `java` on PATH
//   - `odota-parser/target/stats-0.1.0.jar` built
//   - Network access to https://odota.github.io/testfiles/1781962623_1.dem
//     (the canonical OpenDota test replay; cached at /tmp/odota-test.dem
//     after first successful download for fast subsequent runs).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const http = require('http');
const https = require('https');

const { getReplayParser } = require('../src/replay/replayParser');
const { computeTimelinePerf } = require('../src/perf/perfTimeline');

const PARSER_JAR = path.join(__dirname, '..', 'odota-parser', 'target', 'stats-0.1.0.jar');
const REPLAY_URL = 'https://odota.github.io/testfiles/1781962623_1.dem';
const REPLAY_CACHE = '/tmp/odota-test-1781962623.dem';
const PARSER_PORT = 5601; // distinct from production 5600 to avoid clashes
const REPLAY_DOWNLOAD_TIMEOUT_MS = 60_000;
const PARSER_BOOT_TIMEOUT_MS = 30_000;
const PARSER_PARSE_TIMEOUT_MS = 240_000;

function _have(cmd) {
  const r = spawnSync('which', [cmd], { encoding: 'utf8' });
  return r.status === 0 && (r.stdout || '').trim().length > 0;
}

function _download(url, dest, timeoutMs) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return _download(res.headers.location, dest, timeoutMs).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('download status ' + res.statusCode));
      }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(dest)));
      out.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('download timed out')));
  });
}

async function _waitHealthy(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise(res => {
      const req = http.get(`http://127.0.0.1:${port}/healthz`, r => {
        let buf = '';
        r.on('data', c => buf += c);
        r.on('end', () => res(r.statusCode === 200 && buf.trim() === 'ok'));
      });
      req.on('error', () => res(false));
      req.setTimeout(1000, () => { req.destroy(); res(false); });
    });
    if (ok) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

function _post(port, filePath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = fs.readFileSync(filePath);
    const req = http.request({
      host: '127.0.0.1', port, method: 'POST', path: '/',
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': data.length },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('parser request timed out')));
    req.write(data);
    req.end();
  });
}

test('integration: live parser jar emits cumulative fields and timeline_v1 consumes them end-to-end', { timeout: 360_000 }, async (t) => {
  if (!fs.existsSync(PARSER_JAR)) {
    return t.skip(`parser jar not built at ${PARSER_JAR}`);
  }
  if (!_have('java')) {
    return t.skip('java not on PATH');
  }
  if (!fs.existsSync(REPLAY_CACHE)) {
    try {
      await _download(REPLAY_URL, REPLAY_CACHE, REPLAY_DOWNLOAD_TIMEOUT_MS);
    } catch (e) {
      return t.skip(`could not download test replay (${e.message}); skipping live-parser integration test`);
    }
  }
  // Sanity: file should be a real-sized .dem
  const replayBytes = fs.statSync(REPLAY_CACHE).size;
  assert.ok(replayBytes > 1_000_000, `cached replay looks corrupt (${replayBytes} bytes)`);

  // Spawn the parser on its own port so we don't collide with the production
  // service. The jar reads PORT from env when available.
  const proc = spawn('java', ['-jar', PARSER_JAR], {
    env: { ...process.env, PORT: String(PARSER_PORT) },
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: false,
  });
  let killed = false;
  const cleanup = () => { if (!killed) { killed = true; try { proc.kill('SIGKILL'); } catch {} } };
  t.after(cleanup);

  // The jar default port is 5600 — try that too if our PORT env isn't honoured.
  let livePort = PARSER_PORT;
  let healthy = await _waitHealthy(PARSER_PORT, PARSER_BOOT_TIMEOUT_MS);
  if (!healthy) {
    healthy = await _waitHealthy(5600, 5000);
    if (healthy) livePort = 5600;
  }
  if (!healthy) {
    cleanup();
    return t.skip('parser jar failed to become healthy within boot timeout');
  }

  const ndjson = await _post(livePort, REPLAY_CACHE, PARSER_PARSE_TIMEOUT_MS);
  cleanup();

  const lines = ndjson.split('\n').filter(Boolean);
  assert.ok(lines.length > 1000, `expected dense parser output, got ${lines.length} lines`);

  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); } catch {}
  }
  const intervals = events.filter(e => e.type === 'interval');
  assert.ok(intervals.length > 1000, `expected dense interval stream, got ${intervals.length}`);

  // ── (a) Hard regression hook: jar MUST emit all three cumulative fields ──
  const missing = { hd: 0, td: 0, wk: 0 };
  for (const e of intervals) {
    if (!('hero_damage_cumulative'  in e)) missing.hd++;
    if (!('tower_damage_cumulative' in e)) missing.td++;
    if (!('wards_killed_cumulative' in e)) missing.wk++;
  }
  assert.equal(missing.hd, 0, `live parser jar dropped hero_damage_cumulative on ${missing.hd}/${intervals.length} intervals — likely an un-rebuilt jar (see odota-parser/src/main/java/opendota/Parse.java ~L444/L796).`);
  assert.equal(missing.td, 0, `live parser jar dropped tower_damage_cumulative on ${missing.td}/${intervals.length} intervals.`);
  assert.equal(missing.wk, 0, `live parser jar dropped wards_killed_cumulative on ${missing.wk}/${intervals.length} intervals.`);

  // Cumulative counters must actually accumulate above zero in a real match.
  const maxHd = Math.max(...intervals.map(e => e.hero_damage_cumulative || 0));
  const maxTd = Math.max(...intervals.map(e => e.tower_damage_cumulative || 0));
  assert.ok(maxHd > 0, 'hero_damage_cumulative never accumulated above 0 — counter may be wired but not feeding any source');
  assert.ok(maxTd > 0, 'tower_damage_cumulative never accumulated above 0');

  // ── (b) End-to-end: aggregator surfaces parser-emitted values on samples ──
  const parser = getReplayParser();
  const r = parser._aggregateStats(events);
  assert.ok(r.gameTimeline?.players?.length > 0, 'aggregator must produce timeline players');

  // Pick a slot whose hero actually dealt damage so cumulative > 0 across most
  // of the game (gives us a meaningful precedence assertion).
  const slot = r.gameTimeline.players
    .map(p => ({ slot: p.slot, samples: p.samples || [] }))
    .filter(p => p.samples.some(s => (s.hd_cum || 0) > 0))
    .sort((a, b) => (b.samples.at(-1)?.hd_cum || 0) - (a.samples.at(-1)?.hd_cum || 0))[0];
  assert.ok(slot, 'no slot accumulated any hero damage in the parsed replay');

  // Build a parser-interval lookup by time → cumulative values for the chosen
  // slot, then assert every aligned sample matches the parser-emitted value.
  const parserCumByTime = new Map();
  for (const e of intervals) {
    if (e.slot === slot.slot && (e.time || 0) >= 0) {
      parserCumByTime.set(e.time, {
        hd: e.hero_damage_cumulative,
        td: e.tower_damage_cumulative,
        wk: e.wards_killed_cumulative,
      });
    }
  }
  let aligned = 0;
  let nonzeroAligned = 0;
  for (const s of slot.samples) {
    const c = parserCumByTime.get(s.t);
    if (!c) continue;
    aligned++;
    if (c.hd > 0) nonzeroAligned++;
    assert.equal(s.hd_cum, c.hd, `sample slot=${slot.slot} t=${s.t}: hd_cum should be parser-emitted ${c.hd}, got ${s.hd_cum}`);
    assert.equal(s.td_cum, c.td, `sample slot=${slot.slot} t=${s.t}: td_cum should be parser-emitted ${c.td}, got ${s.td_cum}`);
    assert.equal(s.wk_cum, c.wk, `sample slot=${slot.slot} t=${s.t}: wk_cum should be parser-emitted ${c.wk}, got ${s.wk_cum}`);
  }
  assert.ok(aligned >= 30, `expected many aligned samples, got ${aligned}`);
  assert.ok(nonzeroAligned >= 5, `expected several aligned samples with nonzero hd_cum, got ${nonzeroAligned} — precedence assertion would be vacuous otherwise`);

  // ── (c) PERF computability against the live parser-emitted samples ──
  const tlPlayer = r.gameTimeline.players.find(p => p.slot === slot.slot);
  const stat = (p10,p25,p50,p75,p90,p99) => ({ p10,p25,p50,p75,p90,p99,sample_count:1000 });
  const perStat = {
    gold: stat(1000,2000,3000,4000,5000,8000),
    xp:   stat(1200,2400,3600,4800,6000,9000),
    cs:   stat(0.5, 1,    2,   3,    4,   6),
    denies: stat(0, 0.1,  0.3, 0.6,  1,   2),
    k:    stat(0,   0.05, 0.15,0.30, 0.5, 1),
    d:    stat(0,   0.05, 0.15,0.30, 0.5, 1),
    a:    stat(0,   0.10, 0.25,0.50, 0.8, 1.5),
    nw:   stat(1000,2000,3000,5000, 8000,14000),
    obs:  stat(0,   0.05, 0.10,0.20, 0.30,0.5),
    sen:  stat(0,   0.05, 0.10,0.20, 0.30,0.5),
    hd_cum: stat(50, 100, 200, 400,  800, 1500),
    td_cum: stat(0,  10,  30,  100,  300, 600),
    wk_cum: stat(0,  0.05,0.10,0.25, 0.40,0.8),
  };
  const baselines = {};
  const totalMinutes = Math.max(60, Math.floor((r.duration || 1800) / 60) + 5);
  for (const [k, b] of Object.entries(perStat)) {
    baselines[k] = {};
    for (let m = 1; m <= totalMinutes; m++) baselines[k][m] = b;
  }
  const perfRes = computeTimelinePerf(tlPlayer, {
    position: 1,
    durationSec: r.duration,
    baselines,
    teammateSamples: [],
    won: false,
  });
  assert.ok(perfRes, 'timeline_v1 PERF should be computable from live parser samples');
  assert.ok(perfRes.perf >= 1.0 && perfRes.perf <= 10.0, `perf ${perfRes.perf} out of [1,10]`);
  assert.ok(perfRes.breakdown.timeline.scored_minutes >= 5);
});
