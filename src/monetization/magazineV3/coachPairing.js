/**
 * Feature 3 — AI coach pairing.
 *
 * Pure scoring helper (`scoreCoachMatch`) plus the Pro-gated
 * recommendation routes that surface ranked coaches and the student's
 * weakest stat dimensions.
 */

const { computeWeakestDimensions } = require('../../perf/growthInsights');

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
  // Defensive: legacy rows may have these fields as JSON-encoded strings or
  // other non-array shapes. Treat anything that isn't an array as empty.
  const studentHeroes = new Set((Array.isArray(student.top_heroes) ? student.top_heroes : []).map(Number));
  const coachHeroes = new Set((Array.isArray(coach.hero_pool) ? coach.hero_pool : []).map(Number));
  let heroOverlap = 0;
  for (const h of studentHeroes) if (coachHeroes.has(h)) heroOverlap++;
  score += Math.min(20, heroOverlap * 5);
  // Position match.
  if (student.primary_position != null
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
  // Delegates to the shared growth-insight computation (src/perf/growthInsights.js)
  // so the coach recommender and the PERF Growth view stay in lockstep. The
  // shared fn returns all dimensions enriched with own/peer values; we keep the
  // historical contract here (three weakest dims, {stat,label,delta_pct}).
  async function _weakestDimensions(accountId, primaryPosition) {
    const dims = await computeWeakestDimensions(db.getPool(), [accountId], primaryPosition);
    return dims.slice(0, 3).map(d => ({ stat: d.stat, label: d.label, delta_pct: d.delta_pct }));
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
    const studentTop = Array.isArray(student.top_heroes) ? student.top_heroes : [];
    const coachPool = Array.isArray(coach.hero_pool) ? coach.hero_pool.map(Number) : [];
    const overlap = studentTop.filter(h => coachPool.includes(Number(h))).length;
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
