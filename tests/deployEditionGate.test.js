const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

function readScript(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function extractCasePattern(scriptSrc, scriptLabel) {
  // Find the `case "${DEPLOY_BASE}" in` block and grab the first pattern line
  // (the line ending in `)` that lists the offending shell patterns).
  const lines = scriptSrc.split('\n');
  const caseIdx = lines.findIndex((l) => /case\s+"\$\{DEPLOY_BASE\}"\s+in/.test(l));
  assert.ok(
    caseIdx !== -1,
    `${scriptLabel}: expected a 'case "${'${DEPLOY_BASE}"'} in' gate block`,
  );
  for (let i = caseIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (trimmed === 'esac') break;
    // First non-blank/comment line should be the pattern line, ending with `)`.
    const m = trimmed.match(/^([^)]+)\)\s*$/);
    assert.ok(
      m,
      `${scriptLabel}: first body line of case block should be a pattern line, got: ${trimmed}`,
    );
    return m[1].trim();
  }
  throw new Error(`${scriptLabel}: failed to locate pattern inside case block`);
}

function runGate(pattern, basename) {
  // Mirror exactly what the deploy scripts do: lowercase the basename via
  // `tr '[:upper:]' '[:lower:]'`, then evaluate the same case pattern.
  // Exit 1 => gate aborts the deploy. Exit 0 => gate allows the deploy.
  const snippet = `
    set -e
    base="$(printf %s "$1" | tr '[:upper:]' '[:lower:]')"
    case "$base" in
      ${pattern})
        exit 1
        ;;
    esac
    exit 0
  `;
  const res = spawnSync('bash', ['-c', snippet, '_', basename], { encoding: 'utf8' });
  assert.equal(res.status === 0 || res.status === 1, true, `bash exited unexpectedly: ${res.status} ${res.stderr}`);
  return res.status === 0; // true => allowed, false => blocked
}

const FULL_SRC = readScript('deploy.sh');
const COMM_SRC = readScript('community-edition/deploy.sh');

test('both deploy scripts lowercase the basename before matching (locks in the tr step)', () => {
  assert.match(
    FULL_SRC,
    /basename\s+"\$\{DEPLOY_CWD\}"\s*\|\s*tr\s+'\[:upper:\]'\s+'\[:lower:\]'/,
    'deploy.sh must lowercase basename via tr [:upper:] [:lower:]',
  );
  assert.match(
    COMM_SRC,
    /basename\s+"\$\{REPO_ROOT\}"\s*\|\s*tr\s+'\[:upper:\]'\s+'\[:lower:\]'/,
    'community-edition/deploy.sh must lowercase basename via tr [:upper:] [:lower:]',
  );
});

test('full-edition deploy.sh wrong-edition gate matrix', () => {
  const pattern = extractCasePattern(FULL_SRC, 'deploy.sh');
  // Sanity: ensure pattern still includes both required branches; if someone
  // "simplifies" it by dropping *dota-stats, this catches it before we even
  // exercise the matrix.
  assert.ok(/\*community\*/.test(pattern), `deploy.sh pattern must include *community*: got ${pattern}`);
  assert.ok(/\*dota-stats\b/.test(pattern), `deploy.sh pattern must include *dota-stats: got ${pattern}`);

  const cases = [
    // [basename, expectedAllowed, description]
    ['dota-stats-full', true, 'real full-edition prod basename'],
    ['Dota-Stats-Full', true, 'mixed-case full-edition prod basename'],
    ['dota-stats', false, 'real community prod basename'],
    ['Dota-Stats', false, 'mixed-case community prod basename (uppercase must still block)'],
    ['community-checkout', false, 'adversarial: anything containing community must block'],
    ['my-community-fork', false, 'adversarial: community substring anywhere must block'],
    ['some-dota-stats', false, 'adversarial: suffix dota-stats must block'],
    ['unrelated-checkout', true, 'unrelated basename must be allowed'],
  ];
  for (const [basename, expectedAllowed, desc] of cases) {
    const allowed = runGate(pattern, basename);
    assert.equal(
      allowed,
      expectedAllowed,
      `deploy.sh: basename '${basename}' (${desc}) expected allowed=${expectedAllowed}, got allowed=${allowed}`,
    );
  }
});

test('community-edition/deploy.sh wrong-edition gate matrix', () => {
  const pattern = extractCasePattern(COMM_SRC, 'community-edition/deploy.sh');
  assert.ok(/\*full\*/.test(pattern), `community-edition/deploy.sh pattern must include *full*: got ${pattern}`);

  const cases = [
    ['dota-stats', true, 'real community prod basename'],
    ['Dota-Stats', true, 'mixed-case community prod basename'],
    ['dota-stats-full', false, 'real full-edition prod basename must block'],
    ['Dota-Stats-Full', false, 'mixed-case full-edition prod basename must block'],
    ['some-full-checkout', false, 'adversarial: full substring anywhere must block'],
    ['fullstack-fork', false, 'adversarial: leading full substring must block'],
    ['unrelated-checkout', true, 'unrelated basename must be allowed'],
  ];
  for (const [basename, expectedAllowed, desc] of cases) {
    const allowed = runGate(pattern, basename);
    assert.equal(
      allowed,
      expectedAllowed,
      `community-edition/deploy.sh: basename '${basename}' (${desc}) expected allowed=${expectedAllowed}, got allowed=${allowed}`,
    );
  }
});
