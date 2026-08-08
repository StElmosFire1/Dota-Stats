// Task #896 — nightly DB backup: retention policy + failure-alerting posture.
// The pg_dump/rclone shell-outs are stubbed via the injectable execFileP dep;
// what we verify here is the logic that must never silently regress:
//   - retention keeps 14 daily + 8 weekly (Sunday) dumps and never touches
//     non-nightly files (manual/pre-migration dumps),
//   - every failure path calls reportError AND flips the heartbeat to error,
//   - production with no off-host remote configured is itself a failure.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { selectPrunable, runNightlyBackup, DUMP_RE } = require('../src/jobs/nightlyDbBackup');

// ---------- retention policy ----------

function dumpName(d) {
  const iso = d.toISOString();
  return `nightly-${iso.slice(0, 10).replace(/-/g, '')}-030000.dump`;
}

test('selectPrunable keeps 14 daily + 8 Sunday weeklies, prunes the rest', () => {
  // 90 consecutive daily dumps ending on a known date.
  const end = new Date(Date.UTC(2026, 7, 8)); // 2026-08-08 (a Saturday)
  const names = [];
  for (let i = 0; i < 90; i++) {
    names.push(dumpName(new Date(end.getTime() - i * 86400000)));
  }
  const prune = selectPrunable(names, { keepDaily: 14, keepWeekly: 8 });
  const kept = names.filter(n => !prune.includes(n));

  // Newest 14 all kept.
  for (let i = 0; i < 14; i++) assert.ok(kept.includes(dumpName(new Date(end.getTime() - i * 86400000))));
  // Exactly 8 Sundays kept in total (some may overlap the daily window).
  const sundaysKept = kept.filter(n => {
    const m = DUMP_RE.exec(n);
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() === 0;
  });
  assert.strictEqual(sundaysKept.length, 8);
  // Total kept = 14 daily + Sundays outside the daily window.
  const sundaysOutsideDaily = sundaysKept.filter(n => {
    const idx = names.indexOf(n);
    return idx >= 14;
  });
  assert.strictEqual(kept.length, 14 + sundaysOutsideDaily.length);
  assert.strictEqual(prune.length, names.length - kept.length);
});

test('selectPrunable never touches non-nightly filenames', () => {
  const names = ['pre-20260101-120000.dump', 'manual.dump', 'notes.txt', 'nightly-20200101-030000.dump'];
  const prune = selectPrunable(names, { keepDaily: 1, keepWeekly: 0 });
  // The single nightly dump is within keepDaily=1; foreign files never pruned.
  assert.deepStrictEqual(prune, []);
  const prune2 = selectPrunable([...names, 'nightly-20200102-030000.dump'], { keepDaily: 1, keepWeekly: 0 });
  assert.deepStrictEqual(prune2, ['nightly-20200101-030000.dump']);
});

test('selectPrunable with fewer dumps than the window prunes nothing', () => {
  const names = ['nightly-20260807-030000.dump', 'nightly-20260806-030000.dump'];
  assert.deepStrictEqual(selectPrunable(names), []);
});

// ---------- runNightlyBackup failure posture ----------

function makeDeps({ pgDumpFails = false, rcloneFails = false } = {}) {
  const calls = { reportError: [], heartbeats: [], exec: [] };
  const deps = {
    execFileP: async (cmd, args) => {
      calls.exec.push([cmd, ...args]);
      if (cmd.includes('pg_dump') || cmd === 'pg_dump') {
        if (pgDumpFails) throw new Error('pg_dump exploded');
        // write the -f target so the size check passes
        const fIdx = args.indexOf('-f');
        fs.writeFileSync(args[fIdx + 1], 'FAKEDUMP');
        return { stdout: '', stderr: '' };
      }
      if (rcloneFails) { const e = new Error('rclone exploded'); e.stderr = 'boom'; throw e; }
      return { stdout: '', stderr: '' };
    },
    reportError: (err, ctx) => calls.reportError.push({ err, ctx }),
    recordHeartbeat: async (h) => calls.heartbeats.push(h),
    now: new Date(Date.UTC(2026, 7, 8, 3, 0, 0)),
  };
  return { deps, calls };
}

function withEnv(env, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  return Promise.resolve().then(fn).finally(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nightly-backup-test-'));
}

test('success path: dumps, ships, records ok heartbeat', async () => {
  const dir = tmpDir();
  await withEnv({
    DATABASE_URL: 'postgres://fake/db', BACKUP_LOCAL_DIR: dir,
    BACKUP_RCLONE_REMOTE: 'remote:bucket/nightly', NODE_ENV: 'production',
  }, async () => {
    const { deps, calls } = makeDeps();
    const res = await runNightlyBackup(deps);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.shipped, true);
    assert.strictEqual(calls.reportError.length, 0);
    assert.strictEqual(calls.heartbeats.length, 1);
    assert.strictEqual(calls.heartbeats[0].status, 'ok');
    assert.strictEqual(calls.heartbeats[0].name, 'nightly_db_backup');
    // rclone sync was invoked against the configured remote
    assert.ok(calls.exec.some(c => c[0] === 'rclone' && c.includes('remote:bucket/nightly')));
  });
});

test('pg_dump failure alerts + error heartbeat, never throws', async () => {
  const dir = tmpDir();
  await withEnv({ DATABASE_URL: 'postgres://fake/db', BACKUP_LOCAL_DIR: dir, BACKUP_RCLONE_REMOTE: 'r:x' }, async () => {
    const { deps, calls } = makeDeps({ pgDumpFails: true });
    const res = await runNightlyBackup(deps);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(calls.reportError.length, 1);
    assert.strictEqual(calls.reportError[0].ctx.source, 'nightly_db_backup');
    assert.strictEqual(calls.heartbeats[0].status, 'error');
    // no half-written dump left behind
    assert.deepStrictEqual(fs.readdirSync(dir).filter(n => DUMP_RE.test(n)), []);
  });
});

test('rclone failure alerts + error heartbeat', async () => {
  const dir = tmpDir();
  await withEnv({ DATABASE_URL: 'postgres://fake/db', BACKUP_LOCAL_DIR: dir, BACKUP_RCLONE_REMOTE: 'r:x' }, async () => {
    const { deps, calls } = makeDeps({ rcloneFails: true });
    const res = await runNightlyBackup(deps);
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /rclone/);
    assert.strictEqual(calls.heartbeats[0].status, 'error');
  });
});

test('production with no remote configured is a failure (not silent)', async () => {
  const dir = tmpDir();
  await withEnv({
    DATABASE_URL: 'postgres://fake/db', BACKUP_LOCAL_DIR: dir,
    BACKUP_RCLONE_REMOTE: undefined, BACKUP_ALLOW_LOCAL_ONLY: undefined, NODE_ENV: 'production',
  }, async () => {
    const { deps, calls } = makeDeps();
    const res = await runNightlyBackup(deps);
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /BACKUP_RCLONE_REMOTE/);
    assert.strictEqual(calls.heartbeats[0].status, 'error');
  });
});

test('non-production with no remote succeeds local-only', async () => {
  const dir = tmpDir();
  await withEnv({
    DATABASE_URL: 'postgres://fake/db', BACKUP_LOCAL_DIR: dir,
    BACKUP_RCLONE_REMOTE: undefined, NODE_ENV: 'test',
  }, async () => {
    const { deps, calls } = makeDeps();
    const res = await runNightlyBackup(deps);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.shipped, false);
    assert.strictEqual(calls.heartbeats[0].status, 'ok');
  });
});

test('missing DATABASE_URL is a reported failure', async () => {
  await withEnv({ DATABASE_URL: undefined }, async () => {
    const { deps, calls } = makeDeps();
    const res = await runNightlyBackup(deps);
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /DATABASE_URL/);
    assert.strictEqual(calls.reportError.length, 1);
  });
});
