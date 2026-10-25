// Share the leaderboard's displayed ratings, not the raw TrueSkill value used
// by the lobby balancer. Coalesce concurrent polls; never recompute per player.
function createRosterSummaryLoader(loadLeaderboard, { now = Date.now, ttl = 30000 } = {}) {
  let pending;
  let cached;
  let expires = 0;
  return async function load() {
    if (now() < expires) return cached;
    if (pending) return pending;
    pending = Promise.resolve().then(loadLeaderboard).then(rows => {
      cached = rows.map((p, index) => ({
        account_id: String(p.player_id),
        nickname: p.nickname,
        inhouse_mmr: p.mmr,
        leaderboard_rank: index + 1,
        wins: p.wins,
        losses: p.losses,
        dota_rank_tier: p.dota_rank_tier,
        dota_leaderboard_rank: p.dota_leaderboard_rank,
      }));
      expires = now() + ttl;
      return cached;
    }).catch(error => {
      // Do not flood a failing dependency on every lobby poll.
      cached = null;
      expires = now() + 5000;
      throw error;
    }).finally(() => { pending = null; });
    return pending;
  };
}

function enrichRoster(players, summaries) {
  if (!summaries) return players;
  const byId = new Map(summaries.map(p => [String(p.account_id), p]));
  const byNickname = new Map(summaries.filter(p => p.nickname).map(p => [p.nickname.toLowerCase(), p]));
  for (const player of players) {
    // The leaderboard merges accounts with the same nickname. Follow that
    // canonical identity without replacing the lobby's actual account ID.
    const summary = byId.get(String(player.account_id))
      || byNickname.get(player.nickname?.toLowerCase());
    if (summary) {
      const { account_id, nickname, ...publicStats } = summary;
      Object.assign(player, publicStats);
    }
  }
  return players;
}

module.exports = { createRosterSummaryLoader, enrichRoster };
