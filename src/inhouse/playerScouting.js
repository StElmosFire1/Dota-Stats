// Public, bounded scouting details. Only requested on hover/focus, never on
// every roster poll. Keep cosmetics/identity separate from draft skill scores.
async function getPlayerScouting(accountId, { getPool, getMergedAccountIds }) {
  const ids = await getMergedAccountIds(accountId);
  const pool = getPool();
  const matches = `
    SELECT DISTINCT ON (ps.match_id) ps.match_id, ps.hero_id, ps.position,
           ps.kills, ps.deaths, ps.assists, ps.gpm, m.date,
           CASE WHEN (ps.team = 'radiant' AND m.radiant_win = true)
                  OR (ps.team = 'dire' AND m.radiant_win = false)
                THEN true WHEN m.radiant_win IS NOT NULL THEN false END AS won
      FROM player_stats ps
      JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false
     ORDER BY ps.match_id, ps.account_id`;
  const [heroes, recent, profile] = await Promise.all([
    pool.query(`WITH player_matches AS (${matches})
      SELECT hero_id, COUNT(*)::int AS games,
             COUNT(*) FILTER (WHERE won)::int AS wins
        FROM player_matches WHERE hero_id > 0
       GROUP BY hero_id ORDER BY games DESC, hero_id`, [ids]),
    pool.query(`WITH player_matches AS (${matches})
      SELECT * FROM player_matches ORDER BY date DESC NULLS LAST, match_id DESC LIMIT 20`, [ids]),
    pool.query(`SELECT custom_title, pinned_hero_id, pinned_hero_caption
                  FROM player_profiles WHERE account_id = $1`, [accountId]),
  ]);
  const heroRows = heroes.rows.map(h => ({
    hero_id: Number(h.hero_id), games: Number(h.games), wins: Number(h.wins),
    winRate: Math.round(Number(h.wins) / Number(h.games) * 100),
  }));
  const roleCounts = new Map();
  for (const match of recent.rows) {
    const role = Number(match.position);
    if (role >= 1 && role <= 5) roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
  }
  const card = profile.rows[0] || {};
  return {
    bestHeroes: heroRows.filter(h => h.games >= 3)
      .sort((a, b) => b.winRate - a.winRate || b.games - a.games || a.hero_id - b.hero_id).slice(0, 3),
    comfortHeroes: heroRows.slice(0, 3),
    preferredHero: card.pinned_hero_id || null,
    preferredHeroCaption: card.pinned_hero_caption || null,
    customTitle: card.custom_title || null,
    recentMatches: recent.rows.slice(0, 5).map(m => ({
      match_id: String(m.match_id), hero_id: m.hero_id, position: m.position,
      kills: m.kills, deaths: m.deaths, assists: m.assists, gpm: m.gpm,
      won: m.won, date: m.date,
    })),
    recentRoles: [...roleCounts].map(([position, games]) => ({ position, games }))
      .sort((a, b) => b.games - a.games || a.position - b.position),
    recentSample: recent.rows.length,
  };
}

module.exports = { getPlayerScouting };
