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

// Task #213 — bulk live-presence rollup for the /players "Live now" tab.
// Walks the in-memory _steam and _discord caches, joins them with the
// inhouse_queue table, applies the same priority + visibility rules as
// getPlayerPresence(), and returns one row per visible live account so
// the page can render with a single API call instead of N profile pings.
async function getAllLivePresences() {
  const now = _now();
  // Step 1: collect candidate (accountId, source) pairs from each cache.
  // Steam cache is keyed by steamId64, which we can convert to a 32-bit
  // account id locally with no DB round-trip.
  const candidates = new Map(); // accountId32 -> { steam, discord }

  for (const [steamId64, rec] of _steam.entries()) {
    if (!rec || !rec.state) continue;
    if (now - (rec.updatedAt || 0) > STALE_MS) continue;
    if (rec.state !== 'in_game' && rec.state !== 'in_lobby') continue;
    let accountId32;
    try { accountId32 = (BigInt(steamId64) - STEAM64_OFFSET).toString(); } catch { continue; }
    const slot = candidates.get(accountId32) || {};
    slot.steam = rec;
    candidates.set(accountId32, slot);
  }

  // Discord cache is keyed by discordId; resolve to account_id in one query.
  // Only voice-active records produce a "Live now" row (plain Discord-online
  // is intentionally excluded — Task #213 scopes the rollup to actively-
  // doing-something statuses).
  const discordIds = [];
  for (const [discordId, rec] of _discord.entries()) {
    if (!rec) continue;
    if (now - (rec.updatedAt || 0) > STALE_MS) continue;
    if (!rec.voice) continue;
    discordIds.push(String(discordId));
  }

  let pool;
  try { pool = db.getPool(); } catch { return []; }

  if (discordIds.length > 0) {
    try {
      const r = await pool.query(
        `SELECT account_id::text AS account_id, discord_id
           FROM nicknames
          WHERE discord_id = ANY($1::text[]) AND account_id IS NOT NULL
          UNION
         SELECT account_id_32 AS account_id, discord_id
           FROM players
          WHERE discord_id = ANY($1::text[]) AND account_id_32 IS NOT NULL AND account_id_32 != ''`,
        [discordIds]
      );
      for (const row of r.rows) {
        const rec = _discord.get(row.discord_id);
        if (!rec) continue;
        const slot = candidates.get(row.account_id) || {};
        if (!slot.discord) slot.discord = rec;
        candidates.set(row.account_id, slot);
      }
    } catch (err) {
      // Non-fatal: skip discord-derived rows on DB hiccup.
    }
  }

  // Step 2: pull current inhouse queue once and merge as in_queue.
  let queueAccountIds = new Set();
  try {
    const r = await pool.query(`SELECT account_id::text AS account_id FROM inhouse_queue WHERE account_id IS NOT NULL`);
    for (const row of r.rows) {
      queueAccountIds.add(row.account_id);
      if (!candidates.has(row.account_id)) candidates.set(row.account_id, {});
    }
  } catch {}

  if (candidates.size === 0) return [];

  // Step 3: bulk visibility + display-name lookup.
  const accountIds = Array.from(candidates.keys());
  let infoByAccount = new Map();
  try {
    const r = await pool.query(
      `SELECT ps.account_id::text AS account_id,
              COALESCE(n.nickname, ps.persona_name) AS display_name,
              COALESCE(pp.presence_visible, TRUE) AS presence_visible
         FROM (
           SELECT DISTINCT ON (account_id) account_id, persona_name
             FROM player_stats
            WHERE account_id::text = ANY($1::text[])
            ORDER BY account_id, id DESC
         ) ps
         LEFT JOIN nicknames n ON n.account_id = ps.account_id
         LEFT JOIN player_profiles pp ON pp.account_id = ps.account_id`,
      [accountIds]
    );
    for (const row of r.rows) {
      infoByAccount.set(row.account_id, {
        display_name: row.display_name || null,
        presence_visible: row.presence_visible !== false,
      });
    }
  } catch {}

  // Step 4: build the final rows, applying the same priority as
  // getPlayerPresence (in_game > in_lobby > in_queue > in_voice > online).
  const out = [];
  for (const [accountId, slot] of candidates.entries()) {
    const info = infoByAccount.get(accountId);
    if (!info || info.presence_visible === false) continue;
    const steam = slot.steam;
    const discord = slot.discord;
    const inQueue = queueAccountIds.has(accountId);
    let row = null;
    if (steam?.state === 'in_game') {
      row = {
        status: 'in_game',
        hero_id: steam.heroId || null,
        hero: steam.heroName || null,
        match_id: steam.matchId || null,
        updated_at: new Date(steam.updatedAt).toISOString(),
      };
    } else if (steam?.state === 'in_lobby') {
      row = { status: 'in_lobby', updated_at: new Date(steam.updatedAt).toISOString() };
    } else if (inQueue) {
      row = { status: 'in_queue', updated_at: new Date().toISOString() };
    } else if (discord?.voice) {
      row = { status: 'in_voice', updated_at: new Date(discord.updatedAt).toISOString() };
    }
    // NB: plain 'online' (Discord-online but not in game/lobby/queue/voice) is
    // intentionally excluded — Task #213 scopes "Live now" to the four
    // actively-doing-something statuses.
    if (!row) continue;
    out.push({
      account_id: accountId,
      display_name: info.display_name,
      ...row,
    });
  }

  // Sort by status priority then display name for a stable UI.
  const order = { in_game: 0, in_lobby: 1, in_queue: 2, in_voice: 3 };
  out.sort((a, b) => {
    const da = order[a.status] ?? 99;
    const db_ = order[b.status] ?? 99;
    if (da !== db_) return da - db_;
    return String(a.display_name || '').localeCompare(String(b.display_name || ''));
  });
  return out;
}

module.exports = {
  setDiscordPresence,
  clearDiscordPresence,
  setSteamPresence,
  clearSteamPresence,
  getPlayerPresence,
  getAllLivePresences,
  parseDotaRichPresence,
  // exposed for tests
  _caches: { _discord, _steam },
};
