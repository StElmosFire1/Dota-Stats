// Task #205 — Live presence service.
//
// In-memory only — we never persist a row per presence event. Source caches:
//   _discord: Map<discordId, { state, voice, updatedAt }>
//   _steam:   Map<steamId64, { state, heroId, heroName, matchId, updatedAt }>
//
// Public consumers call getPlayerPresence(accountId) which merges the two
// caches with the inhouse queue table. Visibility is honoured at the merge
// step via player_profiles.presence_visible. All errors are swallowed so
// the cover chip can never block profile render.

const db = require('../db');

const STEAM64_OFFSET = 76561197960265728n;
const STALE_MS = 5 * 60 * 1000;

const _discord = new Map();
const _steam = new Map();

function _now() { return Date.now(); }

function setDiscordPresence(discordId, patch) {
  if (!discordId) return;
  const prev = _discord.get(String(discordId)) || {};
  _discord.set(String(discordId), { ...prev, ...patch, updatedAt: _now() });
}

function clearDiscordPresence(discordId) {
  if (!discordId) return;
  _discord.delete(String(discordId));
}

function setSteamPresence(steamId64, patch) {
  if (!steamId64) return;
  const prev = _steam.get(String(steamId64)) || {};
  _steam.set(String(steamId64), { ...prev, ...patch, updatedAt: _now() });
}

function clearSteamPresence(steamId64) {
  if (!steamId64) return;
  _steam.delete(String(steamId64));
}

function _readDiscord(discordId) {
  if (!discordId) return null;
  const r = _discord.get(String(discordId));
  if (!r) return null;
  if (_now() - (r.updatedAt || 0) > STALE_MS) return null;
  return r;
}

function _readSteam(steamId64) {
  if (!steamId64) return null;
  const r = _steam.get(String(steamId64));
  if (!r) return null;
  if (_now() - (r.updatedAt || 0) > STALE_MS) return null;
  return r;
}

async function _isVisible(accountId) {
  try {
    const pool = db.getPool();
    const r = await pool.query(
      `SELECT presence_visible FROM player_profiles WHERE account_id = $1`,
      [String(accountId)]
    );
    if (r.rows.length === 0) return true;
    return r.rows[0].presence_visible !== false;
  } catch {
    return true;
  }
}

async function _isInQueue(accountId) {
  try {
    const pool = db.getPool();
    const r = await pool.query(
      `SELECT 1 FROM inhouse_queue WHERE account_id = $1 LIMIT 1`,
      [String(accountId)]
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

const OFFLINE = { status: 'offline', updated_at: null };

async function getPlayerPresence(accountId) {
  if (!accountId) return { ...OFFLINE };
  try {
    const accountId32 = String(accountId);
    const visible = await _isVisible(accountId32);
    if (!visible) return { ...OFFLINE, hidden: true };

    let steamId64 = null;
    try { steamId64 = (BigInt(accountId32) + STEAM64_OFFSET).toString(); } catch {}
    const discordId = await db.getDiscordIdByAccountId(accountId32).catch(() => null);

    const steam = _readSteam(steamId64);
    const discord = _readDiscord(discordId);
    const inQueue = await _isInQueue(accountId32);

    // Priority: in_game > in_lobby > in_queue > in_voice > online > offline
    if (steam?.state === 'in_game') {
      return {
        status: 'in_game',
        hero_id: steam.heroId || null,
        hero: steam.heroName || null,
        match_id: steam.matchId || null,
        updated_at: new Date(steam.updatedAt).toISOString(),
      };
    }
    if (steam?.state === 'in_lobby') {
      return {
        status: 'in_lobby',
        updated_at: new Date(steam.updatedAt).toISOString(),
      };
    }
    if (inQueue) {
      return { status: 'in_queue', updated_at: new Date().toISOString() };
    }
    if (discord?.voice) {
      return {
        status: 'in_voice',
        updated_at: new Date(discord.updatedAt).toISOString(),
      };
    }
    if (discord?.state && discord.state !== 'offline') {
      return {
        status: 'online',
        updated_at: new Date(discord.updatedAt).toISOString(),
      };
    }
    return { ...OFFLINE };
  } catch (err) {
    return { ...OFFLINE };
  }
}

// Parse Dota 2 rich_presence array into { state, heroName, heroId, matchId }.
// rich_presence shape: [{ key: 'status', value: '#DOTA_RP_PLAYING_AS' }, ...]
const DOTA_HERO_KEY_RE = /^#?npc_dota_hero_(.+)$/;

function parseDotaRichPresence(rp) {
  if (!Array.isArray(rp)) return null;
  const map = {};
  for (const kv of rp) {
    if (kv && kv.key) map[kv.key] = kv.value;
  }
  const status = map.status || '';
  const watchableId = map.WatchableGameID || map.watching_server || null;
  const heroToken = map.param0 || '';
  let heroName = null;
  let heroId = null;
  const m = String(heroToken).match(DOTA_HERO_KEY_RE);
  if (m) {
    heroName = m[1].split('_').map(s => s[0]?.toUpperCase() + s.slice(1)).join(' ');
  }
  // Heuristic: if WatchableGameID is set and non-zero, the player is in a
  // live match. Otherwise rp.steam_player_group (lobby_id) implies lobby.
  const lobbyId = map.steam_player_group;
  let state = null;
  if (watchableId && String(watchableId) !== '0') {
    state = 'in_game';
  } else if (status && /PLAYING|FINDING|HERO_SELECTION|STRATEGY|PREGAME/i.test(status)) {
    state = 'in_game';
  } else if (lobbyId && lobbyId !== '0') {
    state = 'in_lobby';
  }
  return { state, heroName, heroId, matchId: state === 'in_game' ? watchableId || null : null };
}

module.exports = {
  setDiscordPresence,
  clearDiscordPresence,
  setSteamPresence,
  clearSteamPresence,
  getPlayerPresence,
  parseDotaRichPresence,
  // exposed for tests
  _caches: { _discord, _steam },
};
