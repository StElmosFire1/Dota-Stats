'use strict';

// Emit curl configuration ONLY into curl's stdin, never a terminal or log.
// Credentials must not appear in process arguments or temporary files.
function buildHealthCurlConfig(rawUrl, canonicalHost, key) {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Unsupported health URL');
  }
  if (url.pathname !== '/api/health' || url.search || url.hash) {
    throw new Error('Expected the health endpoint');
  }
  if (!key) return '';
  if (/[\r\n]/.test(key)) throw new Error('Invalid health credential');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const publicHost = String(canonicalHost || '').trim().toLowerCase();
  const trustedPublic = url.protocol === 'https:' && url.hostname === publicHost;
  if (!loopback && !trustedPublic) return '';
  return `header = ${JSON.stringify(`x-superuser-key: ${key}`)}\n`;
}

module.exports = { buildHealthCurlConfig };

if (require.main === module) {
  try {
    require('dotenv').config({ quiet: true });
    process.stdout.write(buildHealthCurlConfig(
      process.argv[2],
      process.argv[3] || process.env.CANONICAL_HOST || 'oceinhouse.gg',
      process.env.SUPERUSER_PASSWORD
    ));
  } catch {
    console.error('Could not prepare deployment health authentication.');
    process.exitCode = 1;
  }
}
