/**
 * URL safety helpers shared across the Magazine v3 features:
 *  - sponsorship link/image URL validation
 *  - verified-badge proof URL validation + SSRF guard
 *  - HTML escaping for the embed widget
 */

// SECURITY (Task #157 round-4 review): sponsorship link_url is rendered
// publicly as a clickable <a href=...>. Without protocol validation a
// sponsor could store `javascript:alert(1)` (or `data:`/`vbscript:` etc.)
// and turn an approved chip into an XSS/phishing primitive on the
// target's profile page. Reject anything that isn't an absolute http/https
// URL at write time. SponsorChip.jsx applies the same check at render
// time as defence-in-depth. Also reused by the verified-badge code-challenge
// proof flow to validate user-supplied profile URLs before fetch.
function _isSafeHttpUrl(s) {
  if (typeof s !== 'string') return false;
  if (s.length > 2048) return false;
  let u;
  try { u = new URL(s); } catch { return false; }
  return u.protocol === 'http:' || u.protocol === 'https:';
}

// SSRF guard for outbound fetches (round-5 review). Resolves the hostname
// via DNS and refuses any IP in a loopback / link-local / private / CGNAT /
// reserved range. Throws on rejection so callers can `try/catch` and surface
// a 4xx without leaking internal addresses.
function _isPrivateIp(ip) {
  if (typeof ip !== 'string') return true;
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) return _isPrivateIp(lower.slice(7));
    return false;
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  if (p[0] === 10) return true;
  if (p[0] === 127) return true;
  if (p[0] === 0) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
  if (p[0] >= 224) return true; // multicast + reserved
  return false;
}

async function _assertPublicHttpUrl(rawUrl) {
  if (!_isSafeHttpUrl(rawUrl)) throw new Error('URL must be absolute http(s)');
  const u = new URL(rawUrl);
  const host = u.hostname;
  if (!host) throw new Error('URL has no host');
  // Reject string-form private hosts too (some envs short-circuit DNS).
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.internal') ||
      lower.endsWith('.local') || lower === 'metadata.google.internal') {
    throw new Error('host points to a private network');
  }
  const dns = require('dns').promises;
  let addrs;
  try { addrs = await dns.lookup(host, { all: true, verbatim: true }); }
  catch (e) { throw new Error('host did not resolve'); }
  if (!addrs.length) throw new Error('host did not resolve');
  for (const a of addrs) {
    if (_isPrivateIp(a.address)) throw new Error('host resolves to a private network');
  }
}

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = {
  _isSafeHttpUrl,
  _isPrivateIp,
  _assertPublicHttpUrl,
  _esc,
};
