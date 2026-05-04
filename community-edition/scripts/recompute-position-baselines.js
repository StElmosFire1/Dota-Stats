#!/usr/bin/env node
/* eslint-disable no-console */
// Recompute `position_baselines` from match game_timeline data.
//
// For each (position, minute_bucket, stat_key) we collect per-minute observations
// across all matches with rich timeline samples and store p10/p25/p50/p75/p90/p99.
// The PERF timeline_v1 path looks these up at scoring time.
//
// Stats: gold, xp, cs (last_hits), denies, k, d, a, nw, obs, sen, hd_cum, td_cum, wk_cum.
// Most are scored as per-minute deltas; nw is the instant value at the bucket.
//
// Usage:
//   node scripts/recompute-position-baselines.js [--season=N] [--max-buckets=120]
//
// Idempotent — UPSERTs by (position, minute_bucket, stat_key).

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const db = require('../src/db');

const STATS = [
  { key: 'gold',   kind: 'delta' },
  { key: 'xp',     kind: 'delta' },
  { key: 'cs',     kind: 'delta' },
  { key: 'denies', kind: 'delta' },
  { key: 'k',      kind: 'delta' },
  { key: 'd',      kind: 'delta' },
  { key: 'a',      kind: 'delta' },
  { key: 'nw',     kind: 'instant' },
  { key: 'obs',    kind: 'delta' },
  { key: 'sen',    kind: 'delta' },
  { key: 'hd_cum', kind: 'delta' },
  { key: 'td_cum', kind: 'delta' },
  { key: 'wk_cum', kind: 'delta' },
];

function _percentile(sortedArr, p) {
  if (sortedArr.length === 0) return null;
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.floor(p * (sortedArr.length - 1))));
  return sortedArr[idx];
}

(async () => {
  const seasonArg = process.argv.find(a => a.startsWith('--season='));
  const maxBucketArg = process.argv.find(a => a.startsWith('--max-buckets='));
  const seasonId = seasonArg ? parseInt(seasonArg.split('=')[1], 10) : null;
  const maxBuckets = maxBucketArg ? parseInt(maxBucketArg.split('=')[1], 10) : 120;

  console.log(`[baselines] starting (season=${seasonId || 'all'}, maxBuckets=${maxBuckets})`);
  await db.initSchema();
  const pool = db.getPool();

  // Pull all matches with rich timeline data, plus the position assignment per slot
  // from player_stats. Stream to keep memory bounded — group on the fly.
  const params = [];
  let where = `m.game_timeline IS NOT NULL
               AND m.game_timeline->'players' IS NOT NULL
               AND m.duration > 600`;
  if (seasonId) {
    params.push(seasonId);
    where += ` AND m.season_id = $${params.length}`;
  }
  const matchesRes = await pool.query(
    `SELECT m.match_id, m.duration, m.game_timeline
       FROM matches m
      WHERE ${where}
      ORDER BY m.match_id ASC`,
    params
  );
  console.log(`[baselines] scanning ${matchesRes.rows.length} matches with timelines`);

  // Buckets: position → minute → stat_key → number[]
  const buckets = {};
  function _push(pos, m, key, val) {
    if (val == null || !isFinite(val)) return;
    if (!buckets[pos]) buckets[pos] = {};
    if (!buckets[pos][m]) buckets[pos][m] = {};
    if (!buckets[pos][m][key]) buckets[pos][m][key] = [];
    buckets[pos][m][key].push(val);
  }

  let matchesScanned = 0, samplesScored = 0;

  for (const matchRow of matchesRes.rows) {
    const players = matchRow.game_timeline?.players;
    if (!Array.isArray(players)) continue;

    // Slot → position mapping for this match.
    const posRes = await pool.query(
      `SELECT slot, position FROM player_stats WHERE match_id = $1`,
      [matchRow.match_id]
    );
    const slotToPos = {};
    for (const r of posRes.rows) {
      slotToPos[r.slot] = (r.position >= 1 && r.position <= 5) ? r.position : 3;
    }

    const totalMinutes = Math.min(maxBuckets, Math.floor((matchRow.duration || 0) / 60));
    if (totalMinutes < 5) continue;

    for (const tp of players) {
      if (!tp || !Array.isArray(tp.samples) || tp.samples.length < 5) continue;
      const slot = tp.slot;
      const pos = slotToPos[slot];
      if (!pos) continue;

      // Resample to one snapshot per minute (latest sample at-or-before minute*60).
      const sorted = [...tp.samples].sort((a, b) => (a.t || 0) - (b.t || 0));
      const byMin = [];
      let idx = 0;
      for (let m = 0; m <= totalMinutes; m++) {
        const cutoff = m * 60;
        while (idx + 1 < sorted.length && (sorted[idx + 1].t || 0) <= cutoff) idx++;
        const s = sorted[idx];
        byMin.push(s && (s.t || 0) <= cutoff + 30 ? s : null);
      }

      for (let m = 1; m <= totalMinutes; m++) {
        const cur = byMin[m], prev = byMin[m - 1];
        if (!cur || !prev) continue;
        for (const def of STATS) {
          let v;
          if (def.kind === 'delta') v = (cur[def.key] || 0) - (prev[def.key] || 0);
          else v = cur[def.key] || 0;
          if (def.kind === 'delta' && v < 0) v = 0; // counters never decrease
          _push(pos, m, def.key, v);
          samplesScored++;
        }
      }
    }
    matchesScanned++;
    if (matchesScanned % 100 === 0) {
      console.log(`[baselines] scanned ${matchesScanned}/${matchesRes.rows.length} matches (samples=${samplesScored})`);
    }
  }

  console.log(`[baselines] aggregation done: ${matchesScanned} matches, ${samplesScored} samples — writing percentiles`);

  // Compute and UPSERT.
  let written = 0, skipped = 0;
  for (const [posStr, minutes] of Object.entries(buckets)) {
    for (const [mStr, stats] of Object.entries(minutes)) {
      for (const [statKey, values] of Object.entries(stats)) {
        if (values.length < 20) { skipped++; continue; }
        const sorted = [...values].sort((a, b) => a - b);
        const row = {
          p10: _percentile(sorted, 0.10),
          p25: _percentile(sorted, 0.25),
          p50: _percentile(sorted, 0.50),
          p75: _percentile(sorted, 0.75),
          p90: _percentile(sorted, 0.90),
          p99: _percentile(sorted, 0.99),
          n: sorted.length,
        };
        await pool.query(
          `INSERT INTO position_baselines (position, minute_bucket, stat_key, p10, p25, p50, p75, p90, p99, sample_count, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
           ON CONFLICT (position, minute_bucket, stat_key) DO UPDATE
             SET p10 = EXCLUDED.p10, p25 = EXCLUDED.p25, p50 = EXCLUDED.p50,
                 p75 = EXCLUDED.p75, p90 = EXCLUDED.p90, p99 = EXCLUDED.p99,
                 sample_count = EXCLUDED.sample_count, updated_at = NOW()`,
          [parseInt(posStr), parseInt(mStr), statKey, row.p10, row.p25, row.p50, row.p75, row.p90, row.p99, row.n]
        );
        written++;
      }
    }
  }

  console.log(`[baselines] done: wrote=${written} rows, skipped=${skipped} sparse buckets`);
  process.exit(0);
})().catch(err => {
  console.error('[baselines] failed:', err);
  process.exit(2);
});
