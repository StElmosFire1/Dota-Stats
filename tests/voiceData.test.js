'use strict';

// Task #600 — Guard the Voiceline daily game against silent hero/clip/name
// mismatches. VOICE_LINES (src/games/voiceData.js) pairs a hero id + slug + line
// with an on-disk clip at src/games/voice-lines/<slug>.mp3. Three invariants are
// easy to break when a hero is added later: (1) every entry has a matching clip,
// (2) no orphan clip lacks an entry, and (3) each slug matches the canonical hero
// slug (HERO_ID_TO_SLUG in web/src/heroNames.js). A silent mismatch would make the
// game serve a 404 clip or point at the wrong hero. This suite fails loudly first.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CLIP_DIR,
  VOICE_LINES,
  clipPathForSlug,
  slugForHero,
  voiceReadyHeroIds,
} = require('../src/games/voiceData');

// Parse HERO_ID_TO_SLUG out of the frontend ES module by extracting the object
// literal and evaluating just that block. The file uses `export` syntax so it
// can't be require()'d from a CommonJS test; we don't want to add a transpile
// step for one constant.
function loadHeroIdToSlug() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'web', 'src', 'heroNames.js'),
    'utf8',
  );
  const m = src.match(/const HERO_ID_TO_SLUG\s*=\s*(\{[\s\S]*?\});/);
  assert.ok(m, 'HERO_ID_TO_SLUG object literal not found in web/src/heroNames.js');
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${m[1]});`)();
}

test('VOICE_LINES has no duplicate heroIds', () => {
  const ids = VOICE_LINES.map(v => v.heroId);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(
    [...new Set(dupes)],
    [],
    `duplicate heroIds in VOICE_LINES: ${[...new Set(dupes)].join(', ')}`,
  );
});

test('VOICE_LINES has no duplicate slugs', () => {
  const slugs = VOICE_LINES.map(v => v.slug);
  const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  assert.deepEqual(
    [...new Set(dupes)],
    [],
    `duplicate slugs in VOICE_LINES: ${[...new Set(dupes)].join(', ')}`,
  );
});

test('every VOICE_LINES entry is well-formed', () => {
  for (const v of VOICE_LINES) {
    assert.equal(typeof v.heroId, 'number', `heroId must be a number: ${JSON.stringify(v)}`);
    assert.ok(Number.isInteger(v.heroId) && v.heroId > 0, `heroId must be a positive int: ${JSON.stringify(v)}`);
    assert.ok(typeof v.slug === 'string' && v.slug.length > 0, `slug must be a non-empty string: ${JSON.stringify(v)}`);
    assert.ok(typeof v.line === 'string' && v.line.length > 0, `line must be a non-empty string: ${JSON.stringify(v)}`);
  }
});

test('every VOICE_LINES entry has a matching clip file on disk', () => {
  const missing = VOICE_LINES
    .filter(v => !fs.existsSync(path.join(CLIP_DIR, `${v.slug}.mp3`)))
    .map(v => `${v.slug}.mp3 (heroId ${v.heroId})`);
  assert.deepEqual(missing, [], `missing clip files: ${missing.join(', ')}`);
});

test('no orphan .mp3 in voice-lines/ lacks a VOICE_LINES entry', () => {
  const entrySlugs = new Set(VOICE_LINES.map(v => v.slug));
  const orphans = fs.readdirSync(CLIP_DIR)
    .filter(f => f.endsWith('.mp3'))
    .map(f => f.slice(0, -'.mp3'.length))
    .filter(slug => !entrySlugs.has(slug));
  assert.deepEqual(orphans, [], `orphan clip files without an entry: ${orphans.join(', ')}`);
});

test('voiceReadyHeroIds() length equals VOICE_LINES length', () => {
  // With every entry's clip present on disk, every hero is "ready".
  assert.equal(voiceReadyHeroIds().length, VOICE_LINES.length);
});

test('each slug matches the canonical hero slug (HERO_ID_TO_SLUG)', () => {
  const canonical = loadHeroIdToSlug();
  const mismatches = [];
  for (const v of VOICE_LINES) {
    const expected = canonical[v.heroId];
    if (expected === undefined) {
      mismatches.push(`heroId ${v.heroId} (${v.slug}) not in HERO_ID_TO_SLUG`);
    } else if (expected !== v.slug) {
      mismatches.push(`heroId ${v.heroId}: VOICE_LINES slug '${v.slug}' != canonical '${expected}'`);
    }
  }
  assert.deepEqual(mismatches, [], mismatches.join('; '));
});

test('clipPathForSlug resolves a known slug to an on-disk path', () => {
  const sample = VOICE_LINES[0];
  const resolved = clipPathForSlug(sample.slug);
  assert.ok(resolved, `expected a path for known slug '${sample.slug}'`);
  assert.ok(fs.existsSync(resolved), `resolved path should exist: ${resolved}`);
  assert.ok(resolved.startsWith(path.resolve(CLIP_DIR) + path.sep));
});

test('clipPathForSlug rejects unknown slugs and path-traversal', () => {
  assert.equal(clipPathForSlug('definitely-not-a-hero'), null);
  assert.equal(clipPathForSlug('../foo'), null);
  assert.equal(clipPathForSlug('../../etc/passwd'), null);
  assert.equal(clipPathForSlug(''), null);
});

test('slugForHero round-trips against VOICE_LINES', () => {
  for (const v of VOICE_LINES) {
    assert.equal(slugForHero(v.heroId), v.slug);
  }
  assert.equal(slugForHero(999999), null);
});
