const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'deploy.sh'), 'utf8');
// Execute the real restart + local/public gates, without pulling, building,
// migrating, or touching a real PM2 daemon or a real network endpoint.
const marker = 'pm2 restart "${PM2_APP}" --update-env\n';
assert.equal(script.split(marker).length, 2, 'restart anchor must be unique');
const gates = script.slice(script.indexOf(marker));
const fullUrl = 'http://127.0.0.1:3001/api/health';
const communityUrl = 'http://127.0.0.1:5000/api/health';
const publicUrl = 'https://full.example.test/api/health';
const healthy = { ok: true, services: { db: true, discord: true } };
const community = { status: 'ok', db: true, uptime: 12, version: '1.0' };

function run({
  effectivePort, nestedPort, shellPort, filePort, healthUrl,
  responses = {}, pm2Json, publicResponse = healthy, healthTimeout = '5',
  effectiveNodeEnv, effectiveHost, nestedNodeEnv = 'production',
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'full-deploy-health-'));
  try {
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.copyFileSync(path.join(root, 'scripts/deploy-health-auth.js'),
      path.join(dir, 'scripts/deploy-health-auth.js'));
    if (filePort !== undefined) fs.writeFileSync(path.join(dir, '.env'), `PORT="${filePort}" # app port\n`);
    const processes = [
      {
        name: 'inhouse-bot',
        pm2_env: { PORT: '5000', env: { PORT: '5000' } },
      },
      {
        name: 'oi-bot',
        pm2_env: {
          PORT: effectivePort,
          NODE_ENV: effectiveNodeEnv,
          CANONICAL_HOST: effectiveHost,
          env: { PORT: nestedPort, NODE_ENV: nestedNodeEnv, CANONICAL_HOST: 'full.example.test' },
        },
      },
    ];
    fs.writeFileSync(path.join(dir, 'pm2.json'), pm2Json ?? JSON.stringify(processes));
    // Values may be response sequences to simulate startup and partial writes.
    fs.writeFileSync(path.join(dir, 'responses.json'), JSON.stringify({
      [fullUrl]: { body: healthy },
      [communityUrl]: { body: community },
      [publicUrl]: { body: publicResponse },
      ...responses,
    }));
    fs.writeFileSync(path.join(bin, 'pm2'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FIXTURE/pm2.log"
if [ "$1" = jlist ]; then cat "$FIXTURE/pm2.json"; fi
`, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, 'curl'), `#!${process.execPath}
const fs = require('node:fs');
const dir = process.env.FIXTURE;
const url = process.argv.at(-1);
fs.appendFileSync(dir + '/curl.log', url + '\\n');
const responses = JSON.parse(fs.readFileSync(dir + '/responses.json'));
let reply = responses[url];
if (!reply) process.exit(7);
if (Array.isArray(reply)) {
  const current = reply[0];
  if (reply.length > 1) reply.shift();
  responses[url] = reply;
  fs.writeFileSync(dir + '/responses.json', JSON.stringify(responses));
  reply = current;
}
process.stdout.write(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body));
process.exit(reply.exitCode || 0);
`, { mode: 0o755 });
    const result = spawnSync('bash', ['-c', `set -e
# Deterministic virtual time: retain the actual gate timeout/retry logic.
sleep() { SECONDS=$((SECONDS + 5)); }
${gates}`], {
      cwd: dir,
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        NODE_PATH: path.join(root, 'node_modules'),
        FIXTURE: dir,
        PM2_APP: 'oi-bot',
        PORT: shellPort ?? '',
        HEALTH_URL: healthUrl ?? '',
        HEALTH_TIMEOUT: healthTimeout,
        PUBLIC_HEALTH_TIMEOUT: '5',
        // Used only if PM2 JSON is missing or malformed.
        NODE_ENV: 'production',
        CANONICAL_HOST: 'full.example.test',
      },
      encoding: 'utf8',
      timeout: 15000,
    });
    const readLines = name => fs.existsSync(path.join(dir, name))
      ? fs.readFileSync(path.join(dir, name), 'utf8').trim().split('\n') : [];
    const pm2 = readLines('pm2.log');
    assert.ifError(result.error);
    // Enforce isolation on success AND every failure path.
    assert.equal(pm2[0], 'restart oi-bot --update-env');
    assert.ok(pm2.every(command => /^(restart oi-bot --update-env|jlist|logs oi-bot --lines 60 --nostream|status oi-bot)$/.test(command)),
      `unexpected process mutation: ${pm2.join('; ')}`);
    return { ...result, pm2, probes: readLines('curl.log') };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function passed(result) {
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /Health check passed — http:\/\/127\.0\.0\.1:3001\/api\/health/);
  assert.match(result.stdout, /Public health check passed/);
  assert.ok(result.probes.includes(publicUrl), 'production public gate must run');
}

test('effective PM2 PORT wins over stale nested and shell PORT; community stays independent', () => {
  const result = run({ effectivePort: '3001', nestedPort: '5000', shellPort: '5000' });
  passed(result);
  assert.equal(result.probes[0], fullUrl);
  assert.ok(!result.probes.includes(communityUrl));
});

test('nested PM2 PORT works when effective PORT is absent', () => {
  const result = run({ nestedPort: '3001', shellPort: '5000' });
  passed(result);
  assert.equal(result.probes[0], fullUrl);
});

test('stale effective PM2 PORT does not prevent checking the nested full-app candidate', () => {
  passed(run({ effectivePort: '5000', nestedPort: '3001', shellPort: '5000' }));
});

test('stale PM2 metadata and shell PORT cannot pin the full deploy to community :5000', () => {
  const result = run({ effectivePort: '5000', nestedPort: '5000', shellPort: '5000' });
  passed(result);
  assert.equal(result.probes[0], communityUrl);
  assert.match(result.stderr, /Ignoring non-full.*:5000; leaving it untouched/);
  assert.equal(result.probes.filter(url => url === communityUrl).length, 1, 'deduplicate port candidates');
});

test('stale shell PORT alone still discovers full on :3001 with community on :5000', () => {
  passed(run({ shellPort: '5000' }));
});

test('full checkout .env supplies a nonstandard app port before the shell or defaults', () => {
  const customUrl = 'http://127.0.0.1:3219/api/health';
  const result = run({
    effectivePort: '5000', nestedPort: '5000', shellPort: '5000', filePort: '3219',
    responses: { [customUrl]: { body: healthy } },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.probes[1], customUrl);
  assert.ok(!result.probes.includes(fullUrl));
  assert.ok(result.probes.includes(publicUrl));
});

test('missing or malformed PM2 metadata still uses identity-checked fallback discovery', () => {
  for (const pm2Json of ['[]', 'not JSON']) {
    passed(run({ pm2Json, shellPort: '5000' }));
  }
});

test('invalid, zero, and out-of-range port metadata is never probed', () => {
  const result = run({ effectivePort: '70000', nestedPort: 'oops', shellPort: '0', filePort: '-1' });
  passed(result);
  assert.equal(result.probes[0], fullUrl);
});

test('explicit HEALTH_URL is authoritative even with stale PM2 and shell metadata', () => {
  const override = 'http://127.0.0.1:4321/api/health';
  const result = run({
    healthUrl: override, effectivePort: '5000', shellPort: '5000',
    responses: { [override]: { body: healthy } },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.probes, [override, publicUrl]);
});

test('explicit HEALTH_URL pointing to community fails, without fallback or stopping any process', () => {
  const result = run({ healthUrl: communityUrl });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /NOT the full bot/);
  assert.match(result.stderr, /No process has been stopped/);
  assert.ok(result.probes.every(url => url === communityUrl));
});

test('no matching full responder fails closed rather than accepting healthy community', () => {
  const result = run({ shellPort: '5000', responses: { [fullUrl]: null } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No full-edition endpoint found/);
  assert.ok(!result.probes.includes(publicUrl));
});

test('discovery retries until the full app starts, despite a populated wrong PORT', () => {
  const result = run({
    shellPort: '5000', healthTimeout: '15',
    // The first pass rejects this response; a later candidate loop must retry.
    responses: { [fullUrl]: [{ body: 'starting' }, { body: healthy }] },
  });
  passed(result);
  assert.ok(result.probes.filter(url => url === fullUrl).length >= 3);
});

test('selected full responder can become ready after startup without switching targets', () => {
  passed(run({
    effectivePort: '3001', healthTimeout: '15',
    responses: {
      [fullUrl]: [
        { body: { ok: false, services: { db: false } } },
        { body: { ok: false, services: { db: false } } },
        { body: healthy },
      ],
    },
  }));
});

test('full identity alone is not readiness and cannot fall through to another full app', () => {
  const result = run({
    effectivePort: '3001',
    responses: {
      [fullUrl]: { body: { ok: false, services: { db: false } } },
      'http://127.0.0.1:3000/api/health': { body: healthy },
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not ok/);
  assert.ok(result.probes.every(url => url === fullUrl));
});

test('invalid JSON, malformed fingerprints, and curl failures never pass explicit local check', () => {
  for (const reply of [
    { body: 'invalid JSON' },
    { body: { ok: true, services: [] } },
    { body: { ok: true, services: null } },
    { body: { ok: true } },
    { body: healthy, exitCode: 22 },
  ]) {
    const result = run({ healthUrl: fullUrl, responses: { [fullUrl]: reply } });
    assert.equal(result.status, 1, JSON.stringify(reply));
    assert.ok(!result.probes.includes(publicUrl));
  }
});

test('public health is still required and validates full-edition identity', () => {
  for (const publicResponse of [community, { ok: true }, { ok: false, services: {} }]) {
    const result = run({ effectivePort: '3001', publicResponse });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Health check passed/);
    assert.match(result.stderr, /PUBLIC health check FAILED/);
    assert.match(result.stderr, /process itself is healthy/);
  }
});

test('public transport failure cannot be hidden by a healthy partial body', () => {
  const result = run({ responses: { [publicUrl]: { body: healthy, exitCode: 22 } } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PUBLIC health check FAILED/);
});

test('effective PM2 production settings cannot be bypassed by a stale nested snapshot', () => {
  const effectivePublicUrl = 'https://effective.example.test/api/health';
  const result = run({
    effectivePort: '3001', effectiveNodeEnv: 'production',
    effectiveHost: 'effective.example.test', nestedNodeEnv: 'development',
    responses: { [effectivePublicUrl]: { body: healthy } },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.probes.includes(effectivePublicUrl));
  assert.ok(!result.probes.includes(publicUrl));
  assert.match(result.stdout, /Public health check passed/);
});
