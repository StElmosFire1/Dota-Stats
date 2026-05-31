'use strict';

// Task #624 — Guard the Voiceline HMAC audio proxy (GET /api/games/audio in
// src/games/routes.js). Voice-line clips are served ONLY through this proxy so
// the clip's slug — which IS the answer to the daily/endless Voiceline puzzle —
// never reaches the client; only an opaque, server-signed token does. The token
// signing/verification path (seed.signToken / seed.verifyToken) had data-layer
// coverage (tests/voiceData.test.js) but the proxy handler itself had none. A
// regression here could leak the answer slug, serve the wrong clip, or let a
// crafted/forged token bypass validation. This suite drives the real handler.
//
// Note on "expired" tokens: these tokens are stateless and carry no TTL, so the
// closest analog to expiry — a token signed under a different/rotated signing
// key (i.e. one a forger can't reproduce) — is exercised by the forgery test.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Writable } = require('node:stream');

const seed = require('../src/games/seed');
const voiceData = require('../src/games/voiceData');
const { mountGamesRoutes } = require('../src/games/routes');

// ── Harness ────────────────────────────────────────────────────────────────

// Mount the games routes against a fake router that just records each handler,
// then pull out the audio proxy handler. db is unused by this route.
function audioHandler() {
  const handlers = {};
  const router = {
    get(p, ...fns) { handlers[`GET ${p}`] = fns[fns.length - 1]; },
    post(p, ...fns) { handlers[`POST ${p}`] = fns[fns.length - 1]; },
  };
  const express = { json: () => (req, res, next) => { if (next) next(); } };
  mountGamesRoutes({ router, express, db: {} });
  const h = handlers['GET /games/audio'];
  assert.ok(typeof h === 'function', 'audio proxy handler not mounted');
  return h;
}

function makeReq(token) {
  return { query: { t: token }, session: {}, headers: {}, get() { return undefined; } };
}

// A Writable-backed response mock: collects piped bytes, records status/headers,
// and exposes a `done` promise that resolves whether the handler finishes by
// streaming (pipe → end → 'finish') or by calling res.send()/res.end() directly.
function makeRes() {
  const chunks = [];
  const res = new Writable({
    write(chunk, _enc, cb) { chunks.push(Buffer.from(chunk)); cb(); },
  });
  let resolveDone;
  res.done = new Promise((r) => { resolveDone = r; });
  res.statusCode = 200;
  res.headers = {};
  res.headersSent = false;
  res.body = undefined;
  res.status = function status(c) { this.statusCode = c; return this; };
  res.set = function set(k, v) { this.headers[String(k).toLowerCase()] = v; return this; };
  res.send = function send(b) { this.body = b; this.headersSent = true; resolveDone(); return this; };
  res.on('finish', () => { res.headersSent = true; resolveDone(); });
  res.buffer = () => Buffer.concat(chunks);
  return res;
}

async function invoke(token) {
  const res = makeRes();
  audioHandler()(makeReq(token), res);
  await res.done;
  return res;
}

// b64url + arbitrary-key HMAC so we can forge tokens for the negative cases.
function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function forge(obj, key) {
  const payload = b64url(JSON.stringify(obj));
  const sig = b64url(crypto.createHmac('sha256', key).update(payload).digest());
  return `${payload}.${sig}`;
}

// Two real, distinct clips to prove a token resolves to exactly its own slug.
const SLUG_A = 'antimage';
const SLUG_B = 'axe';
const fileBytes = (slug) => fs.readFileSync(path.join(voiceData.CLIP_DIR, `${slug}.mp3`));

test('[precondition] sample clips exist and differ', () => {
  assert.ok(voiceData.clipPathForSlug(SLUG_A), `${SLUG_A} clip must resolve`);
  assert.ok(voiceData.clipPathForSlug(SLUG_B), `${SLUG_B} clip must resolve`);
  assert.ok(!fileBytes(SLUG_A).equals(fileBytes(SLUG_B)), 'sample clips must differ');
});

// ── Happy path: a server-minted token round-trips to the correct clip ────────

test('valid voice token streams exactly the matching clip', async () => {
  const token = seed.signToken({ k: 'voice', s: SLUG_A });
  const res = await invoke(token);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'audio/mpeg');
  const expected = fileBytes(SLUG_A);
  assert.equal(res.headers['content-length'], String(expected.length));
  assert.ok(res.buffer().equals(expected), 'streamed bytes must equal the clip on disk');
});

test('a token for one slug never resolves another slug', async () => {
  const resA = await invoke(seed.signToken({ k: 'voice', s: SLUG_A }));
  const resB = await invoke(seed.signToken({ k: 'voice', s: SLUG_B }));
  assert.ok(resA.buffer().equals(fileBytes(SLUG_A)));
  assert.ok(resB.buffer().equals(fileBytes(SLUG_B)));
  assert.ok(!resA.buffer().equals(resB.buffer()), 'distinct slugs must yield distinct clips');
});

// ── Forgery / tampering: nothing without the real signing key gets served ────

test('a token forged with the wrong signing key is rejected', async () => {
  const token = forge({ k: 'voice', s: SLUG_A }, 'not-the-real-signing-key');
  const res = await invoke(token);
  assert.equal(res.statusCode, 400);
  assert.equal(res.buffer().length, 0, 'no clip bytes for a forged token');
});

test('a tampered signature is rejected', async () => {
  const token = seed.signToken({ k: 'voice', s: SLUG_A });
  const [payload, sig] = token.split('.');
  // Flip the last character of the signature to a different base64url char.
  const last = sig.slice(-1);
  const swapped = last === 'A' ? 'B' : 'A';
  const res = await invoke(`${payload}.${sig.slice(0, -1)}${swapped}`);
  assert.equal(res.statusCode, 400);
  assert.equal(res.buffer().length, 0);
});

test('a tampered payload is rejected (signature no longer matches)', async () => {
  const token = seed.signToken({ k: 'voice', s: SLUG_A });
  const [, sig] = token.split('.');
  // Re-encode a different slug into the payload but keep the original signature.
  const forgedPayload = b64url(JSON.stringify({ k: 'voice', s: SLUG_B }));
  const res = await invoke(`${forgedPayload}.${sig}`);
  assert.equal(res.statusCode, 400);
  assert.equal(res.buffer().length, 0);
});

test('swapping a valid B-payload onto a valid A-signature is rejected', async () => {
  // Proves the signature is bound to the payload: you cannot lift the signature
  // from a legitimately issued token and reattach it to a different slug.
  const sigA = seed.signToken({ k: 'voice', s: SLUG_A }).split('.')[1];
  const payloadB = seed.signToken({ k: 'voice', s: SLUG_B }).split('.')[0];
  const res = await invoke(`${payloadB}.${sigA}`);
  assert.equal(res.statusCode, 400);
  assert.equal(res.buffer().length, 0);
});

// ── Malformed / wrong-kind / out-of-bounds tokens ────────────────────────────

test('empty and malformed tokens are rejected', async () => {
  for (const t of ['', 'no-dot', '.', 'a.b.c', 'garbage.garbage']) {
    const res = await invoke(t);
    assert.equal(res.statusCode, 400, `expected 400 for token ${JSON.stringify(t)}`);
    assert.equal(res.buffer().length, 0);
  }
});

test('a validly-signed non-voice token cannot be replayed at the audio proxy', async () => {
  // An image-proxy token (k:'item'/'hero') is signed with the same key but must
  // not be honoured by the audio proxy.
  for (const kind of ['item', 'hero', 'ability']) {
    const token = seed.signToken({ k: kind, s: SLUG_A });
    const res = await invoke(token);
    assert.equal(res.statusCode, 400, `kind '${kind}' must be rejected`);
    assert.equal(res.buffer().length, 0);
  }
});

test('a validly-signed voice token with a missing slug field is rejected', async () => {
  const res = await invoke(seed.signToken({ k: 'voice' }));
  assert.equal(res.statusCode, 400);
  assert.equal(res.buffer().length, 0);
});

test('a validly-signed token for an unknown slug yields no clip (404)', async () => {
  const res = await invoke(seed.signToken({ k: 'voice', s: 'definitely-not-a-hero' }));
  assert.equal(res.statusCode, 404);
  assert.equal(res.buffer().length, 0);
});

test('a validly-signed token with a path-traversal slug yields no clip (404)', async () => {
  // Even a server-signed token cannot escape CLIP_DIR — clipPathForSlug gates it.
  for (const evil of ['../foo', '../../etc/passwd', 'antimage/../axe']) {
    const res = await invoke(seed.signToken({ k: 'voice', s: evil }));
    assert.equal(res.statusCode, 404, `traversal slug ${JSON.stringify(evil)} must 404`);
    assert.equal(res.buffer().length, 0);
  }
});
