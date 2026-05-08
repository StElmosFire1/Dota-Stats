'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  _isSafeHttpUrl, _isPrivateIp, _assertPublicHttpUrl, _esc,
} = require('../../src/monetization/magazineV3/urlSafety');

test('_isSafeHttpUrl: accepts http and https', () => {
  assert.equal(_isSafeHttpUrl('http://example.com'), true);
  assert.equal(_isSafeHttpUrl('https://example.com/path?x=1'), true);
});

test('_isSafeHttpUrl: rejects non-http schemes and bad input', () => {
  for (const bad of [
    'javascript:alert(1)', 'data:text/html,x', 'ftp://x.y/z',
    'file:///etc/passwd', 'vbscript:msgbox', '/relative/path',
    '', null, undefined, 5, {}, 'not a url',
  ]) {
    assert.equal(_isSafeHttpUrl(bad), false, `should reject: ${String(bad)}`);
  }
});

test('_isSafeHttpUrl: enforces 2048-char length cap', () => {
  const long = 'https://example.com/' + 'a'.repeat(2050);
  assert.equal(_isSafeHttpUrl(long), false);
});

test('_isPrivateIp: classic loopback / RFC1918 / link-local / CGNAT / multicast', () => {
  for (const ip of [
    '127.0.0.1', '127.255.255.254',
    '10.0.0.1', '10.255.255.255',
    '172.16.0.1', '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1', '100.127.255.255',
    '224.0.0.1', '239.255.255.255',
    '0.0.0.0',
  ]) {
    assert.equal(_isPrivateIp(ip), true, `${ip} should be private`);
  }
});

test('_isPrivateIp: public IPv4 returns false', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '142.250.190.78', '172.15.0.1', '172.32.0.1', '100.63.0.1']) {
    assert.equal(_isPrivateIp(ip), false, `${ip} should be public`);
  }
});

test('_isPrivateIp: IPv6 loopback and link-local + IPv4-mapped fallthrough', () => {
  assert.equal(_isPrivateIp('::1'), true);
  assert.equal(_isPrivateIp('::'), true);
  assert.equal(_isPrivateIp('fe80::1'), true);
  assert.equal(_isPrivateIp('fc00::1'), true);
  assert.equal(_isPrivateIp('fd00::1'), true);
  // IPv4-mapped should defer to the v4 classification.
  assert.equal(_isPrivateIp('::ffff:127.0.0.1'), true);
  assert.equal(_isPrivateIp('::ffff:8.8.8.8'), false);
  // Public v6.
  assert.equal(_isPrivateIp('2606:4700:4700::1111'), false);
});

test('_isPrivateIp: malformed input is treated as private (defensive)', () => {
  for (const bad of ['', 'not-an-ip', '999.999.999.999', '1.2.3', '1.2.3.4.5', null, 5]) {
    assert.equal(_isPrivateIp(bad), true);
  }
});

test('_assertPublicHttpUrl: rejects bare-host private names without DNS', async () => {
  for (const u of [
    'http://localhost/',
    'http://x.localhost/',
    'http://service.local/',
    'http://thing.internal/',
    'http://metadata.google.internal/',
  ]) {
    await assert.rejects(() => _assertPublicHttpUrl(u), /private network/);
  }
});

test('_assertPublicHttpUrl: rejects non-http schemes before DNS', async () => {
  await assert.rejects(() => _assertPublicHttpUrl('javascript:alert(1)'), /absolute http/);
  await assert.rejects(() => _assertPublicHttpUrl('ftp://example.com'), /absolute http/);
});

test('_esc: escapes the five HTML-injection metacharacters', () => {
  assert.equal(_esc('<script>"&\'</script>'),
    '&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;');
  assert.equal(_esc(null), '');
  assert.equal(_esc(undefined), '');
  assert.equal(_esc(123), '123');
});
