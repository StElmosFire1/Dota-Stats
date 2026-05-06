// v5.92 — single source of truth for player-name rendering across the
// inhouse lobby and captain-draft UIs. Order of resolution:
//   1. nicknameMap[accountId] (explicit override map, optional)
//   2. player.nickname  (already-joined community nickname)
//   3. player.bot_name  (demo bots seeded by the admin)
//   4. player.persona_name / player.display_name  (fallback Steam personas)
//   5. `Player #<accountId>` — last-ditch, never the default.
//
// Bots in the 9_000_001..9_000_010 range get a friendlier "Bot N" label if
// they don't have a nickname or bot_name attached, so we don't render
// "Player #9000003" mid-draft.

const BOT_RANGE_START = 9_000_001;
const BOT_RANGE_END = 9_000_010;

export function isBotAccount(accountId) {
  const id = Number(accountId);
  return Number.isFinite(id) && id >= BOT_RANGE_START && id <= BOT_RANGE_END;
}

export function resolveDisplayName(accountId, nicknameMap = null, player = null) {
  const id = Number(accountId);
  const fromMap = nicknameMap && nicknameMap[id];
  if (fromMap && String(fromMap).trim()) return String(fromMap).trim();

  if (player) {
    if (player.nickname && String(player.nickname).trim()) return String(player.nickname).trim();
    if (player.bot_name && String(player.bot_name).trim()) return String(player.bot_name).trim();
    if (player.persona_name && String(player.persona_name).trim()) return String(player.persona_name).trim();
    if (player.display_name && String(player.display_name).trim()) return String(player.display_name).trim();
  }

  if (isBotAccount(id)) return `Bot ${id - BOT_RANGE_START + 1}`;
  if (Number.isFinite(id) && id > 0) return `Player #${id}`;
  return 'Unknown player';
}

// Convenience for components that already hold a `player` object — saves
// the caller from repeating `(player.account_id, null, player)`.
export function resolvePlayerDisplayName(player, nicknameMap = null) {
  if (!player) return 'Unknown player';
  return resolveDisplayName(player.account_id, nicknameMap, player);
}

// Build a quick lookup so we can resolve captain ids etc. without scanning
// the players list every render.
export function buildNicknameMap(players = []) {
  const map = {};
  for (const p of players) {
    if (!p || p.account_id == null) continue;
    const name = resolvePlayerDisplayName(p);
    if (name) map[Number(p.account_id)] = name;
  }
  return map;
}
