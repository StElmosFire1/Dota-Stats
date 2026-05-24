/**
 * Feature 6 — Pickem season + leaderboard.
 *
 * Picks are Pro-gated to enter; reading the leaderboard and active season
 * is free. Side-bet dimensions (first-blood team, total kills bucket,
 * duration tier) award bonus points on resolution.
 */

function createDb({ getPool, hasOneOffPerk, grantCoins = null }) {
  async function getActivePickemSeason() {
    const p = getPool();
    const r = await p.query(
      `SELECT * FROM pickem_seasons
        WHERE status = 'open' AND starts_at <= NOW() AND ends_at >= NOW()
        ORDER BY starts_at DESC LIMIT 1`
    );
    return r.rows[0] || null;
  }

  async function ensureDefaultPickemSeason() {
    const p = getPool();
    const existing = await p.query(`SELECT 1 FROM pickem_seasons LIMIT 1`);
    if (existing.rows.length) return;
    const slug = `pickem-${new Date().getUTCFullYear()}`;
    const start = new Date();
    const end = new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);
    await p.query(
      `INSERT INTO pickem_seasons (slug, label, starts_at, ends_at, status)
       VALUES ($1, $2, $3, $4, 'open')
       ON CONFLICT (slug) DO NOTHING`,
      [slug, 'Inhouse Pickem ' + start.getUTCFullYear(), start, end]
    );
  }

  // Round-8: pick now optionally accepts side bets — first-blood team,
  // total-kills bucket (under/over 50), duration tier (short/medium/long).
  // All four fields are individually nullable; null = "did not predict",
  // worth 0 on resolve.
  async function submitPickemPick({
    seasonId, accountId, matchRef, pickedWinner,
    pickedFirstBlood = null, pickedTotalKillsBucket = null, pickedDurationTier = null,
    pickedFirstTower = null,
    pickedMvpTeam = null, pickedComeback = null, pickedFirstRosh = null,
  }) {
    const p = getPool();
    const r = await p.query(
      `INSERT INTO pickem_picks
         (season_id, account_id, match_ref, picked_winner,
          picked_first_blood, picked_total_kills_bucket, picked_duration_tier,
          picked_first_tower, picked_mvp_team, picked_comeback, picked_first_rosh)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (season_id, account_id, match_ref) DO UPDATE
         SET picked_winner = EXCLUDED.picked_winner,
             picked_first_blood = EXCLUDED.picked_first_blood,
             picked_total_kills_bucket = EXCLUDED.picked_total_kills_bucket,
             picked_duration_tier = EXCLUDED.picked_duration_tier,
             picked_first_tower = EXCLUDED.picked_first_tower,
             picked_mvp_team = EXCLUDED.picked_mvp_team,
             picked_comeback = EXCLUDED.picked_comeback,
             picked_first_rosh = EXCLUDED.picked_first_rosh,
             updated_at = NOW()
         WHERE pickem_picks.resolved_at IS NULL
       RETURNING *`,
      [seasonId, accountId, String(matchRef), pickedWinner,
       pickedFirstBlood, pickedTotalKillsBucket, pickedDurationTier,
       pickedFirstTower, pickedMvpTeam, pickedComeback, pickedFirstRosh]
    );
    return r.rows[0] || null;
  }

  // Resolution awards 10 pts for the winner pick + 5 pts each for any
  // optional side-bet dimension that matches. `actuals` may include
  // firstBlood, totalKillsBucket, durationTier; missing dims simply
  // award 0 for that dim across all picks.
  async function resolvePickemMatch({
    seasonId, matchRef, actualWinner,
    points = 10, sidePoints = 5,
    actualFirstBlood = null, actualTotalKillsBucket = null, actualDurationTier = null,
    actualFirstTower = null,
    actualMvpTeam = null, actualComeback = null, actualFirstRosh = null,
  }) {
    const p = getPool();
    const r = await p.query(
      `UPDATE pickem_picks
          SET points_awarded     = CASE WHEN picked_winner = $3 THEN $4 ELSE 0 END,
              points_first_blood = CASE
                WHEN $6::text IS NOT NULL AND picked_first_blood = $6 THEN $5
                WHEN picked_first_blood IS NULL THEN 0 ELSE 0 END,
              points_total_kills = CASE
                WHEN $7::text IS NOT NULL AND picked_total_kills_bucket = $7 THEN $5
                WHEN picked_total_kills_bucket IS NULL THEN 0 ELSE 0 END,
              points_duration_tier = CASE
                WHEN $8::text IS NOT NULL AND picked_duration_tier = $8 THEN $5
                WHEN picked_duration_tier IS NULL THEN 0 ELSE 0 END,
              points_first_tower = CASE
                WHEN $9::text IS NOT NULL AND picked_first_tower = $9 THEN $5
                WHEN picked_first_tower IS NULL THEN 0 ELSE 0 END,
              points_mvp_team = CASE
                WHEN $10::text IS NOT NULL AND picked_mvp_team = $10 THEN $5
                WHEN picked_mvp_team IS NULL THEN 0 ELSE 0 END,
              points_comeback = CASE
                WHEN $11::text IS NOT NULL AND picked_comeback = $11 THEN $5
                WHEN picked_comeback IS NULL THEN 0 ELSE 0 END,
              points_first_rosh = CASE
                WHEN $12::text IS NOT NULL AND picked_first_rosh = $12 THEN $5
                WHEN picked_first_rosh IS NULL THEN 0 ELSE 0 END,
              actual_first_blood        = $6,
              actual_total_kills_bucket = $7,
              actual_duration_tier      = $8,
              actual_first_tower        = $9,
              actual_mvp_team           = $10,
              actual_comeback           = $11,
              actual_first_rosh         = $12,
              resolved_at = NOW(),
              updated_at = NOW()
        WHERE season_id = $1 AND match_ref = $2 AND resolved_at IS NULL
        RETURNING account_id, points_awarded,
                  COALESCE(points_first_blood,0)
                + COALESCE(points_total_kills,0)
                + COALESCE(points_duration_tier,0)
                + COALESCE(points_first_tower,0)
                + COALESCE(points_mvp_team,0)
                + COALESCE(points_comeback,0)
                + COALESCE(points_first_rosh,0) AS side_points`,
      [seasonId, String(matchRef), actualWinner, points, sidePoints,
       actualFirstBlood, actualTotalKillsBucket, actualDurationTier,
       actualFirstTower, actualMvpTeam, actualComeback, actualFirstRosh]
    );
    // Task #316 — grant 10 coins per correct winner pick (any non-zero
    // points_awarded). Side-bet hits don't pay coins — keeps the daily
    // earn rate sane. Best-effort; failures swallowed.
    if (typeof grantCoins === 'function') {
      for (const row of r.rows) {
        if (Number(row.points_awarded) > 0) {
          try {
            await grantCoins({
              accountId: Number(row.account_id),
              delta: 10,
              reason: 'pickem_win',
              refMatchId: String(matchRef),
              applyDailyCap: true,
            });
          } catch (_) {}
        }
      }
    }
    return r.rows;
  }

  // Drift closure (Task #157 round-3): plug into the match-record pipeline so
  // pickem picks resolve automatically when a match is recorded — no manual
  // admin /resolve call needed. Caller passes the recorded match's ID and
  // radiant_win flag; we resolve picks against the active season for that
  // match's match_ref. Best-effort: any error swallowed and logged so a
  // pickem-side bug never breaks match recording.
  async function autoResolvePickemForMatch(matchId, radiantWin, extras = {}) {
    try {
      const season = await getActivePickemSeason();
      if (!season) return [];
      const actualFirstBlood = extras.firstBloodTeam === 'radiant' || extras.firstBloodTeam === 'dire'
        ? extras.firstBloodTeam : null;
      const actualTotalKillsBucket = Number.isFinite(extras.totalKills)
        ? (extras.totalKills >= 50 ? 'over' : 'under') : null;
      const actualDurationTier = Number.isFinite(extras.durationSeconds)
        ? (extras.durationSeconds < 1800 ? 'short'
            : extras.durationSeconds <= 2700 ? 'medium' : 'long')
        : null;
      const actualFirstTower = extras.firstTowerTeam === 'radiant' || extras.firstTowerTeam === 'dire'
        ? extras.firstTowerTeam : null;
      const actualMvpTeam = extras.mvpTeam === 'radiant' || extras.mvpTeam === 'dire'
        ? extras.mvpTeam : null;
      const actualComeback = extras.comeback === 'yes' || extras.comeback === 'no'
        ? extras.comeback : null;
      const actualFirstRosh = ['radiant','dire','none'].includes(extras.firstRoshTeam)
        ? extras.firstRoshTeam : null;
      return await resolvePickemMatch({
        seasonId: season.id,
        matchRef: String(matchId),
        actualWinner: radiantWin ? 'radiant' : 'dire',
        points: 10, sidePoints: 5,
        actualFirstBlood, actualTotalKillsBucket, actualDurationTier,
        actualFirstTower, actualMvpTeam, actualComeback, actualFirstRosh,
      });
    } catch (e) {
      return [];
    }
  }

  // Season-end: pick the leaderboard champion, grant a one-time
  // `cosmetic:pickem_champion_frame:S<seasonId>` perk (no expiry, source =
  // 'season_award'). Idempotent via the perk_key uniqueness check — calling
  // it twice for the same season is a no-op.
  async function awardPickemSeasonChampion(seasonId) {
    const board = await getPickemLeaderboard(seasonId, 1);
    const champ = board[0];
    if (!champ || champ.points <= 0) return null;
    const perkKey = `cosmetic:pickem_champion_frame:S${seasonId}`;
    const exists = await hasOneOffPerk(champ.account_id, perkKey);
    if (exists) return null;
    const p = getPool();
    const r = await p.query(
      `INSERT INTO user_one_off_perks (account_id, perk_key, source, metadata)
       VALUES ($1, $2, 'season_award', $3::jsonb)
       RETURNING *`,
      [champ.account_id, perkKey,
       JSON.stringify({ season_id: seasonId, points: champ.points })],
    );
    return r.rows[0];
  }

  async function getPickemLeaderboard(seasonId, limit = 50) {
    const p = getPool();
    const r = await p.query(
      // Points = winner-pick points + any awarded side-bet points
      // (round-8: first-blood / total-kills / duration-tier dimensions).
      // Reviewer fix: sum every prop-bet dimension (v1 + v2) so leaderboard
      // accuracy reflects what resolvePickemMatch actually scored.
      `SELECT pp.account_id,
              COALESCE(n.nickname, pp.account_id::text) AS display_name,
              COALESCE(SUM(pp.points_awarded), 0)::int
                + COALESCE(SUM(pp.points_first_blood), 0)::int
                + COALESCE(SUM(pp.points_total_kills), 0)::int
                + COALESCE(SUM(pp.points_duration_tier), 0)::int
                + COALESCE(SUM(pp.points_first_tower), 0)::int
                + COALESCE(SUM(pp.points_mvp_team), 0)::int
                + COALESCE(SUM(pp.points_comeback), 0)::int
                + COALESCE(SUM(pp.points_first_rosh), 0)::int AS points,
              COUNT(*) FILTER (WHERE pp.resolved_at IS NOT NULL)::int AS resolved,
              COUNT(*) FILTER (WHERE pp.points_awarded > 0)::int AS correct,
              COUNT(*)::int AS total_picks
         FROM pickem_picks pp
         LEFT JOIN nicknames n ON n.account_id = pp.account_id
        WHERE pp.season_id = $1
        GROUP BY pp.account_id, n.nickname
        ORDER BY points DESC, correct DESC, total_picks DESC
        LIMIT $2`,
      [seasonId, limit]
    );
    return r.rows;
  }

  async function getMyPickemPicks(seasonId, accountId) {
    const p = getPool();
    const r = await p.query(
      `SELECT match_ref, picked_winner, points_awarded,
              picked_first_blood, picked_total_kills_bucket, picked_duration_tier,
              points_first_blood, points_total_kills, points_duration_tier,
              actual_first_blood, actual_total_kills_bucket, actual_duration_tier,
              picked_first_tower, points_first_tower, actual_first_tower,
              picked_mvp_team, points_mvp_team, actual_mvp_team,
              picked_comeback, points_comeback, actual_comeback,
              picked_first_rosh, points_first_rosh, actual_first_rosh,
              resolved_at, updated_at
         FROM pickem_picks
        WHERE season_id = $1 AND account_id = $2
        ORDER BY updated_at DESC LIMIT 200`,
      [seasonId, accountId]
    );
    return r.rows;
  }

  return {
    getActivePickemSeason, ensureDefaultPickemSeason, submitPickemPick,
    resolvePickemMatch, autoResolvePickemForMatch, awardPickemSeasonChampion,
    getPickemLeaderboard, getMyPickemPicks,
  };
}

function mountRoutes({ router, express, deps, requireAuth }) {
  const { magV3, isProAccount, isSuperuser } = deps;

  // ---------------------------------------------------------------
  // 6 — Pickem
  // ---------------------------------------------------------------
  router.get('/pickem/active-season', async (req, res) => {
    try {
      await magV3.ensureDefaultPickemSeason();
      const season = await magV3.getActivePickemSeason();
      res.json({ season });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/pickem/leaderboard', async (req, res) => {
    try {
      const seasonId = parseInt(req.query.season_id, 10);
      let sid = seasonId;
      if (!Number.isFinite(sid)) {
        const s = await magV3.getActivePickemSeason();
        sid = s?.id;
      }
      if (!sid) return res.json({ leaderboard: [] });
      const rows = await magV3.getPickemLeaderboard(sid, 100);
      res.json({ leaderboard: rows, season_id: sid });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/pickem/me', requireAuth, async (req, res) => {
    try {
      const s = await magV3.getActivePickemSeason();
      if (!s) return res.json({ picks: [], season: null });
      const picks = await magV3.getMyPickemPicks(s.id, req.session.accountId);
      res.json({ picks, season: s });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/pickem/pick', express.json(), requireAuth, async (req, res) => {
    try {
      // Task #316 — Pickem is now free for all signed-in users. Each
      // correct winner pick grants 10 🪙 (capped by the daily soft cap),
      // making this the entry-level engagement loop.
      const {
        matchRef, pickedWinner,
        pickedFirstBlood, pickedTotalKillsBucket, pickedDurationTier,
        pickedFirstTower, pickedMvpTeam, pickedComeback, pickedFirstRosh,
      } = req.body || {};
      if (!matchRef || !['radiant', 'dire'].includes(pickedWinner)) {
        return res.status(400).json({ error: 'matchRef and pickedWinner=radiant|dire required' });
      }
      const validOrNull = (v, allowed) => v == null ? null
        : (allowed.includes(v) ? v : 'INVALID');
      const fb = validOrNull(pickedFirstBlood, ['radiant', 'dire']);
      const tk = validOrNull(pickedTotalKillsBucket, ['under', 'over']);
      const dt = validOrNull(pickedDurationTier, ['short', 'medium', 'long']);
      const ft = validOrNull(pickedFirstTower, ['radiant', 'dire']);
      const mv = validOrNull(pickedMvpTeam, ['radiant', 'dire']);
      const cb = validOrNull(pickedComeback, ['yes', 'no']);
      const fr = validOrNull(pickedFirstRosh, ['radiant', 'dire', 'none']);
      if ([fb, tk, dt, ft, mv, cb, fr].includes('INVALID')) {
        return res.status(400).json({
          error: 'Invalid side bet — firstBlood/firstTower/mvpTeam=radiant|dire, totalKillsBucket=under|over, durationTier=short|medium|long, comeback=yes|no, firstRosh=radiant|dire|none',
        });
      }
      const s = await magV3.getActivePickemSeason();
      if (!s) return res.status(409).json({ error: 'No active pickem season' });
      const row = await magV3.submitPickemPick({
        seasonId: s.id, accountId: req.session.accountId,
        matchRef, pickedWinner,
        pickedFirstBlood: fb, pickedTotalKillsBucket: tk, pickedDurationTier: dt,
        pickedFirstTower: ft,
        pickedMvpTeam: mv, pickedComeback: cb, pickedFirstRosh: fr,
      });
      if (!row) return res.status(409).json({ error: 'Pick already locked.' });
      res.json({ pick: row });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Admin: resolve a match's picks.
  router.post('/admin/pickem/resolve', express.json(), async (req, res) => {
    if (!isSuperuser(req)) return res.status(403).json({ error: 'Superuser only' });
    try {
      const { matchRef, actualWinner, points } = req.body || {};
      if (!matchRef || !['radiant', 'dire'].includes(actualWinner)) {
        return res.status(400).json({ error: 'matchRef and actualWinner required' });
      }
      const s = await magV3.getActivePickemSeason();
      if (!s) return res.status(409).json({ error: 'No active season' });
      const updated = await magV3.resolvePickemMatch({
        seasonId: s.id, matchRef, actualWinner, points: points || 10,
      });
      res.json({ resolved: updated.length, rows: updated });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}

module.exports = { createDb, mountRoutes };
