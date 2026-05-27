// Task #417 — OpenTelemetry SDK bootstrap.
//
// Required side-effect import: `require('./observability/otel')` MUST be the
// very first line of the process entrypoint so HTTP/Express auto-instrumentation
// can hook the relevant modules before they are loaded by anything else.
//
// Disabled cleanly when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset — no SDK is
// started, no exporters are constructed, no perf cost in dev.
//
// Recognised env vars:
//   OTEL_EXPORTER_OTLP_ENDPOINT    base URL of OTLP/HTTP collector
//                                  (e.g. https://otlp-gateway-prod-us-east-0.grafana.net/otlp)
//   OTEL_EXPORTER_OTLP_HEADERS     header line, e.g.
//                                  "Authorization=Basic <base64(instanceID:token)>"
//   OTEL_SERVICE_NAME              defaults to "oi-bot"
//   OTEL_RESOURCE_ATTRIBUTES       extra resource attrs, comma-separated k=v
//   OTEL_METRICS_EXPORT_INTERVAL_MS  defaults to 30000

'use strict';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

let started = false;
let sdkInstance = null;
let meterProvider = null;

function _parseHeaders(raw) {
  if (!raw) return undefined;
  const out = {};
  for (const part of String(raw).split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function _joinUrl(base, suffix) {
  if (!base) return undefined;
  return base.replace(/\/+$/, '') + suffix;
}

function start() {
  if (started) return sdkInstance;
  if (!endpoint) return null; // Disabled — no exporter configured.

  let sdk;
  try {
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
    const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
    const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
    // OTel resources v2.x drops the `Resource` class export in favour of the
    // `resourceFromAttributes()` builder. Detect both so the bootstrap keeps
    // working if the dep is ever downgraded to v1.x.
    const resourcesPkg = require('@opentelemetry/resources');
    const semconv = require('@opentelemetry/semantic-conventions');
    const ATTR_SERVICE_NAME = semconv.ATTR_SERVICE_NAME
      || (semconv.SemanticResourceAttributes && semconv.SemanticResourceAttributes.SERVICE_NAME)
      || 'service.name';
    const ATTR_DEPLOY_ENV = semconv.ATTR_DEPLOYMENT_ENVIRONMENT_NAME
      || (semconv.SemanticResourceAttributes && semconv.SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT)
      || 'deployment.environment.name';

    const headers = _parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS);
    const serviceName = process.env.OTEL_SERVICE_NAME || 'oi-bot';
    const resourceAttrs = {
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_DEPLOY_ENV]: process.env.NODE_ENV || 'development',
    };
    const resource = typeof resourcesPkg.resourceFromAttributes === 'function'
      ? resourcesPkg.resourceFromAttributes(resourceAttrs)
      : new resourcesPkg.Resource(resourceAttrs);

    const traceExporter = new OTLPTraceExporter({
      url: _joinUrl(endpoint, '/v1/traces'),
      headers,
    });
    const metricExporter = new OTLPMetricExporter({
      url: _joinUrl(endpoint, '/v1/metrics'),
      headers,
    });
    const metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: parseInt(
        process.env.OTEL_METRICS_EXPORT_INTERVAL_MS || '30000', 10),
    });

    sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader,
      // Auto-instrument HTTP + Express. Fs/dns/net are noisy and not useful
      // here, so disable them explicitly to keep the trace volume sane on
      // the free Grafana Cloud tier.
      instrumentations: [getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
      })],
    });
    sdk.start();
    started = true;
    sdkInstance = sdk;

    // Stash the meter provider so metrics.js can grab a real meter once SDK
    // is up. We use the global API to fetch it — sdk.start() registers it.
    try {
      meterProvider = require('@opentelemetry/api').metrics.getMeterProvider();
    } catch (_) {}

    console.log(`[OTel] Exporter enabled → ${endpoint} (service=${serviceName})`);

    const shutdown = () => {
      try { sdk.shutdown().catch(() => {}); } catch (_) {}
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    console.warn('[OTel] SDK initialisation failed — observability disabled:',
      err && err.message ? err.message : err);
  }

  return sdkInstance;
}

function isEnabled() { return started; }

// Eagerly start so the import side-effect is enough for callers.
start();

module.exports = { start, isEnabled, get sdk() { return sdkInstance; } };
