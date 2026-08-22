const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const editions = [
  ['full', path.join(__dirname, '..', 'src', 'db', 'index.js')],
  ['community', path.join(__dirname, '..', 'community-edition', 'src', 'db', 'index.js')],
];

function functionSource(file) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('async function getDiscordIdsForMatch');
  const end = source.indexOf('\nasync function ', start + 1);
  assert.notEqual(start, -1, `getDiscordIdsForMatch missing from ${file}`);
  return source.slice(start, end);
}

for (const [edition, file] of editions) {
  test(`${edition} match DMs resolve recipients by exact account identity only`, () => {
    const source = functionSource(file);
    assert.doesNotMatch(source, /n2\.nickname\s*=\s*n\.nickname/);
    assert.doesNotMatch(source, /sharing the same nickname/i);
    assert.match(source, /n\.account_id\s*=\s*ps\.account_id/);
    assert.match(source, /pl\.account_id_32::bigint\s*=\s*ps\.account_id/);
  });
}