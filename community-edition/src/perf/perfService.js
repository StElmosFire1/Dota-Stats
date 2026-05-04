// PERF — Positive Impact Score service.
//
// Computes a position-aware, duration-normalised 1–10 score for each player
// in a match using end-game player_stats. Persists `perf`, `perf_breakdown`
// (per-stat normalised scores + weighted contributions) and `perf_source`
// ('endgame_v1' currently; 'timeline_v1' reserved for future per-minute path).
//
// Design goals:
//   • 5.0 ≈ average game for that position
//   • 7.0 ≈ very good
//   • 9.0+ ≈ top ~1%
//   • 10.0 achievable for ANY role with truly elite play across the board
//   • No structural cap on supports — vision/stuns/heals carry weight
//
// FUTURE: when the Java parser starts emitting richer per-minute samples
// (hd_cum, td_cum, wards_killed_cum), switch to a time-weighted per-minute
// percentile path against a `position_baselines` table, then a LightGBM
// regressor trained on MVP votes and win contribution.

const { targetsForPosition, normTarget } = require('./perfWeights.config');
const { loadBaselines, computeTimelinePerf, baselinesAreUsable } = require('./perfTimeline');

// Map a weighted-sum score (0 = all-avg, 1 = all-elite) to a 1–10 PI.
// Calibrated so PI(0) = 5.0, PI(1) = 9.0, with linear extension above 1
// allowing PI 10 only when several stats are well above elite (clipped at 1.4
// per stat, so the maximum achievable raw is ~1.4 → PI 10.6 → clipped to 10).
function _mapToPi(raw) {
  const pi = 5.0 + 4.0 * raw;
  return Math.max(1.0, Math.min(10.0, pi));
}

// Compute PERF for one player given:
//   p:     player_stats row (snake_case fields)
//   ctx:   { durationSec, teamKills, won }
function computePerfForPlayer(p, ctx) {
  const dur = Math.max(60, ctx.durationSec || 0);
  const minutes = dur / 60;
  const { targets, weights, position } = targetsForPosition(p.position);

  // Per-minute observed values
  const kpm      = (p.kills || 0)        / minutes;
  const lhpm     = (p.last_hits || 0)    / minutes;
  const hdpm     = (p.hero_damage || 0)  / minutes;
  const tdpm     = (p.tower_damage || 0) / minutes;
  const obspm    = (p.obs_placed || 0)   / minutes;
  const senpm    = (p.sen_placed || 0)   / minutes;
  const dewardpm = (p.wards_killed || 0) / minutes;
  const stunpm   = (p.stun_duration || 0)/ minutes;
  const healpm   = (p.hero_healing || 0) / minutes;
  const gpm      = p.gpm || 0;
  const xpm      = p.xpm || 0;

  // Kill participation: (k+a)/teamK, capped at 1.0 contribution-wise
  const teamK = ctx.teamKills || 0;
  const kpRaw = teamK > 0 ? ((p.kills || 0) + (p.assists || 0)) / teamK : 0;
  const kpScore = normTarget(kpRaw, targets.apm_kp);

  // Survival: lower deaths/min is better. Score = 1 at <=0.05 deaths/min,
  // 0 at 0.20 dpm, negative beyond. Symmetric across roles.
  const dpm = (p.deaths || 0) / minutes;
  const survScore = Math.max(-0.5, Math.min(1.4, (0.20 - dpm) / 0.15));

  // Per-stat normalised scores
  const sGpm    = normTarget(gpm,      targets.gpm);
  const sXpm    = normTarget(xpm,      targets.xpm);
  const sLh     = normTarget(lhpm,     targets.lhpm);
  const sHd     = normTarget(hdpm,     targets.hdpm);
  const sTd     = normTarget(tdpm,     targets.tdpm);
  // Combined vision = obs + sen (placement)
  const visAvg   = targets.obspm.avg   + targets.senpm.avg;
  const visElite = targets.obspm.elite + targets.senpm.elite;
  const sVis    = normTarget(obspm + senpm, { avg: visAvg, elite: visElite });
  const sDeward = normTarget(dewardpm, targets.dewardpm);
  const sStun   = normTarget(stunpm,   targets.stunpm);
  const sHeal   = normTarget(healpm,   targets.healpm);
  const sWin    = ctx.won ? 1.0 : 0.0;

  // Weighted sum
  const contributions = {
    kp:     kpScore   * weights.kp,
    surv:   survScore * weights.surv,
    gpm:    sGpm      * weights.gpm,
    xpm:    sXpm      * weights.xpm,
    lh:     sLh       * weights.lh,
    hd:     sHd       * weights.hd,
    td:     sTd       * weights.td,
    vis:    sVis      * weights.vis,
    deward: sDeward   * weights.deward,
    stun:   sStun     * weights.stun,
    heal:   sHeal     * weights.heal,
    win:    sWin      * weights.win,
  };
  const raw = Object.values(contributions).reduce((a, b) => a + b, 0);
  const perf = Math.round(_mapToPi(raw) * 10) / 10;

  return {
    perf,
    breakdown: {
      position,
      raw: Math.round(raw * 1000) / 1000,
      scores: {
        kp: round3(kpScore), surv: round3(survScore),
        gpm: round3(sGpm), xpm: round3(sXpm), lh: round3(sLh),
        hd: round3(sHd), td: round3(sTd),
        vis: round3(sVis), deward: round3(sDeward),
        stun: round3(sStun), heal: round3(sHeal),
        win: sWin,
      },
      contributions: Object.fromEntries(Object.entries(contributions).map(([k, v]) => [k, round3(v)])),
      weights,
    },
  };
}

function round3(x) { return Math.round(x * 1000) / 1000; }

// Compute and persist PERF for all players in a match. Idempotent — overwrites
// existing perf values for the match. Best-effort: a failure here must not
// break match recording. Caller may pass an existing pg client (in a txn) or
// undefined (uses a fresh pool client).
async function computeAndSavePerfForMatch(getPool, matchId, opts = {}) {
  const pool = getPool();
  try {
    const matchRes = await pool.query(
      `SELECT match_id, duration, radiant_win FROM matches WHERE match_id = $1`,
      [matchId]
    );
    if (matchRes.rows.length === 0) return { ok: false, reason: 'no_match' };
    const m = matchRes.rows[0];

    const playersRes = await pool.query(
      `SELECT slot, account_id, team, position, kills, deaths, assists,
              last_hits, gpm, xpm, hero_damage, tower_damage, hero_healing,
              obs_placed, sen_placed, wards_killed, stun_duration
         FROM player_stats WHERE match_id = $1`,
      [matchId]
    );
    if (playersRes.rows.length === 0) return { ok: false, reason: 'no_players' };

    let radK = 0, dirK = 0;
    for (const p of playersRes.rows) {
      if (p.team === 'radiant') radK += (p.kills || 0);
      else if (p.team === 'dire') dirK += (p.kills || 0);
    }

    // Determine perf_source. The richer per-minute timeline path
    // (`timeline_v1`) requires BOTH (a) replay samples carrying hd_cum/td_cum/
    // wk_cum and (b) `position_baselines` populated with enough rows to score
    // against. When either is missing we fall back to the `endgame_v1` path and
    // clamp the max at 8.5 — this prevents inflating a player from a stat-line
    // that was never weighed against true per-minute baselines.
    const tlRes = await pool.query(
      `SELECT (game_timeline->'players'->0->'samples'->0 ? 'hd_cum') AS has_timeline,
              game_timeline
         FROM matches WHERE match_id = $1`,
      [matchId]
    );
    const hasTimelineSamples = !!tlRes.rows[0]?.has_timeline;
    const baselinesReady = hasTimelineSamples ? await baselinesAreUsable(pool) : false;
    const useTimeline = hasTimelineSamples && baselinesReady;
    const fallbackCap = useTimeline ? 10.0 : 8.5;

    // When the timeline path is active we compute per player against per-position
    // baselines. Each player needs the teammate sample list for the passive-penalty
    // network-worth comparison, so we group players by team here.
    const timelinePlayers = useTimeline
      ? (tlRes.rows[0]?.game_timeline?.players || [])
      : [];
    const samplesByTeamSlot = {}; // 'radiant'|'dire' → { [slot]: samples }
    if (useTimeline) {
      for (const tp of timelinePlayers) {
        if (tp?.team && tp?.slot != null) {
          if (!samplesByTeamSlot[tp.team]) samplesByTeamSlot[tp.team] = {};
          samplesByTeamSlot[tp.team][tp.slot] = tp.samples || [];
        }
      }
    }

    // Cache per-position baseline lookups so we only hit the DB ≤5 times.
    const baselineCache = {};
    async function _baselinesFor(pos) {
      const key = (pos >= 1 && pos <= 5) ? pos : 3;
      if (!baselineCache[key]) baselineCache[key] = await loadBaselines(pool, key);
      return baselineCache[key];
    }

    const updates = [];
    let timelineUsedCount = 0, timelineFallbackCount = 0;
    for (const p of playersRes.rows) {
      const won = (p.team === 'radiant' && m.radiant_win) || (p.team === 'dire' && !m.radiant_win);
      const teamKills = p.team === 'radiant' ? radK : dirK;

      let result = null;
      let usedSource = 'endgame_v1';
      if (useTimeline) {
        const tlPlayer = timelinePlayers.find(tp => tp?.slot === p.slot);
        if (tlPlayer && Array.isArray(tlPlayer.samples) && tlPlayer.samples.length > 0) {
          const baselines = await _baselinesFor(p.position);
          const teammates = Object.entries(samplesByTeamSlot[p.team] || {})
            .filter(([s]) => parseInt(s) !== p.slot)
            .map(([, samples]) => samples);
          const tlResult = computeTimelinePerf(tlPlayer, {
            position: p.position,
            durationSec: m.duration,
            baselines,
            teammateSamples: teammates,
            teamKills,
            won,
          });
          if (tlResult) {
            result = tlResult;
            usedSource = 'timeline_v1';
            timelineUsedCount++;
          } else {
            timelineFallbackCount++;
          }
        }
      }

      if (!result) {
        result = computePerfForPlayer(p, {
          durationSec: m.duration, teamKills, won,
        });
      }

      const perCap = usedSource === 'timeline_v1' ? 10.0 : fallbackCap;
      const cappedPerf = Math.round(Math.min(result.perf, perCap) * 10) / 10;
      result.breakdown.cap_applied = cappedPerf < result.perf ? perCap : null;
      result.breakdown.source = usedSource;
      updates.push({ slot: p.slot, perf: cappedPerf, breakdown: result.breakdown, source: usedSource });
    }
    // The match-level `perf_source` reported on each row reflects the path that
    // actually scored that player. Keeps `breakdown.source` and stored column
    // in sync even when timeline scoring fell back for some players in a match.

    for (const u of updates) {
      await pool.query(
        `UPDATE player_stats
            SET perf = $1, perf_breakdown = $2, perf_source = $3
          WHERE match_id = $4 AND slot = $5`,
        [u.perf, JSON.stringify(u.breakdown), u.source, matchId, u.slot]
      );
    }
    return {
      ok: true,
      count: updates.length,
      timeline_used: timelineUsedCount,
      timeline_fallback: timelineFallbackCount,
    };
  } catch (err) {
    if (!opts.silent) console.warn(`[PERF] match ${matchId} failed:`, err.message);
    return { ok: false, reason: err.message };
  }
}

// Backfill PERF across the full match history. Processes oldest-missing first
// so that recent matches stay current and progress is observable. Defaults
// process ALL pending matches in batches of 50 with a 250ms inter-batch sleep
// to keep DB load reasonable. Emits per-batch progress logs to stdout.
async function backfillPerf(getPool, { limit = null, batchSize = 50, sleepMs = 250, onProgress = null, all = false } = {}) {
  const pool = getPool();
  const queryParams = [];
  let limitClause = '';
  if (limit && limit > 0) {
    queryParams.push(limit);
    limitClause = ` LIMIT $${queryParams.length}`;
  }
  // Default: only matches with at least one NULL perf row (faster, idempotent
  // top-up). When `all: true`, recompute every match in history — useful when
  // weights/baselines change and existing scores need recalibrating.
  const whereClause = all
    ? '1=1'
    : 'EXISTS (SELECT 1 FROM player_stats ps WHERE ps.match_id = m.match_id AND ps.perf IS NULL)';
  const res = await pool.query(
    `SELECT m.match_id
       FROM matches m
      WHERE ${whereClause}
      ORDER BY m.match_id ASC${limitClause}`,
    queryParams
  );
  const matchIds = res.rows.map(r => r.match_id);
  const total = matchIds.length;
  console.log(`[PERF backfill] ${total} matches pending — starting (batchSize=${batchSize}, sleepMs=${sleepMs})`);
  let done = 0, ok = 0, failed = 0;
  for (let i = 0; i < matchIds.length; i += batchSize) {
    const batch = matchIds.slice(i, i + batchSize);
    for (const mid of batch) {
      const r = await computeAndSavePerfForMatch(getPool, mid, { silent: true });
      if (r.ok) ok++; else failed++;
      done++;
    }
    console.log(`[PERF backfill] progress ${done}/${total} (ok=${ok} failed=${failed})`);
    if (typeof onProgress === 'function') {
      try { await onProgress({ done, total, ok, failed }); } catch (_) {}
    }
    if (sleepMs > 0 && i + batchSize < matchIds.length) {
      await new Promise(res => setTimeout(res, sleepMs));
    }
  }
  console.log(`[PERF backfill] done: total=${total} processed=${done} ok=${ok} failed=${failed}`);
  return { total, processed: done, ok, failed };
}

module.exports = {
  computePerfForPlayer,
  computeAndSavePerfForMatch,
  backfillPerf,
};
