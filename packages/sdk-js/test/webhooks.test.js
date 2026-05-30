'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

// Exercises the compiled SDK output. Run `npm run build` in packages/sdk-js
// first (the package's own `npm test` does not, by design — CI builds once).
let sdk;
try {
  sdk = require('../dist/index.js');
} catch {
  sdk = null;
}

// Mirror of webhookDispatcher.signPayload in the main server so we can assert
// the SDK verifier accepts exactly what the dispatcher emits.
function signPayload(secret, timestampMs, rawBody) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestampMs}.${rawBody}`);
  return `t=${timestampMs},v1=${hmac.digest('hex')}`;
}

const SECRET = 'whsec_test_secret';

test('verifyWebhookSignature accepts a server-signed payload', { skip: !sdk }, () => {
  const now = Date.now();
  const payload = JSON.stringify({ event: 'match.finalized', data: { match_id: 1 } });
  const signature = signPayload(SECRET, now, payload);
  assert.equal(
    sdk.verifyWebhookSignature({ payload, signature, secret: SECRET, now }),
    true,
  );
});

test('verifyWebhookSignature rejects a tampered body', { skip: !sdk }, () => {
  const now = Date.now();
  const payload = JSON.stringify({ event: 'match.finalized', data: { match_id: 1 } });
  const signature = signPayload(SECRET, now, payload);
  const tampered = payload.replace('1', '2');
  assert.equal(
    sdk.verifyWebhookSignature({ payload: tampered, signature, secret: SECRET, now }),
    false,
  );
});

test('verifyWebhookSignature rejects a stale timestamp (replay window)', { skip: !sdk }, () => {
  const signedAt = Date.now() - 10 * 60 * 1000; // 10 minutes ago
  const payload = JSON.stringify({ event: 'lobby.full' });
  const signature = signPayload(SECRET, signedAt, payload);
  assert.equal(
    sdk.verifyWebhookSignature({ payload, signature, secret: SECRET, now: Date.now() }),
    false,
  );
});

test('verifyWebhookSignature rejects the wrong secret', { skip: !sdk }, () => {
  const now = Date.now();
  const payload = JSON.stringify({ event: 'lobby.full' });
  const signature = signPayload(SECRET, now, payload);
  assert.equal(
    sdk.verifyWebhookSignature({ payload, signature, secret: 'nope', now }),
    false,
  );
});

test('constructWebhookEvent returns the parsed envelope', { skip: !sdk }, () => {
  const now = Date.now();
  const envelope = { event: 'match.finalized', delivered_at: 'x', data: { match_id: 7 } };
  const payload = JSON.stringify(envelope);
  const signature = signPayload(SECRET, now, payload);
  const event = sdk.constructWebhookEvent({ payload, signature, secret: SECRET, now });
  assert.deepEqual(event, envelope);
});

test('constructWebhookEvent throws on a bad signature', { skip: !sdk }, () => {
  assert.throws(
    () => sdk.constructWebhookEvent({ payload: '{}', signature: 't=1,v1=deadbeef', secret: SECRET }),
    /WebhookVerificationError|verification failed/,
  );
});
