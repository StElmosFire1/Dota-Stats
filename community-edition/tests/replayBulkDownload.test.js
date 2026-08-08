// Task #883 — bulk replay ZIP download (/api/replays/download-all).
// Covers: auth (anon rejected, superuser header accepted, short-lived token
// flow incl. single-use + bad token), archive contents/naming, and graceful
// skipping of a missing file. The DB pool is stubbed so the test needs no
// database and no fixture rows.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.SUPERUSER_PASSWORD = process.env.SUPERUSER_PASSWORD || 'test-superuser-key';
const SUPERKEY = process.env.SUPERUSER_PASSWORD;

const db = require('../src/db');
const { createServer } = require('../src/web/server');

let tmpDir;
let fileA;
let fileB;
let server;
let baseUrl;
const realGetPool = db.getPool;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-zip-test-'));
  fileA = path.join(tmpDir, 'a.dem');
  fileB = path.join(tmpDir, 'b.dem');
  fs.writeFileSync(fileA, Buffer.alloc(2048, 1));
  fs.writeFileSync(fileB, Buffer.alloc(4096, 2));

  const replayRows = [
    { match_id: '111', replay_file_path: fileA, date: new Date('2026-01-05T00:00:00Z') },
    { match_id: '222', replay_file_path: fileB, date: new Date('2026-02-10T00:00:00Z') },
    { match_id: '333', replay_file_path: path.join(tmpDir, 'gone.dem'), date: new Date('2026-03-15T00:00:00Z') },
  ];

  // Stub the pool: answer the bulk-download query with our fixture rows and
  // everything else with an empty result set.
  db.getPool = () => ({
    query: async (sql) => {
      if (typeof sql === 'string' && sql.includes('replay_file_path IS NOT NULL')) {
        return { rows: replayRows };
      }
      return { rows: [] };
    },
  });

  const app = createServer();
  await new Promise((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  db.getPool = realGetPool;
  if (server) server.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

test('anonymous request is rejected', async () => {
  const res = await fetch(`${baseUrl}/api/replays/download-all`);
  assert.strictEqual(res.status, 401);
});

test('bogus token is rejected (falls through to superuser auth)', async () => {
  const res = await fetch(`${baseUrl}/api/replays/download-all?token=deadbeef`);
  assert.strictEqual(res.status, 401);
});

test('anonymous token mint is rejected', async () => {
  const res = await fetch(`${baseUrl}/api/replays/download-all/token`, { method: 'POST' });
  assert.strictEqual(res.status, 401);
});

function assertValidReplayZip(buf) {
  // Local file header + end-of-central-directory signatures.
  assert.strictEqual(buf.subarray(0, 4).toString('binary'), 'PK\x03\x04', 'zip local header');
  assert.ok(buf.includes(Buffer.from('PK\x05\x06', 'binary')), 'zip EOCD present');
  const names = buf.toString('binary');
  assert.ok(names.includes('match_111_2026-01-05.dem'), 'match 111 named by id+date');
  assert.ok(names.includes('match_222_2026-02-10.dem'), 'match 222 named by id+date');
  assert.ok(!names.includes('match_333'), 'missing file skipped');
  // Store-mode zip: both payloads present in full.
  assert.ok(buf.length > 2048 + 4096, 'payload bytes included');
}

test('superuser header download returns a valid zip, skipping the missing file', async () => {
  const res = await fetch(`${baseUrl}/api/replays/download-all`, {
    headers: { 'x-superuser-key': SUPERKEY },
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'application/zip');
  assert.match(res.headers.get('content-disposition') || '', /attachment; filename="replays-.*\.zip"/);
  assertValidReplayZip(Buffer.from(await res.arrayBuffer()));
});

test('token flow: mint with credential, download with token only, token is single-use', async () => {
  const mint = await fetch(`${baseUrl}/api/replays/download-all/token`, {
    method: 'POST',
    headers: { 'x-superuser-key': SUPERKEY },
  });
  assert.strictEqual(mint.status, 200);
  const { token } = await mint.json();
  assert.ok(token && token.length >= 32);

  // Token-only request (no header, no session) succeeds — this is the
  // anchor-navigation path the browser uses.
  const res = await fetch(`${baseUrl}/api/replays/download-all?token=${token}`);
  assert.strictEqual(res.status, 200);
  assertValidReplayZip(Buffer.from(await res.arrayBuffer()));

  // Replay of the same token is rejected.
  const reuse = await fetch(`${baseUrl}/api/replays/download-all?token=${token}`);
  assert.strictEqual(reuse.status, 401);
});
