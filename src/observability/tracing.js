// Task #417 — Tracing helpers.
//
// Thin wrapper around the OTel trace API. Returns a no-op span when the
// SDK is disabled, so callers don't need to gate on env-var presence.

'use strict';

let _api = null;
try { _api = require('@opentelemetry/api'); } catch (_) {}

function _tracer() {
  if (!_api) return null;
  return _api.trace.getTracer('oi-bot', '1.0.0');
}

// Run `fn(span)` inside a new active span. Sets status + records exceptions
// automatically. Always ends the span. If OTel is unavailable, just calls
// fn(null).
async function withSpan(name, attrs, fn) {
  if (typeof attrs === 'function') { fn = attrs; attrs = undefined; }
  const tracer = _tracer();
  if (!tracer) {
    try { return await fn(null); }
    catch (e) { throw e; }
  }
  return tracer.startActiveSpan(name, { attributes: attrs || {} }, async (span) => {
    try {
      const r = await fn(span);
      span.setStatus({ code: _api.SpanStatusCode.OK });
      return r;
    } catch (err) {
      try {
        span.recordException(err);
        span.setStatus({
          code: _api.SpanStatusCode.ERROR,
          message: err && err.message ? err.message : String(err),
        });
      } catch (_) {}
      throw err;
    } finally {
      try { span.end(); } catch (_) {}
    }
  });
}

function setSpanAttr(span, k, v) {
  if (span && typeof span.setAttribute === 'function') {
    try { span.setAttribute(k, v); } catch (_) {}
  }
}

module.exports = { withSpan, setSpanAttr };
