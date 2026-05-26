// Task #408 — Heuristic smurf-likelihood scorer (advisory only).
//
// Returns { score, signals } for an account. `score` is 0–100, capped.
// `signals` is a per-signal breakdown: each entry is
//   { value, weight, contribution, detail? }
// where contribution is the value's contribution to the final score
// (0..weight). Signals with `value === null` are recorded with
// `weight: 0, contribution: 0` so the UI can show "no data".
//
// Signals and weights (sum to 100):
//   shared_lobby     30   — partner concentration; many matches share the same other account
//   hero_pool        20   — narrow hero pool (low Shannon entropy)
//   perf_outlier     20   — average PERF in earliest games vs the median PERF of peers at the same MMR bracket
//   age_vs_mmr       20   — high MMR / few games (fast climb)
//   fingerprint      10   — IP/UA overlap with an existing account, best-effort
//
// The scorer reads only from the DB (matches, player_stats, ratings,
// user_sessions). It is intentionally cheap: one query per signal per
// account at most, and one batched lookup for the partner graph.

const MIN_MATCHES = 5; // accounts with fewer games get score = 0
const SIGNAL_WEIGHTS = {
  shared_lobby: 30,
  hero_pool: 20,
  perf_outlier: 20,
  age_vs_mmr: 20,
  fingerprint: 10,
};

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

async function _activeAccountIds(pool) {
  // "Active" = appeared in at least MIN_MATCHES non-legacy matches.
  const r = await pool.query(`
    SELECT account_id
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    WHERE ps.account_id > 0 AND m.is_legacy = false
    GROUP BY account_id
    HAVING COUNT(*) >= $1
  `, [MIN_MATCHES]);
  return r.rows.map(r => String(r.account_id));
}

async function _sharedLobbySignal(pool, accountId) {
  // Find the partner with the highest co-occurrence in matches, and that
  // ratio relative to the player's total matches.
  const r = await pool.query(`
    WITH me AS (
      SELECT DISTINCT match_id FROM player_stats WHERE account_id = $1
    ),
    partners AS (
      SELECT ps.account_id AS partner, COUNT(*) AS shared
      FROM player_stats ps
      JOIN me ON me.match_id = ps.match_id
      WHERE ps.account_id <> $1 AND ps.account_id > 0
      GROUP BY ps.account_id
    )
    SELECT
      (SELECT COUNT(*) FROM me) AS total,
      (SELECT MAX(shared) FROM partners) AS top_shared,
      (SELECT partner FROM partners ORDER BY shared DESC LIMIT 1) AS top_partner
  `, [accountId]);
  const total = Number(r.rows[0]?.total || 0);
  const topShared = Number(r.rows[0]?.top_shared || 0);
  const topPartner = r.rows[0]?.top_partner ? String(r.rows[0].top_partner) : null;
  if (total < MIN_MATCHES) return { value: null, weight: 0, contribution: 0, detail: 'not enough matches' };
  const ratio = topShared / total;
  // ratio 0.0..1.0 → contribution 0..weight, with anything ≥0.8 maxing out.
  const contribution = clamp(ratio / 0.8, 0, 1) * SIGNAL_WEIGHTS.shared_lobby;
  return {
    value: Number(ratio.toFixed(3)),
    weight: SIGNAL_WEIGHTS.shared_lobby,
    contribution: Math.round(contribution * 10) / 10,
    detail: topPartner ? `${topShared}/${total} matches with partner ${topPartner}` : null,
  };
}

async function _heroPoolSignal(pool, accountId) {
  const r = await pool.query(`
    SELECT hero_id, COUNT(*)::int AS n
    FROM player_stats
    WHERE account_id = $1 AND hero_id > 0
    GROUP BY hero_id
  `, [accountId]);
  const counts = r.rows.map(x => x.n);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total < MIN_MATCHES) return { value: null, weight: 0, contribution: 0, detail: 'not enough matches' };
  // Shannon entropy in bits.
  let H = 0;
  for (const n of counts) {
    const p = n / total;
    if (p > 0) H -= p * Math.log2(p);
  }
  // Normalise against log2(distinct heroes). 1 hero → 0; very diverse → ~1.
  const Hnorm = counts.length <= 1 ? 0 : H / Math.log2(counts.length);
  // Lower entropy → more smurf-like. Anything ≤2 distinct heroes also flagged.
  let narrowness;
  if (counts.length <= 2) narrowness = 1;
  else narrowness = clamp(1 - Hnorm, 0, 1);
  const contribution = narrowness * SIGNAL_WEIGHTS.hero_pool;
  return {
    value: Number(narrowness.toFixed(3)),
    weight: SIGNAL_WEIGHTS.hero_pool,
    contribution: Math.round(contribution * 10) / 10,
    detail: `${counts.length} distinct heroes over ${total} games (entropy ${H.toFixed(2)} bits)`,
  };
}

// Bucket MMR into 250-point bands so we have enough peers per band to
// compute a stable median. Returns null when the account isn't rated yet —
// the perf-outlier signal degrades to "no data" in that case.
function _mmrBucket(mmr) {
  if (mmr == null || !Number.isFinite(Number(mmr))) return null;
  return Math.floor(Number(mmr) / 250) * 250;
}

// Build a Map<bucket, { median, n }> of the median first-10-game PERF
// across every rated account in each MMR bucket. Used as the per-bracket
// peer baseline for `_perfOutlierSignal`. Built once per `recomputeAll`
// run; `scoreAccount` callers without a precomputed map fall back to an
// on-demand single-bucket query.
async function _buildBracketBaselines(pool) {
  const out = new Map();
  const r = await pool.query(`
    WITH early_perf AS (
      SELECT ps.account_id,
             AVG(ps.perf)::float AS avg_perf,
             COUNT(*)::int AS n
      FROM (
        SELECT ps.account_id, ps.perf,
               ROW_NUMBER() OVER (PARTITION BY ps.account_id ORDER BY m.date ASC) AS rn
        FROM player_stats ps
        JOIN matches m ON m.match_id = ps.match_id
        WHERE ps.perf IS NOT NULL AND m.is_legacy = false AND ps.account_id > 0
      ) ps
      WHERE ps.rn <= 10
      GROUP BY ps.account_id
      HAVING COUNT(*) >= 3
    )
    SELECT (FLOOR(r.mmr / 250) * 250)::int AS bucket,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ep.avg_perf)::float AS median_perf,
           COUNT(*)::int AS n
    FROM ratings r
    JOIN early_perf ep ON ep.account_id = r.player_id
    GROUP BY bucket
  `);
  for (const row of r.rows) {
    out.set(Number(row.bucket), { median: Number(row.median_perf), n: Number(row.n) });
  }
  return out;
}

async function _perfOutlierSignal(pool, accountId, bracketBaselines) {
  // Compare the player's average PERF in their *first 10 games* against the
  // median PERF of peers in the same TrueSkill bracket. Deviation in PERF
  // units above the cohort median maps linearly to 0..weight (capped at
  // +2.0 PERF above median = full weight). Bracket size is 250 MMR.
  const earlyRows = await pool.query(`
    SELECT AVG(perf)::float AS avg_perf, COUNT(*)::int AS n
    FROM (
      SELECT ps.perf
      FROM player_stats ps
      JOIN matches m ON m.match_id = ps.match_id
      WHERE ps.account_id = $1 AND ps.perf IS NOT NULL AND m.is_legacy = false
      ORDER BY m.date ASC
      LIMIT 10
    ) sub
  `, [accountId]);
  const avg = earlyRows.rows[0]?.avg_perf == null ? null : Number(earlyRows.rows[0].avg_perf);
  const n = Number(earlyRows.rows[0]?.n || 0);
  if (avg == null || n < 3) {
    return { value: null, weight: 0, contribution: 0, detail: 'no PERF data on early games' };
  }
  // Resolve the player's claimed TrueSkill bracket. `ratings.mmr` is the
  // TrueSkill-derived inhouse MMR; without it we can't pick a peer cohort
  // so the signal degrades to "no data" rather than guessing.
  const ratingRows = await pool.query(`SELECT mmr::float AS mmr FROM ratings WHERE player_id = $1`, [accountId]);
  const mmr = ratingRows.rows[0]?.mmr == null ? null : Number(ratingRows.rows[0].mmr);
  const bucket = _mmrBucket(mmr);
  if (bucket == null) {
    return { value: null, weight: 0, contribution: 0, detail: 'not rated yet — no bracket peer baseline' };
  }
  // Look up the per-bracket median. If we were handed a precomputed map
  // (the normal `recomputeAll` path) use it; otherwise compute the single
  // bucket on demand.
  let baseline = bracketBaselines ? bracketBaselines.get(bucket) : null;
  if (!baseline) {
    const bRows = await pool.query(`
      WITH early_perf AS (
        SELECT ps.account_id, AVG(ps.perf)::float AS avg_perf, COUNT(*)::int AS n
        FROM (
          SELECT ps.account_id, ps.perf,
                 ROW_NUMBER() OVER (PARTITION BY ps.account_id ORDER BY m.date ASC) AS rn
          FROM player_stats ps
          JOIN matches m ON m.match_id = ps.match_id
          WHERE ps.perf IS NOT NULL AND m.is_legacy = false AND ps.account_id > 0
        ) ps
        WHERE ps.rn <= 10
        GROUP BY ps.account_id
        HAVING COUNT(*) >= 3
      )
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ep.avg_perf)::float AS median_perf,
             COUNT(*)::int AS n
      FROM ratings r
      JOIN early_perf ep ON ep.account_id = r.player_id
      WHERE FLOOR(r.mmr / 250) * 250 = $1
    `, [bucket]);
    if (bRows.rows[0]?.median_perf != null && Number(bRows.rows[0].n) >= 3) {
      baseline = { median: Number(bRows.rows[0].median_perf), n: Number(bRows.rows[0].n) };
    }
  }
  if (!baseline || baseline.n < 3) {
    return { value: null, weight: 0, contribution: 0, detail: `bracket ${bucket} has too few peers for a baseline` };
  }
  const delta = avg - baseline.median;
  // Map 0..+2.0 PERF units above the cohort median → 0..1.
  const above = clamp(delta / 2.0, 0, 1);
  const contribution = above * SIGNAL_WEIGHTS.perf_outlier;
  return {
    value: Number(delta.toFixed(2)),
    weight: SIGNAL_WEIGHTS.perf_outlier,
    contribution: Math.round(contribution * 10) / 10,
    detail: `avg PERF ${avg.toFixed(2)} vs bracket ${bucket}–${bucket + 249} peer median ${baseline.median.toFixed(2)} (Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}, n=${baseline.n})`,
  };
}

async function _ageVsMmrSignal(pool, accountId) {
  // High MMR for low games = fast climb. We use the inhouse TrueSkill MMR
  // off the ratings table; a >1500 MMR with <20 games is the clearest tell.
  const r = await pool.query(`
    SELECT r.mmr::float AS mmr, r.games_played::int AS games
    FROM ratings r WHERE r.player_id = $1
  `, [accountId]);
  const mmr = r.rows[0]?.mmr == null ? null : Number(r.rows[0].mmr);
  const games = Number(r.rows[0]?.games || 0);
  if (mmr == null || games < MIN_MATCHES) return { value: null, weight: 0, contribution: 0, detail: 'not rated yet' };
  // climb-rate = mmr / sqrt(games). Higher = faster climb. Calibrated so
  // a typical 1000 MMR over 25 games → 200; >400 maxes out.
  const climb = mmr / Math.sqrt(Math.max(games, 1));
  const value = clamp((climb - 150) / 250, 0, 1);
  const contribution = value * SIGNAL_WEIGHTS.age_vs_mmr;
  return {
    value: Number(value.toFixed(3)),
    weight: SIGNAL_WEIGHTS.age_vs_mmr,
    contribution: Math.round(contribution * 10) / 10,
    detail: `MMR ${Math.round(mmr)} over ${games} games (climb rate ${climb.toFixed(0)})`,
  };
}

async function _fingerprintSignal(pool, accountId, sessionFingerprintIndex) {
  // Best-effort: connect-pg-simple's user_sessions table stores the cookie +
  // session payload as JSONB. If the application ever stashes an IP/UA on
  // the session (it currently does not for production sessions) we can
  // surface overlap with another account here. The index is built once per
  // scorer run via _buildSessionFingerprintIndex() to keep this O(1) per
  // account. Falls back to "no data" silently when the index is empty.
  if (!sessionFingerprintIndex || sessionFingerprintIndex.size === 0) {
    return { value: null, weight: 0, contribution: 0, detail: 'no fingerprint data available' };
  }
  const myPrints = sessionFingerprintIndex.get(String(accountId));
  if (!myPrints || myPrints.size === 0) {
    return { value: null, weight: 0, contribution: 0, detail: 'no fingerprint for this account' };
  }
  const overlaps = [];
  for (const [otherId, prints] of sessionFingerprintIndex) {
    if (otherId === String(accountId)) continue;
    let hits = 0;
    for (const p of myPrints) if (prints.has(p)) hits++;
    if (hits > 0) overlaps.push({ otherId, hits });
  }
  if (overlaps.length === 0) {
    return { value: 0, weight: SIGNAL_WEIGHTS.fingerprint, contribution: 0, detail: 'no overlapping fingerprints' };
  }
  overlaps.sort((a, b) => b.hits - a.hits);
  const top = overlaps[0];
  // Any overlap is meaningful; multiple overlaps with the same account caps weight.
  const value = clamp(top.hits / 3, 0, 1);
  const contribution = value * SIGNAL_WEIGHTS.fingerprint;
  return {
    value: Number(value.toFixed(3)),
    weight: SIGNAL_WEIGHTS.fingerprint,
    contribution: Math.round(contribution * 10) / 10,
    detail: `shares fingerprint with account ${top.otherId} (${top.hits} overlap${top.hits === 1 ? '' : 's'})`,
  };
}

// Build a Map<accountId, Set<fingerprint>> from user_sessions. We look for
// any 'ip' or 'ua' field nested under sess.passport / sess.user / sess
// itself — the table is opportunistic input only. Empty Map when nothing
// matches, which makes the fingerprint signal a no-op.
async function _buildSessionFingerprintIndex(pool) {
  const out = new Map();
  let rows;
  try {
    const r = await pool.query(`SELECT sess FROM user_sessions LIMIT 5000`);
    rows = r.rows;
  } catch (_) {
    return out;
  }
  for (const row of rows) {
    const sess = row.sess || {};
    const aid = sess?.steamUser?.accountId
      || sess?.passport?.user?.accountId
      || sess?.user?.accountId
      || sess?.accountId
      || null;
    if (!aid) continue;
    const prints = [];
    const ip = sess?.ip || sess?.lastIp || sess?.passport?.user?.ip;
    const ua = sess?.ua || sess?.userAgent || sess?.passport?.user?.userAgent;
    if (ip) prints.push(`ip:${ip}`);
    if (ua) prints.push(`ua:${ua}`);
    if (prints.length === 0) continue;
    const key = String(aid);
    if (!out.has(key)) out.set(key, new Set());
    const set = out.get(key);
    for (const p of prints) set.add(p);
  }
  return out;
}

async function scoreAccount(pool, accountId, opts = {}) {
  const signals = {
    shared_lobby: await _sharedLobbySignal(pool, accountId),
    hero_pool: await _heroPoolSignal(pool, accountId),
    perf_outlier: await _perfOutlierSignal(pool, accountId, opts.bracketBaselines),
    age_vs_mmr: await _ageVsMmrSignal(pool, accountId),
    fingerprint: await _fingerprintSignal(pool, accountId, opts.sessionFingerprintIndex),
  };
  let total = 0;
  for (const k of Object.keys(signals)) total += signals[k].contribution || 0;
  const score = Math.min(100, Math.round(total));
  return { score, signals };
}

// Recompute every active account in one pass. Returns { scanned, written }.
async function recomputeAll(pool, { onProgress } = {}) {
  const ids = await _activeAccountIds(pool);
  const idx = await _buildSessionFingerprintIndex(pool);
  const bracketBaselines = await _buildBracketBaselines(pool).catch(() => new Map());
  let written = 0;
  for (let i = 0; i < ids.length; i++) {
    const aid = ids[i];
    try {
      const { score, signals } = await scoreAccount(pool, aid, { sessionFingerprintIndex: idx, bracketBaselines });
      await pool.query(`
        INSERT INTO smurf_scores (account_id, score, signals, computed_at)
        VALUES ($1, $2, $3::jsonb, NOW())
        ON CONFLICT (account_id) DO UPDATE
        SET score = EXCLUDED.score,
            signals = EXCLUDED.signals,
            computed_at = NOW()
      `, [aid, score, JSON.stringify(signals)]);
      written++;
    } catch (e) {
      console.warn('[Smurf] score failed for', aid, '—', e?.message || e);
    }
    if (onProgress && (i % 25 === 0)) onProgress(i, ids.length);
  }
  return { scanned: ids.length, written };
}

module.exports = {
  scoreAccount,
  recomputeAll,
  SIGNAL_WEIGHTS,
  MIN_MATCHES,
  _buildSessionFingerprintIndex,
  _buildBracketBaselines,
  _mmrBucket,
};
