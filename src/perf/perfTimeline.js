// PERF — timeline_v1 (per-minute, time-weighted) scoring path.
//
// Consumes per-minute samples (matches.game_timeline.players[].samples[]) and
// scores each minute against position×minute_bucket baselines from
// `position_baselines`. Time-weights the lane stage 1.25× and applies a
// passive penalty when a player is 5+ minutes behind their team net-worth
// average with <10% kill participation. Maps the weighted average to 1–10.
//
// Public API:
//   loadBaselines(pool, position) → { [stat_key]: { [bucket]: {p10..p99} } }
//   computeTimelinePerf(player, ctx) → { perf, breakdown } | null
//
// `null` is returned when the timeline data is too sparse to score (e.g. <5
// usable minute samples), letting the caller fall back to endgame_v1.

const { POSITION_WEIGHTS } = require('./perfWeights.config');

// Stats scored per minute. Most are per-minute deltas; nw is an instant value.
// `dir = +1` means higher is better, `-1` means lower is better.
const STAT_DEFS = [
  { key: 'gold',   dir: +1, kind: 'delta' }, // total earned gold (cum) → gpm bucket
  { key: 'xp',     dir: +1, kind: 'delta' },
  { key: 'cs',     dir: +1, kind: 'delta' }, // last_hits per minute
  { key: 'denies', dir: +1, kind: 'delta' },
  { key: 'k',      dir: +1, kind: 'delta' },
  { key: 'd',      dir: -1, kind: 'delta' },
  { key: 'a',      dir: +1, kind: 'delta' },
  { key: 'nw',     dir: +1, kind: 'instant' },
  { key: 'obs',    dir: +1, kind: 'delta' },
  { key: 'sen',    dir: +1, kind: 'delta' },
  { key: 'hd_cum', dir: +1, kind: 'delta' },
  { key: 'td_cum', dir: +1, kind: 'delta' },
  { key: 'wk_cum', dir: +1, kind: 'delta' },
];

// Map per-stat scores onto the existing PERF weights so that timeline scoring
// is comparable in spirit to endgame_v1. Stats not represented in
// POSITION_WEIGHTS map onto the closest analogue.
function _statWeightsForPosition(position) {
  const w = POSITION_WEIGHTS[(position >= 1 && position <= 5) ? position : 3];
  return {
    gold:   w.gpm,
    xp:     w.xpm,
    cs:     w.lh,
    denies: w.lh * 0.25,
    k:      w.kp * 0.5,
    d:      w.surv,
    a:      w.kp * 0.5,
    nw:     w.gpm * 0.5,
    obs:    w.vis * 0.5,
    sen:    w.vis * 0.5,
    hd_cum: w.hd,
    td_cum: w.td,
    wk_cum: w.deward,
  };
}

async function loadBaselines(pool, position) {
  const res = await pool.query(
    `SELECT minute_bucket, stat_key, p10, p25, p50, p75, p90, p99, sample_count
       FROM position_baselines
      WHERE position = $1`,
    [position]
  );
  const out = {};
  for (const r of res.rows) {
    if (!out[r.stat_key]) out[r.stat_key] = {};
    out[r.stat_key][r.minute_bucket] = r;
  }
  return out;
}

// Map a value to a [0..1] percentile rank using the (p10..p99) anchors.
// Returns 0.05 below p10 (poor), 0.95 at p99, and clamps slightly above to 1.05.
function _percentile(value, b) {
  if (b == null || b.p10 == null) return null;
  const anchors = [
    [0.10, b.p10], [0.25, b.p25], [0.50, b.p50],
    [0.75, b.p75], [0.90, b.p90], [0.99, b.p99],
  ].filter(([, v]) => v != null);
  if (anchors.length < 2) return null;
  if (value <= anchors[0][1]) {
    // Linear ramp 0 → first anchor
    const first = anchors[0];
    return Math.max(0, first[0] * (value / Math.max(1e-9, first[1])));
  }
  for (let i = 0; i < anchors.length - 1; i++) {
    const [pa, va] = anchors[i];
    const [pb, vb] = anchors[i + 1];
    if (value <= vb) {
      if (vb === va) return pb;
      return pa + (pb - pa) * (value - va) / (vb - va);
    }
  }
  // Above p99 — small headroom up to 1.05
  const last = anchors[anchors.length - 1];
  return Math.min(1.05, last[0] + 0.06 * (value - last[1]) / Math.max(1e-9, last[1]));
}

// Resample player samples to one snapshot per game-minute. Each sample chosen
// is the latest snapshot at or before minute*60 seconds.
function _resampleByMinute(samples, durationSec) {
  const sorted = [...samples].sort((a, b) => (a.t || 0) - (b.t || 0));
  const out = [];
  const totalMinutes = Math.max(1, Math.floor(durationSec / 60));
  let idx = 0;
  for (let m = 0; m <= totalMinutes; m++) {
    const tCutoff = m * 60;
    while (idx + 1 < sorted.length && (sorted[idx + 1].t || 0) <= tCutoff) idx++;
    const s = sorted[idx];
    if (!s || (s.t || 0) > tCutoff + 30) {
      out.push(null);
      continue;
    }
    out.push(s);
  }
  return out;
}

// Map a weighted-sum raw score (0 = at p50 across the board, 1 = top-percentile
// across the board) to a 1–10 PI, mirroring perfService's _mapToPi calibration.
function _mapToPi(raw) {
  // raw=0 → 5.0, raw=1 → 9.0; small headroom above 1 lets exceptional play hit 10.
  const pi = 5.0 + 4.0 * raw;
  return Math.max(1.0, Math.min(10.0, pi));
}

// Compute timeline_v1 PERF for a single player.
//
//   playerTimeline:  { samples: [...], team }      from game_timeline.players[]
//   ctx: { position, durationSec, baselines, teammateSamples, teamKills, won }
//
// Returns { perf, breakdown } or null when not enough timeline data.
function computeTimelinePerf(playerTimeline, ctx) {
  const samples = Array.isArray(playerTimeline?.samples) ? playerTimeline.samples : [];
  if (samples.length < 5) return null;

  const dur = Math.max(60, ctx.durationSec || 0);
  const totalMinutes = Math.max(1, Math.floor(dur / 60));
  if (totalMinutes < 5) return null;

  const position = (ctx.position >= 1 && ctx.position <= 5) ? ctx.position : 3;
  const statWeights = _statWeightsForPosition(position);

  const playerByMin = _resampleByMinute(samples, dur);
  const teamByMin = (ctx.teammateSamples || []).map(ts => _resampleByMinute(ts, dur));

  // Per-minute scoring.
  const minuteScores = []; // { m, score, weight, penalty }
  let scoredMinutes = 0;
  let usedBaselineCount = 0;

  for (let m = 1; m <= totalMinutes; m++) {
    const cur = playerByMin[m];
    const prev = playerByMin[m - 1];
    if (!cur || !prev) { minuteScores.push(null); continue; }

    const bucket = Math.min(120, m); // baselines keyed by minute index, capped
    let weighted = 0;
    let weightCovered = 0;
    let baselinesHit = 0;

    for (const def of STAT_DEFS) {
      const baseline = ctx.baselines[def.key]?.[bucket]
                    || ctx.baselines[def.key]?.[Math.min(120, Math.max(1, bucket - 1))];
      if (!baseline) continue;

      let v;
      if (def.kind === 'delta') {
        v = (cur[def.key] || 0) - (prev[def.key] || 0);
      } else {
        v = cur[def.key] || 0;
      }
      // For "lower is better" stats, mirror against p50 before percentile lookup.
      if (def.dir === -1 && baseline.p50 != null) {
        v = Math.max(0, 2 * baseline.p50 - v);
      }
      const pct = _percentile(v, baseline);
      if (pct == null) continue;
      const w = statWeights[def.key] || 0;
      // Map percentile [0..1] → score centred on p50 (0.5 → 0, 0.99 → ~1.0).
      const s = (pct - 0.5) * 2;
      weighted += s * w;
      weightCovered += w;
      baselinesHit++;
    }

    if (baselinesHit < 3) { minuteScores.push(null); continue; }
    const minuteScore = weighted / Math.max(1e-9, weightCovered);
    usedBaselineCount += baselinesHit;

    // Time weight: lane stage (minutes 0–10) gets 1.25× to capture early impact.
    const timeWeight = m <= 10 ? 1.25 : 1.0;

    minuteScores.push({ m, score: minuteScore, weight: timeWeight });
    scoredMinutes++;
  }

  if (scoredMinutes < 5) return null;

  // Passive penalty: for each scored minute m ≥ 5, check whether the player's
  // current networth is at or below the team's average networth from minute
  // (m-5) AND whether kill participation in the window [m-5, m] is < 10%.
  // Apply a fixed score subtraction per offending minute.
  let totalPenalty = 0;
  let penalisedMinutes = 0;
  if (teamByMin.length > 0) {
    for (let m = 5; m <= totalMinutes; m++) {
      const scoreEntry = minuteScores[m - 1];
      if (!scoreEntry) continue;
      const cur = playerByMin[m];
      const prev5 = playerByMin[m - 5];
      if (!cur || !prev5) continue;

      // Team avg NW at minute m-5 (using teammates only).
      let nwSum = 0, nwN = 0;
      for (const tm of teamByMin) {
        const s = tm[m - 5];
        if (s && s.nw != null) { nwSum += s.nw; nwN++; }
      }
      if (nwN === 0) continue;
      const teamAvgNwAt5Ago = nwSum / nwN;

      // Kill participation in the trailing 5-minute window.
      const playerWindowKA = ((cur.k || 0) - (prev5.k || 0)) + ((cur.a || 0) - (prev5.a || 0));
      let teamWindowK = 0;
      for (const tm of teamByMin) {
        const c = tm[m]; const p = tm[m - 5];
        if (c && p) teamWindowK += Math.max(0, (c.k || 0) - (p.k || 0));
      }
      teamWindowK += Math.max(0, (cur.k || 0) - (prev5.k || 0));
      const windowKp = teamWindowK > 0 ? playerWindowKA / teamWindowK : 0;

      if ((cur.nw || 0) <= teamAvgNwAt5Ago && windowKp < 0.10) {
        scoreEntry.penalty = 0.20; // subtract 0.20 from this minute's score
        totalPenalty += 0.20 * scoreEntry.weight;
        penalisedMinutes++;
      }
    }
  }

  // Weighted average (with penalty).
  let num = 0, den = 0;
  for (const s of minuteScores) {
    if (!s) continue;
    const adj = s.score - (s.penalty || 0);
    num += adj * s.weight;
    den += s.weight;
  }
  const raw = den > 0 ? num / den : 0;

  // Win bonus matches endgame_v1 spirit (small).
  const wWin = ctx.won ? 0.04 : 0.0;
  const perfRaw = raw + wWin;
  const perf = Math.round(_mapToPi(perfRaw) * 10) / 10;

  return {
    perf,
    breakdown: {
      position,
      raw: Math.round(perfRaw * 1000) / 1000,
      timeline: {
        scored_minutes: scoredMinutes,
        baselines_hit: usedBaselineCount,
        penalised_minutes: penalisedMinutes,
        total_penalty: Math.round(totalPenalty * 1000) / 1000,
        win_bonus: wWin,
      },
    },
  };
}

// Detect whether `position_baselines` has enough rows to score a match.
async function baselinesAreUsable(pool) {
  const res = await pool.query(`SELECT COUNT(*)::int AS c FROM position_baselines`);
  // Heuristic: need at least a few hundred rows (several positions × several
  // minute buckets × several stat keys) before the timeline path is meaningful.
  return (res.rows[0]?.c || 0) >= 200;
}

module.exports = {
  loadBaselines,
  computeTimelinePerf,
  baselinesAreUsable,
  STAT_DEFS,
};
