// Task #925 — TLS certificate expiry warning.
//
// Why: the oceinhouse.gg certificate expired on 1 Aug 2026 and nobody knew
// until visitors saw the browser security warning. Certbot renewal exists but
// has failed silently before (the cert was originally issued with the manual
// plugin, which can't auto-renew), so we watch the LIVE certificate — what
// visitors actually see — rather than trusting the renewal machinery.
//
// What it does: connects to the public site over TLS, reads the served leaf
// certificate's `valid_to`, and:
//   - DMs the bot owner when fewer than TLS_CERT_WARN_DAYS (default 14) days
//     remain, or when the cert is already expired/not-yet-valid.
//   - DMs the owner when the check itself fails (an unreachable/refused TLS
//     handshake is exactly the failure mode that hid the last expiry).
//   - Records the `tls_cert_check` cron heartbeat every run (visible in
//     AdminPanel → System heartbeats), so a dead cron is itself visible.
//
// Scheduling: src/index.js runs this daily. The DM repeats on every daily run
// while the condition persists — deliberate: a once-only nag for a
// soon-to-expire cert is how expiries sneak up.
//
// Env:
//   TLS_CERT_CHECK_HOST  hostname to check (default: host of PUBLIC_BASE_URL
//                        when it is https://, else skip with a 'skipped'
//                        heartbeat — nothing meaningful to check in dev).
//   TLS_CERT_WARN_DAYS   warning threshold in days (default 14).

'use strict';

const tls = require('tls');

const DEFAULT_WARN_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// Resolve the hostname to check. Explicit override wins; otherwise use the
// public base URL only when it's actually https (an http:// dev URL has no
// certificate to inspect). Returns null when there is nothing to check.
function resolveCheckHost(env = process.env) {
  const explicit = (env.TLS_CERT_CHECK_HOST || '').trim();
  if (explicit) return explicit;
  const base = (env.PUBLIC_BASE_URL || '').trim();
  if (!base) return null;
  try {
    const u = new URL(base);
    return u.protocol === 'https:' ? u.hostname : null;
  } catch (_) {
    return null;
  }
}

// Pure decision: given the cert validity window and "now", classify it.
// Returns { status: 'ok'|'warn'|'expired'|'not_yet_valid', daysRemaining }.
// daysRemaining is floored (a cert expiring in 13.9 days reads as 13 — we'd
// rather warn a day early than a day late).
function evaluateCertWindow({ validFrom, validTo, now = new Date(), warnDays = DEFAULT_WARN_DAYS }) {
  const from = new Date(validFrom);
  const to = new Date(validTo);
  if (Number.isNaN(to.getTime())) throw new Error(`unparseable valid_to: ${validTo}`);
  const daysRemaining = Math.floor((to.getTime() - now.getTime()) / DAY_MS);
  if (to.getTime() <= now.getTime()) return { status: 'expired', daysRemaining };
  if (!Number.isNaN(from.getTime()) && from.getTime() > now.getTime()) {
    return { status: 'not_yet_valid', daysRemaining };
  }
  if (daysRemaining < warnDays) return { status: 'warn', daysRemaining };
  return { status: 'ok', daysRemaining };
}

// Fetch the leaf certificate the given host actually serves on :443.
// `rejectUnauthorized: false` is deliberate — an EXPIRED cert would otherwise
// abort the handshake before we could read its dates, which is the one case
// we most need to report on. Resolves { validFrom, validTo, subject, issuer }.
function fetchLiveCertificate(host, { port = 443, timeoutMs = 15_000 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host, port,
      servername: host, // SNI — required or we may get a default vhost cert
      rejectUnauthorized: false,
      timeout: timeoutMs,
    }, () => {
      try {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.valid_to) {
          return reject(new Error(`no certificate presented by ${host}:${port}`));
        }
        resolve({
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          subject: cert.subject && cert.subject.CN ? cert.subject.CN : host,
          issuer: cert.issuer && (cert.issuer.O || cert.issuer.CN) ? (cert.issuer.O || cert.issuer.CN) : 'unknown',
        });
      } catch (err) {
        socket.destroy();
        reject(err);
      }
    });
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`TLS handshake to ${host}:${port} timed out after ${timeoutMs}ms`));
    });
    socket.on('error', (err) => {
      socket.destroy();
      reject(new Error(`TLS connect to ${host}:${port} failed: ${err.message}`));
    });
  });
}

function _fmtDate(d) {
  try { return new Date(d).toISOString().slice(0, 10); } catch (_) { return String(d); }
}

// Compose the owner DM for a non-ok outcome. Exported for tests.
function buildOwnerMessage({ host, status, daysRemaining, validTo, issuer, error = null }) {
  if (error) {
    return (
      `🔒 **TLS certificate check FAILED** for \`${host}\`\n` +
      `The daily cert check could not read the live certificate: ${error}\n` +
      `If the site is up, this usually means the TLS endpoint is misbehaving — check it now, ` +
      `this is the same blind spot that hid the Aug 2026 expiry.`
    );
  }
  if (status === 'expired') {
    return (
      `🚨 **TLS certificate for \`${host}\` has EXPIRED** (on ${_fmtDate(validTo)}).\n` +
      `Visitors are seeing a browser security warning RIGHT NOW.\n` +
      `Fix: \`certbot renew\` (or \`certbot --nginx -d ${host}\`) on the web host, then reload nginx.`
    );
  }
  if (status === 'not_yet_valid') {
    return (
      `🚨 **TLS certificate for \`${host}\` is not yet valid** — the served cert's start date is in the future. ` +
      `Check the host clock and the cert that nginx is serving.`
    );
  }
  return (
    `⚠️ **TLS certificate for \`${host}\` expires in ${daysRemaining} day(s)** (on ${_fmtDate(validTo)}, issuer: ${issuer}).\n` +
    `Auto-renewal appears NOT to have kicked in — renew before visitors see a security warning:\n` +
    `\`certbot renew\` on the web host (see the 2026-08 reissue: \`certbot --nginx -d ${host}\`).`
  );
}

/**
 * Run one TLS expiry check. Never throws.
 * Injectable deps for tests: { fetchCert, dmOwner, recordHeartbeat, now, env }.
 * Returns { ok, skipped?, host?, status?, daysRemaining?, alerted, error? }.
 */
async function runTlsCertCheck(deps = {}) {
  const env = deps.env || process.env;
  const fetchCert = deps.fetchCert || fetchLiveCertificate;
  const now = deps.now || new Date();
  const warnDays = parseInt(env.TLS_CERT_WARN_DAYS, 10) || DEFAULT_WARN_DAYS;
  const recordHeartbeat = deps.recordHeartbeat || (async (h) => {
    try { await require('../db').recordCronHeartbeat(h); } catch (_) {}
  });
  const dmOwner = deps.dmOwner || (async (msg) => {
    const { getDiscordBot } = require('../discord/bot');
    const bot = getDiscordBot();
    if (!bot || typeof bot._dmOwner !== 'function') {
      throw new Error('Discord bot unavailable — owner DM not sent');
    }
    await bot._dmOwner(msg);
  });

  const host = resolveCheckHost(env);
  if (!host) {
    await recordHeartbeat({
      name: 'tls_cert_check', status: 'skipped',
      message: 'no https host to check — set TLS_CERT_CHECK_HOST or an https PUBLIC_BASE_URL',
    });
    return { ok: true, skipped: true, alerted: false };
  }

  let cert;
  try {
    cert = await fetchCert(host);
  } catch (err) {
    const msg = err.message || String(err);
    let alerted = false;
    try { await dmOwner(buildOwnerMessage({ host, error: msg })); alerted = true; }
    catch (dmErr) { console.warn('[TlsCert] owner DM failed:', dmErr.message); }
    await recordHeartbeat({
      name: 'tls_cert_check', status: 'error',
      message: `${msg}${alerted ? ' (owner DMed)' : ' (owner DM FAILED)'}`.slice(0, 480),
    });
    return { ok: false, host, alerted, error: msg };
  }

  // Evaluation can throw on a malformed certificate (unparseable valid_to).
  // That is a check failure too — route it through the same owner-DM +
  // error-heartbeat path as a connection failure, never a silent rejection.
  let status, daysRemaining;
  try {
    ({ status, daysRemaining } = evaluateCertWindow({
      validFrom: cert.validFrom, validTo: cert.validTo, now, warnDays,
    }));
  } catch (err) {
    const msg = `certificate evaluation failed: ${err.message || String(err)}`;
    let alerted = false;
    try { await dmOwner(buildOwnerMessage({ host, error: msg })); alerted = true; }
    catch (dmErr) { console.warn('[TlsCert] owner DM failed:', dmErr.message); }
    await recordHeartbeat({
      name: 'tls_cert_check', status: 'error',
      message: `${msg}${alerted ? ' (owner DMed)' : ' (owner DM FAILED)'}`.slice(0, 480),
    });
    return { ok: false, host, alerted, error: msg };
  }

  let alerted = false;
  if (status !== 'ok') {
    try {
      await dmOwner(buildOwnerMessage({
        host, status, daysRemaining, validTo: cert.validTo, issuer: cert.issuer,
      }));
      alerted = true;
    } catch (dmErr) {
      console.warn('[TlsCert] owner DM failed:', dmErr.message);
    }
  }

  await recordHeartbeat({
    name: 'tls_cert_check',
    status: status === 'ok' ? 'ok' : 'error',
    message: `${host}: ${status}, ${daysRemaining}d remaining (expires ${_fmtDate(cert.validTo)})` +
      (status !== 'ok' ? (alerted ? '; owner DMed' : '; owner DM FAILED') : ''),
  });

  return { ok: status === 'ok', host, status, daysRemaining, alerted };
}

module.exports = {
  runTlsCertCheck,
  evaluateCertWindow,
  resolveCheckHost,
  buildOwnerMessage,
  fetchLiveCertificate,
  DEFAULT_WARN_DAYS,
};
