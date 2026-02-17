const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { config } = require('../config');
const fs = require('fs');

class SheetsStore {
  constructor() {
    this.doc = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    if (!config.sheets.sheetId) {
      console.warn('[Sheets] SHEET_ID not configured. Sheets storage disabled.');
      return;
    }

    let creds;
    try {
      const credsRaw = fs.readFileSync(config.sheets.credsPath, 'utf-8');
      creds = JSON.parse(credsRaw);
    } catch (err) {
      console.warn('[Sheets] creds.json not found or invalid. Sheets storage disabled.');
      console.warn('[Sheets] Upload a Google service account creds.json to the project root.');
      return;
    }

    try {
      const auth = new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.doc = new GoogleSpreadsheet(config.sheets.sheetId, auth);
      await this.doc.loadInfo();
      console.log(`[Sheets] Connected to: ${this.doc.title}`);

      await this._ensureSheets();
      this.initialized = true;
    } catch (err) {
      console.error('[Sheets] Init error:', err.message);
    }
  }

  async _ensureSheets() {
    const matchesSheet = this.doc.sheetsByTitle['Matches'];
    if (!matchesSheet) {
      await this.doc.addSheet({
        title: 'Matches',
        headerValues: [
          'match_id', 'date', 'duration', 'game_mode', 'radiant_win',
          'lobby_name', 'recorded_by',
        ],
      });
      console.log('[Sheets] Created "Matches" sheet.');
    }

    const playersSheet = this.doc.sheetsByTitle['PlayerStats'];
    if (!playersSheet) {
      await this.doc.addSheet({
        title: 'PlayerStats',
        headerValues: [
          'match_id', 'account_id', 'discord_id', 'hero_id', 'team',
          'kills', 'deaths', 'assists', 'last_hits', 'denies',
          'gpm', 'xpm', 'hero_damage', 'tower_damage', 'hero_healing',
          'level', 'net_worth',
        ],
      });
      console.log('[Sheets] Created "PlayerStats" sheet.');
    }

    const ratingsSheet = this.doc.sheetsByTitle['Ratings'];
    if (!ratingsSheet) {
      await this.doc.addSheet({
        title: 'Ratings',
        headerValues: [
          'player_id', 'discord_id', 'display_name', 'mu', 'sigma',
          'mmr', 'wins', 'losses', 'games_played', 'last_updated',
        ],
      });
      console.log('[Sheets] Created "Ratings" sheet.');
    }
  }

  async recordMatch(matchStats, lobbyName, recordedBy) {
    if (!this.initialized) {
      console.warn('[Sheets] Not initialized, skipping record.');
      return null;
    }

    const matchesSheet = this.doc.sheetsByTitle['Matches'];
    await matchesSheet.addRow({
      match_id: matchStats.matchId,
      date: new Date().toISOString(),
      duration: matchStats.duration,
      game_mode: matchStats.gameMode,
      radiant_win: matchStats.radiantWin ? 'Yes' : 'No',
      lobby_name: lobbyName || '',
      recorded_by: recordedBy || '',
    });

    const playersSheet = this.doc.sheetsByTitle['PlayerStats'];
    for (const player of matchStats.players) {
      await playersSheet.addRow({
        match_id: matchStats.matchId,
        account_id: player.accountId,
        discord_id: player.discordId || '',
        hero_id: player.heroId,
        team: player.team,
        kills: player.kills,
        deaths: player.deaths,
        assists: player.assists,
        last_hits: player.lastHits,
        denies: player.denies,
        gpm: player.goldPerMin,
        xpm: player.xpPerMin,
        hero_damage: player.heroDamage,
        tower_damage: player.towerDamage,
        hero_healing: player.heroHealing,
        level: player.level,
        net_worth: player.netWorth,
      });
    }

    console.log(`[Sheets] Recorded match ${matchStats.matchId}`);
    return matchStats.matchId;
  }

  async updateRating(playerId, discordId, displayName, mu, sigma, mmr, won) {
    if (!this.initialized) return;

    const ratingsSheet = this.doc.sheetsByTitle['Ratings'];
    const rows = await ratingsSheet.getRows();
    const existing = rows.find((r) => r.get('player_id') === playerId);

    if (existing) {
      existing.set('mu', mu.toFixed(4));
      existing.set('sigma', sigma.toFixed(4));
      existing.set('mmr', mmr);
      existing.set('wins', parseInt(existing.get('wins') || '0') + (won ? 1 : 0));
      existing.set('losses', parseInt(existing.get('losses') || '0') + (won ? 0 : 1));
      existing.set('games_played', parseInt(existing.get('games_played') || '0') + 1);
      existing.set('last_updated', new Date().toISOString());
      if (discordId) existing.set('discord_id', discordId);
      if (displayName) existing.set('display_name', displayName);
      await existing.save();
    } else {
      await ratingsSheet.addRow({
        player_id: playerId,
        discord_id: discordId || '',
        display_name: displayName || playerId,
        mu: mu.toFixed(4),
        sigma: sigma.toFixed(4),
        mmr,
        wins: won ? 1 : 0,
        losses: won ? 0 : 1,
        games_played: 1,
        last_updated: new Date().toISOString(),
      });
    }
  }

  async getLeaderboard(limit = 10) {
    if (!this.initialized) return [];

    const ratingsSheet = this.doc.sheetsByTitle['Ratings'];
    const rows = await ratingsSheet.getRows();

    const players = rows.map((r) => ({
      playerId: r.get('player_id'),
      discordId: r.get('discord_id'),
      displayName: r.get('display_name'),
      mmr: parseInt(r.get('mmr') || '0'),
      wins: parseInt(r.get('wins') || '0'),
      losses: parseInt(r.get('losses') || '0'),
      gamesPlayed: parseInt(r.get('games_played') || '0'),
    }));

    players.sort((a, b) => b.mmr - a.mmr);
    return players.slice(0, limit);
  }

  async getPlayerRating(playerId) {
    if (!this.initialized) return null;

    const ratingsSheet = this.doc.sheetsByTitle['Ratings'];
    const rows = await ratingsSheet.getRows();
    const row = rows.find((r) => r.get('player_id') === playerId || r.get('discord_id') === playerId);

    if (!row) return null;
    return {
      playerId: row.get('player_id'),
      discordId: row.get('discord_id'),
      displayName: row.get('display_name'),
      mu: parseFloat(row.get('mu') || '25'),
      sigma: parseFloat(row.get('sigma') || '8.333'),
      mmr: parseInt(row.get('mmr') || '0'),
      wins: parseInt(row.get('wins') || '0'),
      losses: parseInt(row.get('losses') || '0'),
      gamesPlayed: parseInt(row.get('games_played') || '0'),
    };
  }

  async getMatchHistory(limit = 10) {
    if (!this.initialized) return [];

    const matchesSheet = this.doc.sheetsByTitle['Matches'];
    const rows = await matchesSheet.getRows();

    return rows
      .slice(-limit)
      .reverse()
      .map((r) => ({
        matchId: r.get('match_id'),
        date: r.get('date'),
        duration: r.get('duration'),
        radiantWin: r.get('radiant_win') === 'Yes',
        lobbyName: r.get('lobby_name'),
      }));
  }
}

let instance = null;
function getSheetsStore() {
  if (!instance) {
    instance = new SheetsStore();
  }
  return instance;
}

module.exports = { getSheetsStore };
