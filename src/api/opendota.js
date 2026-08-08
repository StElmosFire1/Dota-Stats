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
        avatarFull:      data.profile?.avatarfull || null,
        avatarMedium:    data.profile?.avatarmedium || null,
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

  // Task #378 — Pro replay browser. Fetch the rolling /proMatches feed.
  // OpenDota returns up to 100 entries per page, paginated via
  // less_than_match_id. Each entry has the header fields (teams, league,
  // start, duration, radiant_win) but no picks/bans — those come from
  // getMatchRaw(matchId) below.
  async getProMatches(lessThanMatchId = null) {
    await this._rateLimit();
    try {
      const qs = lessThanMatchId ? `?less_than_match_id=${lessThanMatchId}` : '';
      const res = await fetch(`${OPENDOTA_API}/proMatches${qs}`);
      if (!res.ok) throw new Error(`OpenDota /proMatches error: ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('[OpenDota] proMatches fetch error:', err.message);
      return [];
    }
  }

  // Raw /matches/:id (unnormalized) — needed for picks_bans, players[].hero_id,
  // patch, replay_url. Mirrors getMatch but returns the upstream shape so
  // proMatchSyncer can split picks vs bans by team and pull hero ids straight
  // through.
  async getMatchRaw(matchId) {
    await this._rateLimit();
    try {
      const res = await fetch(`${OPENDOTA_API}/matches/${matchId}`);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`OpenDota /matches/${matchId} error: ${res.status}`);
      }
      const data = await res.json();
      if (!data || data.error) return null;
      return data;
    } catch (err) {
      console.error(`[OpenDota] getMatchRaw(${matchId}) error:`, err.message);
      return null;
    }
  }

  // Task #846 — Captain's Mode game. Fetch the /heroStats dataset (one row
  // per hero: pub picks/wins per bracket + pro pick/ban/win counts) and
  // normalize it into the shape the Captain's Mode frontend consumes.
  // Rates are computed here so the client never needs the raw totals:
  //   winRate  — pub wins / pub picks (all brackets)
  //   pickRate — share of pub matches this hero appears in (picks*10/Σpicks)
  //   pbRate   — pro pick+ban rate per pro match ((pick+ban)*10/Σpro picks)
  async getHeroStatsMeta() {
    await this._rateLimit();
    const res = await fetch(`${OPENDOTA_API}/heroStats`);
    if (!res.ok) throw new Error(`OpenDota /heroStats error: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('OpenDota /heroStats returned empty payload');
    }
    let sumPubPicks = 0;
    let sumProPicks = 0;
    const rows = data.map((h) => {
      let picks = 0;
      let wins = 0;
      for (let b = 1; b <= 8; b++) {
        picks += h[`${b}_pick`] || 0;
        wins += h[`${b}_win`] || 0;
      }
      sumPubPicks += picks;
      sumProPicks += h.pro_pick || 0;
      return { h, picks, wins };
    });
    const pubMatches = sumPubPicks / 10 || 1;
    const proMatches = sumProPicks / 10 || 1;
    return rows.map(({ h, picks, wins }) => ({
      id: h.id,
      name: h.localized_name,
      slug: String(h.name || '').replace('npc_dota_hero_', ''),
      attr: h.primary_attr,             // str | agi | int | all
      attackType: h.attack_type,        // Melee | Ranged
      roles: Array.isArray(h.roles) ? h.roles : [],
      winRate: picks > 0 ? wins / picks : 0.5,
      pickRate: picks / pubMatches,
      proPick: h.pro_pick || 0,
      proBan: h.pro_ban || 0,
      proWin: h.pro_win || 0,
      pbRate: ((h.pro_pick || 0) + (h.pro_ban || 0)) / proMatches,
    }));
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
