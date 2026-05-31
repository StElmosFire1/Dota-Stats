// PERF Growth Coach — shared insight helpers (Task #628).
//
// Turns the persisted PERF score + raw per-game stats into a personal
// improvement read: a PERF trend over time, the player's weakest per-position
// dimensions vs their position-bracket peers, a concrete "what good looks like"
// target for each weak dimension (from the hand-tuned perfWeights targets), and
// the player's own recent matches where each dimension dragged the number down.
//
// `computeWeakestDimensions` is the single source of truth for the weakest-stat
// computation that both the coach-pairing recommender and the growth view share
// (the task calls for reuse rather than a parallel implementation).

const { POSITION_TARGETS } = require('./perfWeights.config');

// Each row: [sql_expr, label, lowerBetter]. Per-minute metrics are computed
// inline against the real `player_stats` + `matches` schema (raw counters
// divided by `matches.duration / 60.0`). `ps.perf` is the persisted
// position-aware score and is included as the headline dimension.
const STAT_DIMS = [
  ['ps.perf',                                     'PERF score',        false],
  ['ps.kills    / NULLIF(m.duration/60.0, 0)',    'Kills / min',       false],
  ['ps.deaths   / NULLIF(m.duration/60.0, 0)',    'Deaths / min',      true],
  ['ps.assists  / NULLIF(m.duration/60.0, 0)',    'Assists / min',     false],
  ['ps.gpm::float',                               'Gold / min',        false],
  ['ps.xpm::float',                               'XP / min',          false],
  ['ps.last_hits   / NULLIF(m.duration/60.0, 0)', 'Last hits / min',   false],
  ['ps.hero_damage / NULLIF(m.duration/60.0, 0)', 'Hero damage / min', false],
];

// Map a stat dimension key → the perfWeights target key + its display format.
// Stats with no clean per-minute target (assists, the overall PERF score) fall
// back to the measured peer average as their reference, with no elite target.
const TARGET_MAP = {
  kills_min:       { key: 'kpm',  format: 'dec1' },
  deaths_min:      { key: 'dpm',  format: 'dec1' },
  gold_min:        { key: 'gpm',  format: 'int'  },
  xp_min:          { key: 'xpm',  format: 'int'  },
  last_hits_min:   { key: 'lhpm', format: 'dec1' },
  hero_damage_min: { key: 'hdpm', format: 'int'  },
};
const STAT_FORMAT = {
  perf_score: 'dec1', kills_min: 'dec1', deaths_min: 'dec1', assists_min: 'dec1',
  gold_min: 'int', xp_min: 'int', last_hits_min: 'dec1', hero_damage_min: 'int',
};

function statKeyFor(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function _normaliseIds(ownIds) {
  const ids = (Array.isArray(ownIds) ? ownIds : [ownIds])
    .map(Number).filter(n => Number.isFinite(n) && n > 0);
  return ids.length ? ids : [0];
}

// Returns ALL stat dimensions for the player's primary position, each annotated
// with the player's own average, the peer average, the normalised delta-percent
// (negative = below peers, after accounting for lower-is-better stats), and the
// raw lower_better flag. Sorted ascending by delta_pct so the weakest dimension
// comes first. Callers slice to the count they want. Returns [] when there is
// no usable position or data.
async function computeWeakestDimensions(pool, ownIds, primaryPosition) {
  if (!primaryPosition) return [];
  const ids = _normaliseIds(ownIds);
  const cols = STAT_DIMS.map(([expr], i) =>
    `AVG(CASE WHEN ps.account_id = ANY($1::bigint[]) THEN ${expr} END)::float AS own_${i}, ` +
    `AVG(CASE WHEN NOT (ps.account_id = ANY($1::bigint[])) THEN ${expr} END)::float AS peer_${i}`
  ).join(', ');
  let r;
  try {
    r = await pool.query(
      `SELECT ${cols}
         FROM player_stats ps
         JOIN matches m ON m.match_id::text = ps.match_id::text
        WHERE ps.position = $2
          AND m.date > NOW() - INTERVAL '90 days'
          AND m.duration > 0`,
      [ids, primaryPosition]
    );
  } catch (e) {
    // Defensive: if a deployment lacks `ps.perf` or `m.date`, retry without the
    // PERF dimension and without the time window. Worst case we still return
    // raw per-minute metrics rather than [].
    try {
      const altCols = STAT_DIMS.slice(1).map(([expr], i) =>
        `AVG(CASE WHEN ps.account_id = ANY($1::bigint[]) THEN ${expr} END)::float AS own_${i + 1}, ` +
        `AVG(CASE WHEN NOT (ps.account_id = ANY($1::bigint[])) THEN ${expr} END)::float AS peer_${i + 1}`
      ).join(', ');
      r = await pool.query(
        `SELECT ${altCols}
           FROM player_stats ps
           JOIN matches m ON m.match_id::text = ps.match_id::text
          WHERE ps.position = $2
            AND m.duration > 0`,
        [ids, primaryPosition]
      );
    } catch {
      return [];
    }
  }
  const row = r.rows[0] || {};
  const dims = [];
  STAT_DIMS.forEach(([_expr, label, lowerBetter], i) => {
    const own = row[`own_${i}`];
    const peer = row[`peer_${i}`];
    if (own == null || peer == null || peer === 0) return;
    const rawDelta = (own - peer) / Math.abs(peer);
    const normalised = lowerBetter ? -rawDelta : rawDelta;
    dims.push({
      stat: statKeyFor(label),
      label,
      delta_pct: Math.round(normalised * 100),
      own,
      peer,
      lower_better: lowerBetter,
    });
  });
  dims.sort((a, b) => a.delta_pct - b.delta_pct);
  return dims;
}

async function _primaryPosition(pool, ids) {
  const r = await pool.query(
    `SELECT position, COUNT(*)::int AS games
       FROM player_stats
      WHERE account_id = ANY($1::bigint[])
        AND position BETWEEN 1 AND 5
      GROUP BY position
      ORDER BY games DESC
      LIMIT 1`,
    [ids]
  );
  return r.rows[0]?.position || null;
}

async function _perfHistory(pool, ids) {
  const r = await pool.query(
    `SELECT m.match_id::text AS match_id, m.date, ps.perf::float AS perf,
            ps.position, ps.hero_id,
            CASE WHEN (ps.team = 'radiant' AND m.radiant_win)
                   OR (ps.team = 'dire' AND NOT m.radiant_win)
              THEN 1 ELSE 0 END AS won
       FROM player_stats ps
       JOIN matches m ON m.match_id::text = ps.match_id::text
      WHERE ps.account_id = ANY($1::bigint[])
        AND ps.perf IS NOT NULL
        AND m.is_legacy = false
      ORDER BY m.date DESC
      LIMIT 100`,
    [ids]
  );
  // Oldest -> newest for charting.
  return r.rows.reverse();
}

// Recent matches at the player's primary position, with the raw counters needed
// to recompute each per-minute dimension in JS. Used to surface the matches
// where a weak dimension was worst.
async function _recentPositionMatches(pool, ids, position) {
  const r = await pool.query(
    `SELECT m.match_id::text AS match_id, m.date, ps.hero_id, ps.perf::float AS perf,
            ps.kills, ps.deaths, ps.assists, ps.gpm, ps.xpm, ps.last_hits,
            ps.hero_damage, m.duration
       FROM player_stats ps
       JOIN matches m ON m.match_id::text = ps.match_id::text
      WHERE ps.account_id = ANY($1::bigint[])
        AND ps.position = $2
        AND m.is_legacy = false
        AND m.duration > 0
      ORDER BY m.date DESC
      LIMIT 60`,
    [ids, position]
  );
  return r.rows;
}

function _statValueForMatch(statKey, row) {
  const minutes = (row.duration || 0) / 60.0;
  if (minutes <= 0) return null;
  switch (statKey) {
    case 'perf_score':      return row.perf != null ? Number(row.perf) : null;
    case 'kills_min':       return (row.kills || 0) / minutes;
    case 'deaths_min':      return (row.deaths || 0) / minutes;
    case 'assists_min':     return (row.assists || 0) / minutes;
    case 'gold_min':        return row.gpm != null ? Number(row.gpm) : null;
    case 'xp_min':          return row.xpm != null ? Number(row.xpm) : null;
    case 'last_hits_min':   return (row.last_hits || 0) / minutes;
    case 'hero_damage_min': return (row.hero_damage || 0) / minutes;
    default:                return null;
  }
}

// Pick up to `n` recent matches where this dimension was weakest. For
// higher-is-better stats that means the lowest values; for lower-is-better
// (deaths) the highest values.
function _exampleMatches(dim, matches, n = 3) {
  const scored = matches
    .map(row => ({ row, value: _statValueForMatch(dim.stat, row) }))
    .filter(x => x.value != null);
  scored.sort((a, b) => dim.lower_better ? b.value - a.value : a.value - b.value);
  return scored.slice(0, n).map(({ row, value }) => ({
    match_id: row.match_id,
    date: row.date,
    hero_id: row.hero_id,
    perf: row.perf,
    value,
    format: STAT_FORMAT[dim.stat] || 'dec1',
  }));
}

function _targetFor(statKey, position) {
  const map = TARGET_MAP[statKey];
  const pos = (position >= 1 && position <= 5) ? position : 3;
  const targets = POSITION_TARGETS[pos];
  if (!map || !targets || !targets[map.key]) return null;
  const t = targets[map.key];
  return {
    avg: t.avg,
    elite: t.elite,
    format: map.format,
    lower_better: statKey === 'deaths_min',
  };
}

function _roundN(x, n) {
  const f = Math.pow(10, n);
  return Math.round(x * f) / f;
}

// Build the full growth payload for a player. `mergedIds` may be omitted; the
// caller (server route) resolves merged smurf/alias accounts and passes them.
async function buildPerfGrowth(pool, { accountId, mergedIds = null, minGames = 5 } = {}) {
  const ids = _normaliseIds(mergedIds && mergedIds.length ? mergedIds : [accountId]);

  const history = await _perfHistory(pool, ids);
  const games = history.length;
  if (games < minGames) {
    return { account_id: String(accountId), enough: false, games, min_games: minGames };
  }

  // Rolling average (window 5) for the smoothed trend line.
  const WIN = 5;
  const enriched = history.map((h, i) => {
    const slice = history.slice(Math.max(0, i - WIN + 1), i + 1);
    const rolling = slice.reduce((s, x) => s + (x.perf || 0), 0) / slice.length;
    return {
      match_id: h.match_id,
      date: h.date,
      perf: _roundN(h.perf, 2),
      rolling: _roundN(rolling, 2),
      position: h.position,
      hero_id: h.hero_id,
      won: !!h.won,
    };
  });

  const perfVals = history.map(h => h.perf).filter(v => v != null);
  const overall = perfVals.reduce((s, v) => s + v, 0) / perfVals.length;
  const last10 = perfVals.slice(-10);
  const current = last10.reduce((s, v) => s + v, 0) / last10.length;
  const best = Math.max(...perfVals);
  // Trend: average of the last 5 vs the previous 5.
  const last5 = perfVals.slice(-5);
  const prev5 = perfVals.slice(-10, -5);
  let trend = 'flat', trendDelta = 0;
  if (last5.length && prev5.length) {
    const a = last5.reduce((s, v) => s + v, 0) / last5.length;
    const b = prev5.reduce((s, v) => s + v, 0) / prev5.length;
    trendDelta = _roundN(a - b, 2);
    trend = trendDelta > 0.15 ? 'up' : trendDelta < -0.15 ? 'down' : 'flat';
  }

  const position = await _primaryPosition(pool, ids);

  // Weakest per-position dimensions vs peers. Drop the headline PERF dimension
  // (it's the overall score, not an actionable sub-metric) and keep the three
  // weakest dimensions that are actually below peers.
  const allDims = await computeWeakestDimensions(pool, ids, position);
  const recent = position ? await _recentPositionMatches(pool, ids, position) : [];
  const weakest = allDims
    .filter(d => d.stat !== 'perf_score')
    .slice(0, 3)
    .map(d => {
      const target = _targetFor(d.stat, position);
      return {
        stat: d.stat,
        label: d.label,
        delta_pct: d.delta_pct,
        own: _roundN(d.own, d.stat.endsWith('_min') && TARGET_MAP[d.stat]?.format === 'int' ? 0 : 2),
        peer: _roundN(d.peer, TARGET_MAP[d.stat]?.format === 'int' ? 0 : 2),
        lower_better: d.lower_better,
        format: STAT_FORMAT[d.stat] || 'dec1',
        target,
        examples: _exampleMatches(d, recent, 3),
      };
    });

  return {
    account_id: String(accountId),
    enough: true,
    games,
    primary_position: position,
    perf: {
      current: _roundN(current, 1),
      overall: _roundN(overall, 1),
      best: _roundN(best, 1),
      trend,
      trend_delta: trendDelta,
      history: enriched,
    },
    weakest_dimensions: weakest,
  };
}

module.exports = {
  STAT_DIMS,
  TARGET_MAP,
  STAT_FORMAT,
  statKeyFor,
  computeWeakestDimensions,
  buildPerfGrowth,
};
