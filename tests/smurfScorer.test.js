// Task #569 — Unit coverage for the smurf scorer's fingerprint partner list.
//
// Task #500 added a structured `partners` array to the fingerprint signal that
// the admin review UI renders as clickable chips. This file pins down the
// partner-detection contract via the public `scoreAccount` /
// `_buildSessionFingerprintIndex` path:
//   - no overlap                 -> empty `partners`
//   - a single overlap           -> exactly one partner
//   - many overlaps              -> sorted by hit count (desc) and capped at 10
// plus the long-standing `detail` string + `contribution` weighting so a
// refactor can't silently change the score math.
//
// Every signal other than `fingerprint` is driven to its "no data" branch so
// the fingerprint contribution is the only thing influencing the score.

const test = require('node:test');
const assert = require('node:assert/strict');

const smurf = require('../src/smurf/smurfScorer');

// A pool stub returning canned rows for the queries scoreAccount fires. Only
// the user_sessions read carries real data; the rest degrade to "no data".
function makePool({ sessionRows = [] } = {}) {
  return {
    async query(sql) {
      if (/FROM user_sessions/.test(sql)) return { rows: sessionRows };
      if (/WITH me AS/.test(sql)) return { rows: [{ total: 0, top_shared: 0, top_partner: null }] };
      if (/FROM player_stats\s+WHERE account_id = \$1 AND hero_id > 0/.test(sql)) return { rows: [] };
      if (/AVG\(perf\)/.test(sql)) return { rows: [{ avg_perf: null, n: 0 }] };
      if (/FROM ratings r WHERE r\.player_id = \$1/.test(sql)) return { rows: [{ mmr: null, games: 0 }] };
      if (/SELECT mmr::float AS mmr FROM ratings/.test(sql)) return { rows: [{ mmr: null }] };
      return { rows: [] };
    },
  };
}

// Shape a user_sessions row the way connect-pg-simple stores it.
function sessionRow(accountId, ip, ua) {
  return { sess: { accountId, ip, ua } };
}

test('partners: no overlap yields an empty partners list and 0 contribution', async () => {
  const pool = makePool({
    sessionRows: [
      sessionRow('100', 'ip-alpha', 'ua-alpha'),
      sessionRow('200', 'ip-beta', 'ua-beta'),
    ],
  });

  const idx = await smurf._buildSessionFingerprintIndex(pool);
  const { signals } = await smurf.scoreAccount(pool, '100', { sessionFingerprintIndex: idx });
  const fp = signals.fingerprint;

  assert.deepEqual(fp.partners, []);
  assert.equal(fp.value, 0);
  assert.equal(fp.contribution, 0);
  assert.equal(fp.detail, 'no overlapping fingerprints');
});

test('partners: a single overlapping account yields exactly one partner', async () => {
  const SHARED_IP = 'ip-shared';
  const pool = makePool({
    sessionRows: [
      sessionRow('100', SHARED_IP, 'ua-100'),
      sessionRow('200', SHARED_IP, 'ua-200'),
    ],
  });

  const idx = await smurf._buildSessionFingerprintIndex(pool);
  const { signals } = await smurf.scoreAccount(pool, '100', { sessionFingerprintIndex: idx });
  const fp = signals.fingerprint;

  assert.equal(fp.partners.length, 1);
  assert.equal(fp.partners[0].accountId, '200');
  assert.equal(fp.partners[0].hits, 1);
});

test('partners: multiple overlaps are sorted by hit count (desc) and capped at 10', async () => {
  // Account 100 fingerprints with ip-shared + ua-shared.
  // - 12 accounts (201..212) share only the ip  -> 1 hit each
  // - 2 accounts (301,302) share BOTH ip and ua -> 2 hits each
  // 14 overlaps total; the two 2-hit accounts must sort first, and the
  // returned list must be capped at 10.
  const SHARED_IP = 'ip-shared';
  const SHARED_UA = 'ua-shared';
  const sessionRows = [sessionRow('100', SHARED_IP, SHARED_UA)];
  for (let i = 201; i <= 212; i++) sessionRows.push(sessionRow(String(i), SHARED_IP, `ua-${i}`));
  sessionRows.push(sessionRow('301', SHARED_IP, SHARED_UA));
  sessionRows.push(sessionRow('302', SHARED_IP, SHARED_UA));

  const pool = makePool({ sessionRows });
  const idx = await smurf._buildSessionFingerprintIndex(pool);
  const { signals } = await smurf.scoreAccount(pool, '100', { sessionFingerprintIndex: idx });
  const fp = signals.fingerprint;

  // Capped at 10 even though 14 accounts overlap.
  assert.equal(fp.partners.length, 10);

  // Sorted by hits descending — the two 2-hit accounts lead the list.
  assert.equal(fp.partners[0].hits, 2);
  assert.equal(fp.partners[1].hits, 2);
  assert.deepEqual(
    new Set(fp.partners.slice(0, 2).map(p => p.accountId)),
    new Set(['301', '302']),
  );
  // Remaining partners are the 1-hit ip-only accounts.
  for (const p of fp.partners.slice(2)) assert.equal(p.hits, 1);

  // Non-increasing hit counts across the whole list.
  for (let i = 1; i < fp.partners.length; i++) {
    assert.ok(fp.partners[i - 1].hits >= fp.partners[i].hits, 'hits are non-increasing');
  }
});

test('detail + contribution: weighting matches the documented math', async () => {
  // Two accounts share both ip and ua -> 2 overlapping prints.
  // value = clamp(2/3) = 0.667; contribution = 0.667 * weight(10) = 6.7.
  const SHARED_IP = 'ip-shared';
  const SHARED_UA = 'ua-shared';
  const pool = makePool({
    sessionRows: [
      sessionRow('100', SHARED_IP, SHARED_UA),
      sessionRow('200', SHARED_IP, SHARED_UA),
    ],
  });

  const idx = await smurf._buildSessionFingerprintIndex(pool);
  const { signals } = await smurf.scoreAccount(pool, '100', { sessionFingerprintIndex: idx });
  const fp = signals.fingerprint;

  assert.equal(fp.weight, smurf.SIGNAL_WEIGHTS.fingerprint);
  assert.equal(fp.value, 0.667);
  assert.equal(fp.contribution, 6.7);
  assert.equal(fp.partners[0].hits, 2);
  // detail names the top partner and pluralises the overlap count.
  assert.equal(fp.detail, 'shares fingerprint with account 200 (2 overlaps)');
});

test('detail: a single overlap uses the singular "overlap" wording', async () => {
  const SHARED_IP = 'ip-shared';
  const pool = makePool({
    sessionRows: [
      sessionRow('100', SHARED_IP, 'ua-100'),
      sessionRow('200', SHARED_IP, 'ua-200'),
    ],
  });

  const idx = await smurf._buildSessionFingerprintIndex(pool);
  const { signals } = await smurf.scoreAccount(pool, '100', { sessionFingerprintIndex: idx });

  assert.equal(signals.fingerprint.detail, 'shares fingerprint with account 200 (1 overlap)');
});
