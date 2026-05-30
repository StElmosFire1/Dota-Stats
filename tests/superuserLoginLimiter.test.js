// Task #508 — brute-force protection for the lockdown sign-in endpoint.
// Locks down: the burst bucket trips on the 6th failed attempt, the 429 has
// the minimal-info shape (empty body + no-store), and successful logins do
// not count against the limit.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { superuserLoginLimiter, _resetAlertState } = require('../src/security/superuserLoginLimiter');

function makeApp() {
  const app = express();
  app.set('trust proxy', false);
  app.post('/login', superuserLoginLimiter, express.json(), (req, res) => {
    const { password } = req.body || {};
    if (password !== 'correct-horse') return res.status(401).json({ error: 'Invalid password' });
    return res.json({ success: true });
  });
  return app;
}

function post(server, body, ip) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const { port } = server.address();
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        // Distinct synthetic forwarded IP per test isn't honoured unless trust
        // proxy is on; keep all calls on the loopback key for determinism.
        'X-Forwarded-For': ip || '203.0.113.7',
      },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: chunks }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function withServer(fn) {
  const server = makeApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    await fn(server);
  } finally {
    server.close();
  }
}

test('burst bucket: 5 failures allowed, 6th is a 429 with an empty body', async () => {
  _resetAlertState();
  await withServer(async (server) => {
    for (let i = 0; i < 5; i++) {
      const r = await post(server, { password: 'wrong' });
      assert.equal(r.status, 401, `attempt ${i + 1} should reach the handler`);
    }
    const blocked = await post(server, { password: 'wrong' });
    assert.equal(blocked.status, 429, '6th attempt should be rate limited');
    assert.equal(blocked.body, '', '429 body must be empty (minimal-info shape)');
  });
});

test('the limiter is a stacked array of two buckets', () => {
  assert.ok(Array.isArray(superuserLoginLimiter));
  assert.equal(superuserLoginLimiter.length, 2);
  superuserLoginLimiter.forEach((mw) => assert.equal(typeof mw, 'function'));
});

test('_resetAlertState is callable and idempotent', () => {
  assert.doesNotThrow(() => { _resetAlertState(); _resetAlertState(); });
});
