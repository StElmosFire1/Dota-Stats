// Task #410 — Lock in the snippet anonymiser so a future refactor can't
// accidentally start leaking student handles / Steam IDs / emails on the
// public marketplace card.

const test = require('node:test');
const assert = require('node:assert/strict');

// The function isn't exported (it's a module-private helper), but it's defined
// at module load. We reach in via the module cache for the test.
const dbModule = require('../src/db/index.js');

// Pull the helper directly off the module's source by re-requiring. Since the
// helper is closured we can't reach it via dbModule. Instead we exercise it
// through the public `getCoachSnippets` path by stubbing the pool query — but
// that requires a live pool. Simpler: parse the file ourselves and verify the
// regex set covers each PII class via a tiny re-implementation seeded from the
// same patterns. That is brittle, so instead we add a thin export.

// Re-require via the module — `_anonymiseSnippetText` is now exposed below as
// `__test_anonymiseSnippetText` for unit testing (added by the same change).
const anon = dbModule.__test_anonymiseSnippetText;

test('anonymiser strips Discord pings, emails, URLs, Steam IDs, handles', () => {
  assert.equal(typeof anon, 'function', 'expected anonymiser to be exported for tests');

  // Each of these should be redacted.
  const cases = [
    { in: 'Loved the session @stelmosfire — book me again', mustRedact: '@stelmosfire' },
    { in: 'DM me at coach@example.com',                       mustRedact: 'coach@example.com' },
    { in: 'See replay https://opendota.com/matches/9876543',  mustRedact: 'https://opendota.com/matches/9876543' },
    { in: 'Steam 76561198012345678 played well',              mustRedact: '76561198012345678' },
    { in: 'Hi Alex, great execution on the smoke',            mustRedact: 'Alex' },
    { in: 'Ping me on Discord stelmo#1234',                   mustRedact: 'stelmo#1234' },
    { in: 'Check www.dotabuff.com/players/123456',            mustRedact: 'www.dotabuff.com' },
  ];
  for (const c of cases) {
    const out = anon(c.in);
    if (out != null) {
      assert.ok(!out.includes(c.mustRedact), `expected "${c.mustRedact}" to be removed from "${out}"`);
    }
    // Either dropped entirely (null) or scrubbed — both are acceptable.
  }
});

test('anonymiser drops over-redacted snippets entirely', () => {
  const out = anon('@a @b @c @d 12345 67890 http://x.io');
  assert.equal(out, null, 'expected heavily-PII snippet to be dropped to null');
});

test('anonymiser preserves clean coaching content', () => {
  const out = anon('Great map awareness in the early game, but ward placement on the river needs work.');
  assert.ok(out && out.length > 20);
  assert.ok(!out.includes('[redacted]'));
});

test('anonymiser caps length at 180 chars', () => {
  const long = 'a'.repeat(500);
  const out = anon(long);
  assert.ok(out && out.length <= 180);
});

test('anonymiser handles empty / null input', () => {
  assert.equal(anon(null), null);
  assert.equal(anon(''), null);
  assert.equal(anon('   '), null);
});
