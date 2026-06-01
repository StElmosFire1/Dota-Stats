// Community-edition player-name resolution. Order of resolution:
//   1. player.nickname      (community nickname)
//   2. player.persona_name  (Steam persona)
//   3. player.display_name  (server-resolved fallback)
//   4. `Player #<accountId>` — last-ditch, never the default.
//
// Mirrors the full edition's helper (web/src/utils/displayName.js) so a missing
// nickname falls back to the Steam name before ever showing a raw account id.

export function resolveDisplayName(accountId, player = null) {
  if (player) {
    if (player.nickname && String(player.nickname).trim()) return String(player.nickname).trim();
    if (player.persona_name && String(player.persona_name).trim()) return String(player.persona_name).trim();
    if (player.display_name && String(player.display_name).trim()) return String(player.display_name).trim();
  }
  const id = Number(accountId);
  if (Number.isFinite(id) && id > 0) return `Player #${id}`;
  return 'Unknown player';
}

// Convenience for callers that already hold a `player` object.
export function resolvePlayerDisplayName(player, fallbackId = null) {
  if (!player) {
    const id = Number(fallbackId);
    return Number.isFinite(id) && id > 0 ? `Player #${id}` : 'Unknown player';
  }
  return resolveDisplayName(player.account_id ?? fallbackId, player);
}
