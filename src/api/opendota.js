const fetch = require('node-fetch');

const OPENDOTA_API = 'https://api.opendota.com/api';

class OpenDotaClient {
  constructor() {
    this.rateLimitDelay = 1100;
    this.lastRequest = 0;
  }

  async _rateLimit() {
    const now = Date.now();
    const diff = now - this.lastRequest;
    if (diff < this.rateLimitDelay) {
      await new Promise((r) => setTimeout(r, this.rateLimitDelay - diff));
    }
    this.lastRequest = Date.now();
  }

  async getMatch(matchId) {
    await this._rateLimit();
    try {
      const res = await fetch(`${OPENDOTA_API}/matches/${matchId}`);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`OpenDota API error: ${res.status}`);
      }
      const data = await res.json();
      return this._normalizeMatch(data);
    } catch (err) {
      console.error('[OpenDota] Match fetch error:', err.message);
      throw err;
    }
  }

  async requestParse(matchId) {
    await this._rateLimit();
    try {
      const res = await fetch(`${OPENDOTA_API}/request/${matchId}`, { method: 'POST' });
      if (!res.ok) throw new Error(`Parse request failed: ${res.status}`);
      const data = await res.json();
      console.log(`[OpenDota] Parse requested for match ${matchId}: job ${data.job?.jobId || 'submitted'}`);
      return data;
    } catch (err) {
      console.error('[OpenDota] Parse request error:', err.message);
      throw err;
    }
  }

  async refreshPlayer(accountId32) {
    try {
      await fetch(`${OPENDOTA_API}/players/${accountId32}/refresh`, { method: 'POST' });
    } catch (_) {}
  }

  async getPlayerProfile(accountId32) {
    await this._rateLimit();
    try {
      const res = await fetch(`${OPENDOTA_API}/players/${accountId32}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || data.error) return null;
      return {
        rankTier:        data.rank_tier        || null,
        leaderboardRank: data.leaderboard_rank || null,
      };
    } catch (err) {
      console.error(`[OpenDota] Player profile error (${accountId32}):`, err.message);
      return null;
    }
  }

  async getPlayerRecentMatches(accountId32, limit = 20) {
    await this._rateLimit();
    try {
      const res = await fetch(
        `${OPENDOTA_API}/players/${accountId32}/matches?limit=${limit}&lobby_type=1`
      );
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error(`OpenDota API error: ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.error(`[OpenDota] Player matches error (${accountId32}):`, err.message);
      return [];
    }
  }

  _normalizeMatch(data) {
    if (!data || data.error) return null;

    const players = (data.players || []).map((p) => ({
      accountId: p.account_id || 0,
      heroId: p.hero_id || 0,
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
      team: p.isRadiant ? 'radiant' : 'dire',
      netWorth: p.net_worth || p.total_gold || 0,
      playerSlot: p.player_slot,
      personaname: p.personaname || `Player ${p.player_slot}`,
    }));

    return {
      matchId: (data.match_id || 0).toString(),
      duration: data.duration || 0,
      radiantWin: data.radiant_win === true,
      startTime: data.start_time || 0,
      gameMode: data.game_mode || 0,
      lobbyType: data.lobby_type || 0,
      players,
    };
  }
}

let instance = null;
function getOpenDota() {
  if (!instance) {
    instance = new OpenDotaClient();
  }
  return instance;
}

module.exports = { getOpenDota };
