const { Rating, quality, rate } = require('ts-trueskill');

const MMR_OFFSET = 2600;

class StatsService {
  constructor() {
    this.defaultMu = 25;
    this.defaultSigma = 8.333;
  }

  createDefaultRating() {
    return new Rating(this.defaultMu, this.defaultSigma);
  }

  calculateNewRatings(radiantPlayers, direPlayers, radiantWin) {
    const radiantRatings = radiantPlayers.map(
      (p) => new Rating(p.mu || this.defaultMu, p.sigma || this.defaultSigma)
    );
    const direRatings = direPlayers.map(
      (p) => new Rating(p.mu || this.defaultMu, p.sigma || this.defaultSigma)
    );

    const teams = [radiantRatings, direRatings];
    const ranks = radiantWin ? [0, 1] : [1, 0];

    const newRatings = rate(teams, ranks);

    const results = [];
    for (let i = 0; i < radiantPlayers.length; i++) {
      results.push({
        id: radiantPlayers[i].id,
        mu: newRatings[0][i].mu,
        sigma: newRatings[0][i].sigma,
        mmr: Math.round((newRatings[0][i].mu - 3 * newRatings[0][i].sigma) * 100) + MMR_OFFSET,
      });
    }
    for (let i = 0; i < direPlayers.length; i++) {
      results.push({
        id: direPlayers[i].id,
        mu: newRatings[1][i].mu,
        sigma: newRatings[1][i].sigma,
        mmr: Math.round((newRatings[1][i].mu - 3 * newRatings[1][i].sigma) * 100) + MMR_OFFSET,
      });
    }

    return results;
  }

  extractMatchStats(matchDetails) {
    if (!matchDetails || !matchDetails.match) return null;

    const match = matchDetails.match;
    const players = (match.players || []).map((p) => ({
      accountId: p.account_id,
      heroId: p.hero_id,
      kills: p.kills || 0,
      deaths: p.deaths || 0,
      assists: p.assists || 0,
      lastHits: p.last_hits || 0,
      denies: p.denies || 0,
      goldPerMin: p.gold_per_min || 0,
      xpPerMin: p.xp_per_min || 0,
      heroDamage: p.hero_damage || 0,
      towerDamage: p.tower_damage || 0,
      heroHealing: p.hero_healing || 0,
      level: p.level || 0,
      team: p.player_slot < 128 ? 'radiant' : 'dire',
      netWorth: p.net_worth || 0,
    }));

    return {
      matchId: match.match_id ? match.match_id.toString() : 'unknown',
      duration: match.duration || 0,
      radiantWin: match.match_outcome === 2,
      startTime: match.start_time || 0,
      gameMode: match.game_mode || 0,
      players,
    };
  }

  extractReplayStats(replayData) {
    if (!replayData) return null;

    const players = (replayData.players || []).map((p) => ({
      accountId: p.accountId || p.account_id || 0,
      heroId: p.heroId || p.hero_id || 0,
      kills: p.kills || 0,
      deaths: p.deaths || 0,
      assists: p.assists || 0,
      lastHits: p.lastHits || p.last_hits || 0,
      denies: p.denies || 0,
      goldPerMin: p.goldPerMin || p.gold_per_min || 0,
      xpPerMin: p.xpPerMin || p.xp_per_min || 0,
      heroDamage: p.heroDamage || p.hero_damage || 0,
      towerDamage: p.towerDamage || p.tower_damage || 0,
      heroHealing: p.heroHealing || p.hero_healing || 0,
      level: p.level || 0,
      team: p.team || (p.player_slot < 128 ? 'radiant' : 'dire'),
      netWorth: p.netWorth || p.net_worth || 0,
    }));

    return {
      matchId: replayData.matchId || 'replay_' + Date.now(),
      duration: replayData.duration || 0,
      radiantWin: replayData.radiantWin ?? true,
      startTime: replayData.startTime || Math.floor(Date.now() / 1000),
      gameMode: replayData.gameMode || 22,
      players,
    };
  }

  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

let instance = null;
function getStatsService() {
  if (!instance) {
    instance = new StatsService();
  }
  return instance;
}

module.exports = { getStatsService };
