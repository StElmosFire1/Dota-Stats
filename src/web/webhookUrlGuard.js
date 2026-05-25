const dns = require('dns').promises;
const net = require('net');

const ALLOW_PRIVATE_TARGETS = process.env.WEBHOOK_ALLOW_PRIVATE === '1';

function _ipIsBlocked(ip) {
  if (!ip) return true;
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('fe80')) return true;
    if (lower.startsWith('ff')) return true;
    if (lower.startsWith('::ffff:')) {
      const v4 = lower.slice(7);
      if (net.isIP(v4) === 4) return _ipIsBlocked(v4);
    }
    return false;
  }
  return true;
}

function validateWebhookUrlSync(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { ok: false, error: 'URL is required.' };
  }
  let u;
  try { u = new URL(rawUrl); } catch { return { ok: false, error: 'Invalid URL.' }; }
  if (u.protocol !== 'https:' && !ALLOW_PRIVATE_TARGETS) {
    return { ok: false, error: 'URL must use https://' };
  }
  if (u.username || u.password) {
    return { ok: false, error: 'URL must not contain credentials.' };
  }
  const host = u.hostname.toLowerCase();
  if (!host) return { ok: false, error: 'URL must have a hostname.' };
  if (!ALLOW_PRIVATE_TARGETS) {
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
        || host.endsWith('.internal') || host === 'metadata.google.internal') {
      return { ok: false, error: 'URL host is not allowed.' };
    }
    // Literal IPs are checked up-front; hostnames are re-checked at send time.
    if (net.isIP(host) && _ipIsBlocked(host)) {
      return { ok: false, error: 'URL host resolves to a private IP.' };
    }
  }
  return { ok: true, url: u.toString() };
}

async function assertSafeAtDispatch(rawUrl) {
  if (ALLOW_PRIVATE_TARGETS) return { ok: true };
  const sync = validateWebhookUrlSync(rawUrl);
  if (!sync.ok) return sync;
  const u = new URL(rawUrl);
  if (net.isIP(u.hostname)) return { ok: true };
  let addrs;
  try {
    addrs = await dns.lookup(u.hostname, { all: true });
  } catch (e) {
    return { ok: false, error: `DNS lookup failed: ${e.code || e.message}` };
  }
  if (!addrs || !addrs.length) return { ok: false, error: 'No DNS records.' };
  for (const a of addrs) {
    if (_ipIsBlocked(a.address)) {
      return { ok: false, error: `Refused: host resolves to disallowed IP ${a.address}` };
    }
  }
  return { ok: true };
}

module.exports = { validateWebhookUrlSync, assertSafeAtDispatch, _ipIsBlocked };
