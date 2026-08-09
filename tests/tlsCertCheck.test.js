// Task #925 — Unit coverage for the TLS certificate expiry check.
//
// The oceinhouse.gg cert expired silently on 1 Aug 2026; this job is the
// guard against a repeat, so its decision logic must not itself regress
// silently. These tests drive the pure branches with injected deps — no real
// TLS connections, Discord, or DB:
//   - evaluateCertWindow(): ok / warn / expired / not-yet-valid thresholds.
//   - resolveCheckHost(): explicit override, https base URL, http skip.
//   - runTlsCertCheck(): warn → owner DM + error heartbeat, ok → no DM,
//     fetch failure → owner DM + error heartbeat, DM failure is non-fatal,
//     no-host → skipped heartbeat.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runTlsCertCheck, evaluateCertWindow, resolveCheckHost, buildOwnerMessage,
} = require('../src/jobs/tlsCertCheck');

const NOW = new Date('2026-08-09T00:00:00Z');
const daysFromNow = (d) => new Date(NOW.getTime() + d * 24 * 60 * 60 * 1000).toISOString();

test('evaluateCertWindow: comfortable margin is ok', () => {
  const r = evaluateCertWindow({ validFrom: daysFromNow(-30), validTo: daysFromNow(60), now: NOW });
  assert.equal(r.status, 'ok');
  assert.equal(r.daysRemaining, 60);
});

test('evaluateCertWindow: exactly at the threshold is ok (< warnDays warns, not <=)', () => {
  const r = evaluateCertWindow({ validFrom: daysFromNow(-30), validTo: daysFromNow(14), now: NOW });
  assert.equal(r.status, 'ok');
  assert.equal(r.daysRemaining, 14);
});

test('evaluateCertWindow: under 14 days warns, partial days floor (warn early not late)', () => {
  const r = evaluateCertWindow({ validFrom: daysFromNow(-30), validTo: daysFromNow(13.9), now: NOW });
  assert.equal(r.status, 'warn');
  assert.equal(r.daysRemaining, 13);
});

test('evaluateCertWindow: past valid_to is expired', () => {
  const r = evaluateCertWindow({ validFrom: daysFromNow(-90), validTo: daysFromNow(-1), now: NOW });
  assert.equal(r.status, 'expired');
});

test('evaluateCertWindow: future valid_from is not_yet_valid', () => {
  const r = evaluateCertWindow({ validFrom: daysFromNow(2), validTo: daysFromNow(90), now: NOW });
  assert.equal(r.status, 'not_yet_valid');
});

test('evaluateCertWindow: custom warnDays respected', () => {
  const r = evaluateCertWindow({ validFrom: daysFromNow(-30), validTo: daysFromNow(20), now: NOW, warnDays: 30 });
  assert.equal(r.status, 'warn');
});

test('evaluateCertWindow: garbage valid_to throws (never a silent ok)', () => {
  assert.throws(() => evaluateCertWindow({ validFrom: 'x', validTo: 'not a date', now: NOW }));
});

test('resolveCheckHost: explicit TLS_CERT_CHECK_HOST wins', () => {
  assert.equal(resolveCheckHost({ TLS_CERT_CHECK_HOST: 'oceinhouse.gg', PUBLIC_BASE_URL: 'https://other.example' }), 'oceinhouse.gg');
});

test('resolveCheckHost: derives host from https PUBLIC_BASE_URL', () => {
  assert.equal(resolveCheckHost({ PUBLIC_BASE_URL: 'https://oceinhouse.gg/some/path' }), 'oceinhouse.gg');
});

test('resolveCheckHost: http/dev base URL or nothing set → null (skip)', () => {
  assert.equal(resolveCheckHost({ PUBLIC_BASE_URL: 'http://127.0.0.1:5000' }), null);
  assert.equal(resolveCheckHost({}), null);
  assert.equal(resolveCheckHost({ PUBLIC_BASE_URL: 'not a url' }), null);
});

function harness({ fetchCert, dmFails = false, env }) {
  const dms = [];
  const heartbeats = [];
  return {
    dms, heartbeats,
    deps: {
      env: env || { TLS_CERT_CHECK_HOST: 'oceinhouse.gg' },
      now: NOW,
      fetchCert,
      dmOwner: async (msg) => {
        if (dmFails) throw new Error('discord down');
        dms.push(msg);
      },
      recordHeartbeat: async (h) => { heartbeats.push(h); },
    },
  };
}

test('runTlsCertCheck: near-expiry cert DMs the owner and records error heartbeat', async () => {
  const h = harness({
    fetchCert: async () => ({ validFrom: daysFromNow(-80), validTo: daysFromNow(5), subject: 'oceinhouse.gg', issuer: "Let's Encrypt" }),
  });
  const res = await runTlsCertCheck(h.deps);
  assert.equal(res.status, 'warn');
  assert.equal(res.alerted, true);
  assert.equal(h.dms.length, 1);
  assert.match(h.dms[0], /expires in 5 day/);
  assert.match(h.dms[0], /oceinhouse\.gg/);
  assert.equal(h.heartbeats.length, 1);
  assert.equal(h.heartbeats[0].name, 'tls_cert_check');
  assert.equal(h.heartbeats[0].status, 'error');
  assert.match(h.heartbeats[0].message, /owner DMed/);
});

test('runTlsCertCheck: healthy cert → no DM, ok heartbeat', async () => {
  const h = harness({
    fetchCert: async () => ({ validFrom: daysFromNow(-10), validTo: daysFromNow(80), subject: 'oceinhouse.gg', issuer: "Let's Encrypt" }),
  });
  const res = await runTlsCertCheck(h.deps);
  assert.equal(res.ok, true);
  assert.equal(res.alerted, false);
  assert.equal(h.dms.length, 0);
  assert.equal(h.heartbeats[0].status, 'ok');
});

test('runTlsCertCheck: expired cert DM says EXPIRED', async () => {
  const h = harness({
    fetchCert: async () => ({ validFrom: daysFromNow(-90), validTo: daysFromNow(-2), subject: 'oceinhouse.gg', issuer: "Let's Encrypt" }),
  });
  const res = await runTlsCertCheck(h.deps);
  assert.equal(res.status, 'expired');
  assert.match(h.dms[0], /EXPIRED/);
});

test('runTlsCertCheck: fetch failure DMs the owner (blind spot must not be silent)', async () => {
  const h = harness({ fetchCert: async () => { throw new Error('ECONNREFUSED'); } });
  const res = await runTlsCertCheck(h.deps);
  assert.equal(res.ok, false);
  assert.equal(res.alerted, true);
  assert.match(h.dms[0], /check FAILED/);
  assert.match(h.dms[0], /ECONNREFUSED/);
  assert.equal(h.heartbeats[0].status, 'error');
});

test('runTlsCertCheck: malformed valid_to → owner DM + error heartbeat, no rejection', async () => {
  const h = harness({
    fetchCert: async () => ({ validFrom: 'garbage', validTo: 'not a date', subject: 'x', issuer: 'y' }),
  });
  const res = await runTlsCertCheck(h.deps); // must resolve, never reject
  assert.equal(res.ok, false);
  assert.equal(res.alerted, true);
  assert.match(res.error, /evaluation failed/);
  assert.match(h.dms[0], /check FAILED/);
  assert.equal(h.heartbeats[0].name, 'tls_cert_check');
  assert.equal(h.heartbeats[0].status, 'error');
  assert.match(h.heartbeats[0].message, /owner DMed/);
});

test('runTlsCertCheck: DM failure is non-fatal and visible in the heartbeat', async () => {
  const h = harness({
    fetchCert: async () => ({ validFrom: daysFromNow(-80), validTo: daysFromNow(3), subject: 'x', issuer: 'y' }),
    dmFails: true,
  });
  const res = await runTlsCertCheck(h.deps);
  assert.equal(res.status, 'warn');
  assert.equal(res.alerted, false);
  assert.match(h.heartbeats[0].message, /owner DM FAILED/);
});

test('runTlsCertCheck: no https host configured → skipped heartbeat, no DM', async () => {
  const h = harness({ fetchCert: async () => { throw new Error('should not be called'); }, env: { PUBLIC_BASE_URL: 'http://127.0.0.1:5000' } });
  const res = await runTlsCertCheck(h.deps);
  assert.equal(res.skipped, true);
  assert.equal(h.dms.length, 0);
  assert.equal(h.heartbeats[0].status, 'skipped');
});

test('runTlsCertCheck: TLS_CERT_WARN_DAYS env override widens the window', async () => {
  const h = harness({
    fetchCert: async () => ({ validFrom: daysFromNow(-10), validTo: daysFromNow(20), subject: 'x', issuer: 'y' }),
    env: { TLS_CERT_CHECK_HOST: 'oceinhouse.gg', TLS_CERT_WARN_DAYS: '30' },
  });
  const res = await runTlsCertCheck(h.deps);
  assert.equal(res.status, 'warn');
});

test('buildOwnerMessage: warn message includes renewal instructions and expiry date', () => {
  const msg = buildOwnerMessage({ host: 'oceinhouse.gg', status: 'warn', daysRemaining: 7, validTo: daysFromNow(7), issuer: "Let's Encrypt" });
  assert.match(msg, /certbot/);
  assert.match(msg, /7 day/);
});
