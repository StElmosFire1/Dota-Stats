const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

function readScript(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

// Extract the Task #307 PM2-verify gate snippet from a deploy script. The
// gate runs from the `EXPECTED_PM2_SCRIPT=` assignment through the matching
// closing `fi` of the outer `if [ -n "${PM2_INFO}" ]; then` block, immediately
// before `pm2 restart`. We slice it textually so the test exercises the
// real shell code rather than a re-implementation.
function extractGateSnippet(scriptSrc, scriptLabel) {
  const lines = scriptSrc.split('\n');
  const startIdx = lines.findIndex((l) => /^EXPECTED_PM2_SCRIPT=/.test(l));
  assert.ok(
    startIdx !== -1,
    `${scriptLabel}: expected an EXPECTED_PM2_SCRIPT= assignment to anchor the gate snippet`,
  );
  // Find the `pm2 restart` line that follows; the gate ends at the line
  // before it (the closing `fi` of the outer if-block).
  const restartIdx = lines.findIndex(
    (l, i) => i > startIdx && /^\s*pm2 restart\b/.test(l),
  );
  assert.ok(
    restartIdx !== -1,
    `${scriptLabel}: expected a 'pm2 restart' line after the gate snippet`,
  );
  // Walk back from restartIdx to the previous non-blank line — that's the
  // closing `fi` of the outer `if [ -n "${PM2_INFO}" ]; then` block.
  let endIdx = restartIdx - 1;
  while (endIdx > startIdx && lines[endIdx].trim() === '') endIdx--;
  assert.equal(
    lines[endIdx].trim(),
    'fi',
    `${scriptLabel}: expected the line before 'pm2 restart' to be the closing 'fi'`,
  );
  return lines.slice(startIdx, endIdx + 1).join('\n');
}

// Build a temp dir holding a fake `pm2` executable whose `jlist` subcommand
// emits the provided JSON. Returns the dir path; caller prepends it to PATH.
function makePm2Stub(jlistJson) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm2-stub-'));
  const pm2Path = path.join(dir, 'pm2');
  // Heredoc-quoted body so $1 etc. are not expanded by the writer.
  const body = [
    '#!/usr/bin/env bash',
    'if [ "$1" = "jlist" ]; then',
    `  cat <<'PM2_JLIST_EOF'`,
    jlistJson,
    'PM2_JLIST_EOF',
    '  exit 0',
    'fi',
    'exit 0',
    '',
  ].join('\n');
  fs.writeFileSync(pm2Path, body, { mode: 0o755 });
  return dir;
}

// Run the extracted gate snippet with the given env. Returns
// { status, stdout, stderr }.
function runGate({ snippet, pm2Json, env }) {
  const stubDir = makePm2Stub(pm2Json);
  try {
    const fullEnv = {
      ...process.env,
      ...env,
      PATH: `${stubDir}:${process.env.PATH || ''}`,
    };
    // `set -e` so the snippet's `exit 1` propagates as a non-zero status.
    const wrapped = `set -e\n${snippet}\necho __GATE_PASSED__\n`;
    const res = spawnSync('bash', ['-c', wrapped], {
      encoding: 'utf8',
      env: fullEnv,
    });
    return { status: res.status, stdout: res.stdout, stderr: res.stderr };
  } finally {
    fs.rmSync(stubDir, { recursive: true, force: true });
  }
}

function pm2JsonFor(name, scriptPath, cwd) {
  return JSON.stringify([
    {
      name,
      pm2_env: {
        pm_exec_path: scriptPath,
        pm_cwd: cwd,
      },
    },
  ]);
}

const FULL_SNIPPET = extractGateSnippet(readScript('deploy.sh'), 'deploy.sh');
const COMM_SNIPPET = extractGateSnippet(
  readScript('community-edition/deploy.sh'),
  'community-edition/deploy.sh',
);

// ---------- deploy.sh (full edition) ----------

test('full-edition PM2 gate: correct entrypoint + cwd allows the deploy', () => {
  const DEPLOY_CWD = '/home/runner/Dota-Stats-Full';
  const PM2_APP = 'oi-bot';
  const res = runGate({
    snippet: FULL_SNIPPET,
    pm2Json: pm2JsonFor(PM2_APP, `${DEPLOY_CWD}/src/index.js`, DEPLOY_CWD),
    env: { DEPLOY_CWD, PM2_APP },
  });
  assert.equal(res.status, 0, `expected pass, got status=${res.status} stderr=${res.stderr}`);
  assert.match(res.stdout, /__GATE_PASSED__/);
});

test('full-edition PM2 gate: wrong entrypoint aborts with re-registration hint', () => {
  const DEPLOY_CWD = '/home/runner/Dota-Stats-Full';
  const PM2_APP = 'oi-bot';
  const res = runGate({
    snippet: FULL_SNIPPET,
    // Misregistered against the community entrypoint — the Task #298 bug shape.
    pm2Json: pm2JsonFor(PM2_APP, `${DEPLOY_CWD}/community-edition/src/index.js`, DEPLOY_CWD),
    env: { DEPLOY_CWD, PM2_APP },
  });
  assert.equal(res.status, 1, `expected abort, got status=${res.status} stdout=${res.stdout}`);
  assert.doesNotMatch(res.stdout, /__GATE_PASSED__/);
  assert.match(res.stderr, /refuses to restart PM2 process 'oi-bot'/);
  assert.match(res.stderr, /replit\.md/);
});

test('full-edition PM2 gate: wrong cwd aborts with re-registration hint', () => {
  const DEPLOY_CWD = '/home/runner/Dota-Stats-Full';
  const PM2_APP = 'oi-bot';
  const res = runGate({
    snippet: FULL_SNIPPET,
    // Correct script path, but cwd points at a different checkout.
    pm2Json: pm2JsonFor(PM2_APP, `${DEPLOY_CWD}/src/index.js`, '/home/runner/Dota-Stats'),
    env: { DEPLOY_CWD, PM2_APP },
  });
  assert.equal(res.status, 1, `expected abort, got status=${res.status} stdout=${res.stdout}`);
  assert.match(res.stderr, /wrong entrypoint or cwd/);
  assert.match(res.stderr, /replit\.md/);
});

test('full-edition PM2 gate: missing PM2 process (empty array) is a no-op', () => {
  const DEPLOY_CWD = '/home/runner/Dota-Stats-Full';
  const PM2_APP = 'oi-bot';
  const res = runGate({
    snippet: FULL_SNIPPET,
    pm2Json: '[]',
    env: { DEPLOY_CWD, PM2_APP },
  });
  assert.equal(res.status, 0, `expected pass on first-time deploy, got status=${res.status} stderr=${res.stderr}`);
  assert.match(res.stdout, /__GATE_PASSED__/);
});

test('full-edition PM2 gate: PM2 process by a different name is a no-op', () => {
  const DEPLOY_CWD = '/home/runner/Dota-Stats-Full';
  const PM2_APP = 'oi-bot';
  const res = runGate({
    snippet: FULL_SNIPPET,
    // jlist has other processes, but not the one we're about to restart.
    pm2Json: pm2JsonFor('some-other-bot', '/elsewhere/src/index.js', '/elsewhere'),
    env: { DEPLOY_CWD, PM2_APP },
  });
  assert.equal(res.status, 0, `expected pass, got status=${res.status} stderr=${res.stderr}`);
  assert.match(res.stdout, /__GATE_PASSED__/);
});

// ---------- community-edition/deploy.sh ----------

test('community PM2 gate: correct entrypoint + cwd allows the deploy', () => {
  const REPO_ROOT_ENV = '/home/runner/Dota-Stats';
  const PM2_APP = 'inhouse-bot';
  const res = runGate({
    snippet: COMM_SNIPPET,
    pm2Json: pm2JsonFor(
      PM2_APP,
      `${REPO_ROOT_ENV}/community-edition/src/index.js`,
      REPO_ROOT_ENV,
    ),
    env: { REPO_ROOT: REPO_ROOT_ENV, PM2_APP },
  });
  assert.equal(res.status, 0, `expected pass, got status=${res.status} stderr=${res.stderr}`);
  assert.match(res.stdout, /__GATE_PASSED__/);
});

test('community PM2 gate: wrong entrypoint (full-edition src/index.js) aborts — the Task #298 bug shape', () => {
  const REPO_ROOT_ENV = '/home/runner/Dota-Stats';
  const PM2_APP = 'inhouse-bot';
  const res = runGate({
    snippet: COMM_SNIPPET,
    // The exact Task #298 misregistration: inhouse-bot pointed at the
    // full-edition entrypoint instead of community-edition/src/index.js.
    pm2Json: pm2JsonFor(PM2_APP, `${REPO_ROOT_ENV}/src/index.js`, REPO_ROOT_ENV),
    env: { REPO_ROOT: REPO_ROOT_ENV, PM2_APP },
  });
  assert.equal(res.status, 1, `expected abort, got status=${res.status} stdout=${res.stdout}`);
  assert.match(res.stderr, /refuses to restart PM2 process 'inhouse-bot'/);
  assert.match(res.stderr, /Task #298/);
  assert.match(res.stderr, /replit\.md/);
});

test('community PM2 gate: wrong cwd aborts with re-registration hint', () => {
  const REPO_ROOT_ENV = '/home/runner/Dota-Stats';
  const PM2_APP = 'inhouse-bot';
  const res = runGate({
    snippet: COMM_SNIPPET,
    pm2Json: pm2JsonFor(
      PM2_APP,
      `${REPO_ROOT_ENV}/community-edition/src/index.js`,
      '/home/runner/Dota-Stats-Full',
    ),
    env: { REPO_ROOT: REPO_ROOT_ENV, PM2_APP },
  });
  assert.equal(res.status, 1, `expected abort, got status=${res.status} stdout=${res.stdout}`);
  assert.match(res.stderr, /wrong entrypoint or cwd/);
  assert.match(res.stderr, /replit\.md/);
});

test('community PM2 gate: missing PM2 process (empty array) is a no-op', () => {
  const REPO_ROOT_ENV = '/home/runner/Dota-Stats';
  const PM2_APP = 'inhouse-bot';
  const res = runGate({
    snippet: COMM_SNIPPET,
    pm2Json: '[]',
    env: { REPO_ROOT: REPO_ROOT_ENV, PM2_APP },
  });
  assert.equal(res.status, 0, `expected pass on first-time deploy, got status=${res.status} stderr=${res.stderr}`);
  assert.match(res.stdout, /__GATE_PASSED__/);
});

test('community PM2 gate: PM2 process by a different name is a no-op', () => {
  const REPO_ROOT_ENV = '/home/runner/Dota-Stats';
  const PM2_APP = 'inhouse-bot';
  const res = runGate({
    snippet: COMM_SNIPPET,
    pm2Json: pm2JsonFor('oi-bot', '/elsewhere/src/index.js', '/elsewhere'),
    env: { REPO_ROOT: REPO_ROOT_ENV, PM2_APP },
  });
  assert.equal(res.status, 0, `expected pass, got status=${res.status} stderr=${res.stderr}`);
  assert.match(res.stdout, /__GATE_PASSED__/);
});
