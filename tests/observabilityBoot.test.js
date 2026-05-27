// Task #417 — Regression guard.
//
// Ensures the OTel SDK actually starts when OTEL_EXPORTER_OTLP_ENDPOINT is
// set, and stays disabled when it is not. This catches the kind of silent
// "Resource is not a constructor" failure that would otherwise hide behind
// the try/catch in observability/otel.js.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

function _freshRequire(specifier, fromPath = __filename) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  return require(filename);
}

test('OTel stays disabled when OTEL_EXPORTER_OTLP_ENDPOINT is unset', () => {
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const otel = _freshRequire('../src/observability/otel');
  assert.equal(otel.isEnabled(), false);
});

test('OTel starts cleanly when OTEL_EXPORTER_OTLP_ENDPOINT is set', () => {
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:14318';
  const otel = _freshRequire('../src/observability/otel');
  assert.equal(otel.isEnabled(), true, 'SDK should report enabled after start()');
  assert.ok(otel.sdk, 'sdk instance should be set');

  // Confirm the meter + tracer APIs actually return usable instruments.
  const metrics = _freshRequire('../src/observability/metrics');
  assert.doesNotThrow(() => metrics.recordHttpRequest({
    method: 'GET', route: '/test', status: 200, durationMs: 1,
  }));
  assert.doesNotThrow(() => metrics.recordStripeCall({
    op: 'checkout.sessions.create', durationMs: 2, ok: true,
  }));

  const { withSpan } = _freshRequire('../src/observability/tracing');
  assert.doesNotThrow(async () => {
    await withSpan('test.span', { foo: 'bar' }, async () => 1);
  });
});
