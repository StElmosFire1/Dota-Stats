'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'dedupe-patch-notes.js');

// Write `content` to a fresh temp .js file and return its path.
function fixture(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dedupe-pn-'));
  const file = path.join(dir, 'patchNotes.js');
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

function run(file) {
  return spawnSync('node', [SCRIPT, file], { encoding: 'utf8' });
}

// Parse the versions out of a (possibly rewritten) fixture file by requiring it.
function versionsOf(file) {
  delete require.cache[require.resolve(file)];
  return require(file).map((n) => n.version);
}

test('no-op on a clean file: exit 0, file unchanged', () => {
  const content = `module.exports = [
  { "version": "1.00", "title": "a" },
  { "version": "1.01", "title": "b" }
];
`;
  const file = fixture(content);
  const before = fs.readFileSync(file, 'utf8');
  const res = run(file);
  assert.strictEqual(res.status, 0, res.stderr);
  assert.match(res.stdout, /no duplicate versions/);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before, 'file must be untouched');
});

test('single duplicate is bumped to the next free numeric version', () => {
  const content = `module.exports = [
  { "version": "1.00", "title": "a" },
  { "version": "1.01", "title": "b" },
  { "version": "1.00", "title": "c" }
];
`;
  const file = fixture(content);
  const res = run(file);
  assert.strictEqual(res.status, 0, res.stderr);
  const versions = versionsOf(file);
  // First occurrence kept; the later duplicate becomes max(1.01)+0.01 = 1.02.
  assert.deepStrictEqual(versions, ['1.00', '1.01', '1.02']);
  assert.strictEqual(new Set(versions).size, versions.length, 'all unique');
});

test('multiple duplicates each get distinct new versions', () => {
  const content = `module.exports = [
  { "version": "2.00", "title": "a" },
  { "version": "2.00", "title": "b" },
  { "version": "2.00", "title": "c" }
];
`;
  const file = fixture(content);
  const res = run(file);
  assert.strictEqual(res.status, 0, res.stderr);
  const versions = versionsOf(file);
  assert.deepStrictEqual(versions, ['2.00', '2.01', '2.02']);
});

test('generated version skips an existing numeric-equal-but-string-distinct value', () => {
  // Existing "8.79" and "8.80" mean the next free numeric slot after dup is 8.81,
  // and a string like "8.80" must not be re-emitted for the "5.1" duplicate.
  const content = `module.exports = [
  { "version": "5.1", "title": "a" },
  { "version": "8.79", "title": "b" },
  { "version": "8.80", "title": "c" },
  { "version": "5.1", "title": "d" }
];
`;
  const file = fixture(content);
  const res = run(file);
  assert.strictEqual(res.status, 0, res.stderr);
  const versions = versionsOf(file);
  // max numeric is 8.80 -> next is 8.81.
  assert.deepStrictEqual(versions, ['5.1', '8.79', '8.80', '8.81']);
});

test('malformed entry (missing version) aborts with exit 1 and no write', () => {
  const content = `module.exports = [
  { "version": "1.00", "title": "a" },
  { "title": "no version here" }
];
`;
  const file = fixture(content);
  const before = fs.readFileSync(file, 'utf8');
  const res = run(file);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /missing a string 'version' field/);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before, 'file must be untouched');
});

test('version-field/entry misalignment aborts without corrupting the file', () => {
  // A note body literally containing a `"version": "..."` fragment inflates the
  // regex match count beyond the parsed entry count; with a real duplicate
  // present, the alignment guard must abort rather than rewrite.
  const content = `module.exports = [
  { "version": "1.00", "note": 'x "version": "9.99" y' },
  { "version": "1.00", "title": "b" }
];
`;
  const file = fixture(content);
  const before = fs.readFileSync(file, 'utf8');
  const res = run(file);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /ABORT/);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before, 'file must be untouched');
});
