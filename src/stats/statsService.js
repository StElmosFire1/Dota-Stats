const { Rating, quality, rate, TrueSkill } = require('ts-trueskill');

const MMR_OFFSET = 2600;

// V3 TrueSkill environment: same μ/σ/β as default, but tau bumped from ~0.083 → 0.3
// (keeps σ from collapsing for veterans) and drawProbability=0 (Dota matches can't draw).
const TS_V3_ENV = new TrueSkill(25, 8.333, 4.166, 0.3, 0.0);
const V3_SIGMA_FLOOR = 2.5;

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

  // V3 — uses custom TrueSkill env, applies a per-player performance modifier to
  // scale the μ change (so a strong individual game gains more MMR than a weak
  // one on the same team), and floors σ at V3_SIGMA_FLOOR to keep ratings fluid.
  // `radiantPlayers` / `direPlayers` items may carry an optional `modifier`
  // (clamped to [0.80, 1.20]); missing modifiers default to 1.0.
  calculateNewRatingsV3(radiantPlayers, direPlayers, radiantWin) {
    const buildRatings = (players) =>
      players.map(p => TS_V3_ENV.createRating(
        p.mu ?? this.defaultMu,
        p.sigma ?? this.defaultSigma
      ));

    const radiantRatings = buildRatings(radiantPlayers);
    const direRatings    = buildRatings(direPlayers);

    const teams = [radiantRatings, direRatings];
    const ranks = radiantWin ? [0, 1] : [1, 0];
    const newRatings = TS_V3_ENV.rate(teams, ranks);

    const finalize = (players, oldRatings, updatedRatings) => {
      const out = [];
      for (let i = 0; i < players.length; i++) {
        const oldMu = oldRatings[i].mu;
        const newMu = updatedRatings[i].mu;
        const rawSigma = updatedRatings[i].sigma;

        const rawMod = (typeof players[i].modifier === 'number' && Number.isFinite(players[i].modifier))
          ? players[i].modifier : 1.0;
        const mod = Math.max(0.80, Math.min(1.20, rawMod));

        const adjustedMu = oldMu + (newMu - oldMu) * mod;
        const sigma = Math.max(V3_SIGMA_FLOOR, rawSigma);

        out.push({
          id: players[i].id,
          mu: adjustedMu,
          sigma,
          mmr: Math.round((adjustedMu - 3 * sigma) * 100) + MMR_OFFSET,
        });
      }
      return out;
    };

    return [
      ...finalize(radiantPlayers, radiantRatings, newRatings[0]),
      ...finalize(direPlayers,    direRatings,    newRatings[1]),
    ];
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
