/**
 * Feature 3 — AI coach pairing.
 *
 * Pure scoring helper (`scoreCoachMatch`) plus the Pro-gated
 * recommendation routes that surface ranked coaches and the student's
 * weakest stat dimensions.
 */

function scoreCoachMatch(student, coach) {
  // Both are plain objects already loaded by the caller. Returns 0..100.
  let score = 50;
  // MMR proximity — closer to student's MMR (but slightly higher) is best.
  const sm = Number(student.mmr) || 0;
  const cm = Number(coach.mmr) || 0;
  if (sm > 0 && cm > 0) {
    const delta = cm - sm;
    if (delta < 0) score -= Math.min(20, Math.abs(delta) / 100);
    else if (delta < 1500) score += 15 - Math.abs(delta - 500) / 100;
    else score -= Math.min(15, (delta - 1500) / 200);
  }
  // Hero overlap (coach.hero_pool is array of hero_ids, student.top_heroes too).
  const studentHeroes = new Set((student.top_heroes || []).map(Number));
  const coachHeroes = new Set((coach.hero_pool || []).map(Number));
  let heroOverlap = 0;
  for (const h of studentHeroes) if (coachHeroes.has(h)) heroOverlap++;
  score += Math.min(20, heroOverlap * 5);
  // Position match.
  if (student.primary_position != null && coach.positions
      && Array.isArray(coach.positions)
      && coach.positions.map(Number).includes(Number(student.primary_position))) {
    score += 10;
  }
  // Penalize coaches with no recent reviews.
  const reviews = Number(coach.review_count) || 0;
  if (reviews === 0) score -= 5;
  else score += Math.min(10, reviews);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function mountRoutes({ router, deps, requireAuth }) {
  const { db, isProAccount, isSuperuser } = deps;

  // ---------------------------------------------------------------
  // 3 — AI coach pairing (Pro-gated)
  // Two routes share `_buildCoachRecommendations`:
  //   - GET /me/coach-recommendations           (self)
  //   - GET /players/:id/coach-recommendations  (Pro acting on a profile)
  // Per review fix, both routes also return `weakest_dimensions[]`
  // describing the student's two weakest per-position stats vs peers,
  // so the UI can explain WHY each coach was matched.
  // ---------------------------------------------------------------
  async function _buildStudentSnapshot(accountId) {
    const pool = db.getPool();
    const studentRow = await pool.query(
      `SELECT MAX(r.mmr)::int AS mmr
         FROM ratings r WHERE r.player_id::text = $1::text`,
      [String(accountId)]
    );
    const heroes = await pool.query(
      `SELECT hero_id, COUNT(*)::int AS games
         FROM player_stats WHERE account_id = $1 AND hero_id IS NOT NULL
         GROUP BY hero_id ORDER BY games DESC LIMIT 5`,
      [accountId]
    );
    const positionRow = await pool.query(
      `SELECT position, COUNT(*)::int AS games
         FROM player_stats WHERE account_id = $1 AND position IS NOT NULL
         GROUP BY position ORDER BY games DESC LIMIT 1`,
      [accountId]
    );
    return {
      mmr: studentRow.rows[0]?.mmr || null,
      top_heroes: heroes.rows.map(r => r.hero_id),
      primary_position: positionRow.rows[0]?.position || null,
    };
  }

  // Returns up to 2 stat dimensions where the student is weakest vs the
  // average for the same primary position. Each dimension is named by
  // human-readable label and a numeric delta (negative = below peers).
  //
  // Round-6 review fix: the previous implementation referenced derived
  // columns (`kills_per_min`, `deaths_per_min`, …) and `ps.created_at`
  // that don't exist on the production `player_stats` schema (see
  // `src/db/index.js` line ~50: rows have raw counters + `gpm`/`xpm`,
  // and time comes from the joined `matches` table). The whole try/catch
  // was silently returning `[]` for every account, which broke the
  // grounding requirement on coach recommendations. Now: per-minute
  // metrics are computed in-SQL from raw counters divided by
  // `matches.duration / 60.0`, joined to `matches` for the time window,
  // and PERF (the persisted position-aware score) is included as the
  // primary dimension since the task spec calls it out specifically.
  async function _weakestDimensions(accountId, primaryPosition) {
    if (!primaryPosition) return [];
    const pool = db.getPool();
    // Each row: [sql_expr, label, lowerBetter]
    // Per-minute metrics are computed inline against the actual schema.
    const STAT_DIMS = [
      ['ps.perf',                                              'PERF score',           false],
      ['ps.kills    / NULLIF(m.duration/60.0, 0)',             'Kills / min',          false],
      ['ps.deaths   / NULLIF(m.duration/60.0, 0)',             'Deaths / min',         true],
      ['ps.assists  / NULLIF(m.duration/60.0, 0)',             'Assists / min',        false],
      ['ps.gpm::float',                                        'Gold / min',           false],
      ['ps.xpm::float',                                        'XP / min',             false],
      ['ps.last_hits   / NULLIF(m.duration/60.0, 0)',          'Last hits / min',      false],
      ['ps.hero_damage / NULLIF(m.duration/60.0, 0)',          'Hero damage / min',    false],
    ];
    const cols = STAT_DIMS.map(([expr], i) =>
      `AVG(CASE WHEN ps.account_id = $1 THEN ${expr} END)::float AS own_${i}, ` +
      `AVG(CASE WHEN ps.account_id <> $1 THEN ${expr} END)::float AS peer_${i}`
    ).join(', ');
    let r;
    try {
      r = await pool.query(
        `SELECT ${cols}
           FROM player_stats ps
           JOIN matches m ON m.match_id = ps.match_id
          WHERE ps.position = $2
            AND m.date > NOW() - INTERVAL '90 days'
            AND m.duration > 0`,
        [accountId, primaryPosition]
      );
    } catch (e) {
      // Defensive: if a deployment lacks `ps.perf` or `m.date`, retry
      // without the PERF dimension and using created_at instead. Worst
      // case we still return raw per-minute metrics rather than [].
      try {
        const altCols = STAT_DIMS.slice(1).map(([expr], i) =>
          `AVG(CASE WHEN ps.account_id = $1 THEN ${expr} END)::float AS own_${i + 1}, ` +
          `AVG(CASE WHEN ps.account_id <> $1 THEN ${expr} END)::float AS peer_${i + 1}`
        ).join(', ');
        r = await pool.query(
          `SELECT ${altCols}
             FROM player_stats ps
             JOIN matches m ON m.match_id = ps.match_id
            WHERE ps.position = $2
              AND m.duration > 0`,
          [accountId, primaryPosition]
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
      dims.push({ stat: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
                  label, delta_pct: Math.round(normalised * 100) });
    });
    dims.sort((a, b) => a.delta_pct - b.delta_pct);
    return dims.slice(0, 3);
  }

  async function _buildCoachRecommendations(accountId) {
    const student = await _buildStudentSnapshot(accountId);
    const weakest = await _weakestDimensions(accountId, student.primary_position);
    const coaches = typeof db.listActiveCoaches === 'function'
      ? await db.listActiveCoaches({}).catch(() => [])
      : [];
    const scored = coaches
      .filter(c => String(c.account_id) !== String(accountId))
      .map(c => ({
        coach_id: c.id,
        account_id: c.account_id,
        display_name: c.display_name || null,
        headline: c.headline || null,
        hourly_rate_cents: c.hourly_rate_cents,
        languages: c.languages,
        score: scoreCoachMatch(student, c),
        reasons: _coachMatchReasons(student, c, weakest),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { student, weakest_dimensions: weakest, recommendations: scored };
  }

  router.get('/me/coach-recommendations', requireAuth, async (req, res) => {
    try {
      const accountId = req.session.accountId;
      if (!isSuperuser(req) && !(await isProAccount(accountId))) {
        return res.status(402).json({
          error: 'Coach recommendations require Pro membership.',
          paywall: true, feature: 'coach_recommendations', signed_in: true,
        });
      }
      res.json(await _buildCoachRecommendations(accountId));
    } catch (err) {
      console.error('[API] me/coach-recommendations:', err.message);
      res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
  });

  // Per-player route — caller must be Pro AND must be looking at their own
  // profile, OR a superuser. We do NOT let Pro users browse arbitrary
  // accounts' weakest dimensions (privacy + competitive fairness).
  router.get('/players/:id/coach-recommendations', requireAuth, async (req, res) => {
    try {
      const accountId = req.session.accountId;
      const targetId = String(req.params.id);
      const isOwn = String(accountId) === targetId;
      if (!isSuperuser(req) && !isOwn) {
        return res.status(403).json({ error: 'Can only view your own coach recommendations.' });
      }
      if (!isSuperuser(req) && !(await isProAccount(accountId))) {
        return res.status(402).json({
          error: 'Coach recommendations require Pro membership.',
          paywall: true, feature: 'coach_recommendations', signed_in: true,
        });
      }
      res.json(await _buildCoachRecommendations(targetId));
    } catch (err) {
      console.error('[API] players/:id/coach-recommendations:', err.message);
      res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
  });

  function _coachMatchReasons(student, coach, weakestDims = []) {
    const reasons = [];
    const sm = Number(student.mmr) || 0;
    const cm = Number(coach.mmr) || 0;
    if (sm && cm && cm > sm && cm - sm < 1500) reasons.push(`+${cm - sm} MMR above you`);
    const overlap = (student.top_heroes || []).filter(h =>
      (coach.hero_pool || []).map(Number).includes(Number(h))).length;
    if (overlap > 0) reasons.push(`${overlap} of your top 5 heroes`);
    if (student.primary_position != null && Array.isArray(coach.positions)
        && coach.positions.map(Number).includes(Number(student.primary_position))) {
      reasons.push(`Plays your position (${student.primary_position})`);
    }
    if ((Number(coach.review_count) || 0) >= 5) reasons.push(`${coach.review_count}+ reviews`);
    // Surface the student's weakest dimensions so the user understands
    // *what* this coach can help with (review fix).
    for (const d of (weakestDims || []).slice(0, 1)) {
      if (d && d.delta_pct < 0) reasons.push(`Can help with ${d.label} (${d.delta_pct}% vs peers)`);
    }
    return reasons;
  }
}

module.exports = { scoreCoachMatch, mountRoutes };
