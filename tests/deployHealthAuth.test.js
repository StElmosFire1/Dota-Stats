'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { buildHealthCurlConfig: config } = require('../scripts/deploy-health-auth');
const credential = 'test-only-placeholder';

test('health checks authenticate to loopback and canonical HTTPS only', () => {
  const expected = `header = "x-superuser-key: ${credential}"\n`;
  assert.equal(config('http://127.0.0.1:3001/api/health', '', credential), expected);
  assert.equal(config('http://localhost:3001/api/health', '', credential), expected);
  assert.equal(config('http://[::1]:3001/api/health', '', credential), expected);
  assert.equal(config('https://full.example.test/api/health', 'full.example.test', credential), expected);
});

test('credentials are never sent to noncanonical hosts or plaintext public URLs', () => {
  for (const url of [
    'https://other.example.test/api/health',
    'https://full.example.test.evil.test/api/health',
    'http://full.example.test/api/health',
  ]) assert.equal(config(url, 'full.example.test', credential), '');
});

test('missing credentials preserve anonymous probes; invalid targets fail closed', () => {
  assert.equal(config('http://127.0.0.1:3001/api/health', '', undefined), '');
  for (const url of [
    'file:///api/health', 'https://user:pass@full.example.test/api/health',
    'https://full.example.test/other', 'https://full.example.test/api/health?x=1',
  ]) assert.throws(() => config(url, 'full.example.test', credential));
  assert.throws(() => config('http://localhost/api/health', '', 'bad\r\nheader'));
});

test('curl configuration escapes quotes and backslashes in existing credentials', () => {
  const value = 'example"\\\\value';
  assert.equal(config('http://localhost/api/health', '', value),
    `header = ${JSON.stringify(`x-superuser-key: ${value}`)}\n`);
});

test('the real config-to-curl pipeline passes a locked health endpoint without exposing its credential', async () => {
  const server = http.createServer((req, res) => {
    const allowed = req.headers['x-superuser-key'] === credential;
    res.writeHead(allowed ? 200 : 401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: allowed, services: { database: allowed } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/health`;
    const root = path.resolve(__dirname, '..');
    const child = spawn('bash', ['-c', `set -o pipefail
"${process.execPath}" scripts/deploy-health-auth.js "$TEST_HEALTH_URL" |
  curl --config - --no-location -fsS --max-time 5 "$TEST_HEALTH_URL"`], {
      cwd: root,
      env: { ...process.env, SUPERUSER_PASSWORD: credential, TEST_HEALTH_URL: url },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    assert.equal(code, 0, stderr);
    assert.equal(JSON.parse(stdout).ok, true);
    assert.equal(stdout.includes(credential), false);
    assert.equal(stderr.includes(credential), false);
    assert.equal(child.spawnargs.join(' ').includes(credential), false);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
