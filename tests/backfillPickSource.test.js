// Task #191 — tests for the pick_source backfill helper.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { backfillPickSource, parseLogs, LINE_RE } =
  require('../src/inhouse/backfillPickSource');

function writeTmpLog(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pick-src-'));
  const p = path.join(dir, 'pm2.log');
  fs.writeFileSync(p, lines.join('\n'));
  return p;
}

test('LINE_RE matches the canonical autoStartTicker auto-pick line', () => {
  const m = '2026-05-09T01:23:45 [InhouseAutoStart] Session #42: pick deadline expired, auto-picked 12345 onto team 2 (pick 5/8)'.match(LINE_RE);
  assert.ok(m);
  assert.equal(m[1], '42');
  assert.equal(m[2], '12345');
  assert.equal(m[3], '2');
});

test('parseLogs aggregates duplicate hits and skips missing files', () => {
  const p = writeTmpLog([
    '[InhouseAutoStart] Session #1: pick deadline expired, auto-picked 100 onto team 1 (pick 1/8)',
    '[InhouseAutoStart] Session #1: pick deadline expired, auto-picked 100 onto team 1 (pick 1/8)',
    '[InhouseAutoStart] Session #1: pick deadline expired, auto-picked 200 onto team 2 (pick 2/8)',
    'unrelated line',
  ]);
  const { candidates, filesScanned } = parseLogs(
    [p, '/no/such/file.log'],
    { warn() {}, log() {} }
  );
  assert.equal(filesScanned, 1);
  assert.equal(candidates.size, 2);
  assert.equal(candidates.get('1:100').hits, 2);
  assert.equal(candidates.get('1:200').team, 2);
});

function makeFakePool(rows) {
  const updates = [];
  return {
    getPool: () => ({
      query: async (sql, params) => {
        if (/^SELECT /i.test(sql)) {
          const [sid, acct] = params;
          const row = rows.find(r =>
            r.session_id === sid && String(r.account_id) === String(acct));
          return { rows: row ? [row] : [] };
        }
        if (/^UPDATE /i.test(sql)) {
          const [sid, acct] = params;
          const row = rows.find(r =>
            r.session_id === sid && String(r.account_id) === String(acct));
          if (row && row.pick_source == null) {
            row.pick_source = 'auto_deadline';
            updates.push({ sid, acct });
            return { rowCount: 1 };
          }
          return { rowCount: 0 };
        }
        throw new Error('unexpected SQL: ' + sql);
      },
    }),
    updates,
    rows,
  };
}

const silentLogger = { log() {}, warn() {} };

test('backfillPickSource stamps NULL rows and skips already-stamped ones', async () => {
  const p = writeTmpLog([
    '[InhouseAutoStart] Session #10: pick deadline expired, auto-picked 1 onto team 1 (pick 1/8)',
    '[InhouseAutoStart] Session #10: pick deadline expired, auto-picked 2 onto team 2 (pick 2/8)',
    '[InhouseAutoStart] Session #10: pick deadline expired, auto-picked 3 onto team 1 (pick 3/8)',
  ]);
  const fake = makeFakePool([
    { session_id: 10, account_id: 1, team: 1, pick_order: 0, pick_source: null },
    { session_id: 10, account_id: 2, team: 2, pick_order: 0, pick_source: 'captain' },
    { session_id: 10, account_id: 3, team: 1, pick_order: 1, pick_source: null },
  ]);
  const r = await backfillPickSource(fake.getPool, { logPaths: [p], logger: silentLogger });
  assert.equal(r.proposed, 2);
  assert.equal(r.stamped, 2);
  assert.equal(r.alreadyStamped, 1);
  assert.equal(fake.rows[0].pick_source, 'auto_deadline');
  assert.equal(fake.rows[2].pick_source, 'auto_deadline');
  assert.equal(fake.rows[1].pick_source, 'captain');
});

test('backfillPickSource dry-run writes nothing', async () => {
  const p = writeTmpLog([
    '[InhouseAutoStart] Session #11: pick deadline expired, auto-picked 1 onto team 1 (pick 1/8)',
  ]);
  const fake = makeFakePool([
    { session_id: 11, account_id: 1, team: 1, pick_order: 0, pick_source: null },
  ]);
  const r = await backfillPickSource(fake.getPool, {
    logPaths: [p], dryRun: true, logger: silentLogger,
  });
  assert.equal(r.proposed, 1);
  assert.equal(r.stamped, 0);
  assert.equal(fake.rows[0].pick_source, null);
});

test('backfillPickSource is idempotent — second run is a no-op', async () => {
  const p = writeTmpLog([
    '[InhouseAutoStart] Session #12: pick deadline expired, auto-picked 7 onto team 2 (pick 1/8)',
  ]);
  const fake = makeFakePool([
    { session_id: 12, account_id: 7, team: 2, pick_order: 0, pick_source: null },
  ]);
  const r1 = await backfillPickSource(fake.getPool, { logPaths: [p], logger: silentLogger });
  const r2 = await backfillPickSource(fake.getPool, { logPaths: [p], logger: silentLogger });
  assert.equal(r1.stamped, 1);
  assert.equal(r2.stamped, 0);
  assert.equal(r2.alreadyStamped, 1);
});

test('backfillPickSource skips on team mismatch and missing rows', async () => {
  const p = writeTmpLog([
    '[InhouseAutoStart] Session #13: pick deadline expired, auto-picked 1 onto team 1 (pick 1/8)',
    '[InhouseAutoStart] Session #13: pick deadline expired, auto-picked 99 onto team 1 (pick 2/8)',
  ]);
  const fake = makeFakePool([
    // Row 1: team in DB disagrees with the log — skip rather than overwrite.
    { session_id: 13, account_id: 1, team: 2, pick_order: 0, pick_source: null },
    // Row 99 is absent from the DB entirely.
  ]);
  const r = await backfillPickSource(fake.getPool, { logPaths: [p], logger: silentLogger });
  assert.equal(r.proposed, 0);
  assert.equal(r.stamped, 0);
  assert.equal(r.missing, 1);
  assert.equal(fake.rows[0].pick_source, null);
});
