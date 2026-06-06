'use strict';

// Single source of truth for the Steam-account-bound superuser allow-list.
//
// Superuser is granted PURELY by Steam account — no password. The 32-bit Steam
// account id (the value stored on req.session.accountId, and the number in a
// player's /profile URL) is checked against SUPERUSER_STEAM_IDS plus the always-
// included owner default below. accountId is verified server-side at
// /auth/complete via Steam OpenID, so it can't be forged client-side.
//
// This module is a dependency-free leaf (it only reads process.env) so it can be
// required from the web server, the db layer, and the monetization modules
// without any circular-import risk.

// The historical/default owner Steam 32-bit account id. Mirrors the
// OWNER_DISCORD_ID fallback in src/discord/bot.js so a missing / mistyped
// SUPERUSER_STEAM_IDS on a prod host can never hard-lock the owner out of the
// admin panel, the FULL_SITE_LOCKDOWN gate, or (now) the owner-perk unlocks.
// Co-owners are added via SUPERUSER_STEAM_IDS — this default is always included
// on top of whatever the env var lists. Not a secret: it's the owner's public
// 32-bit account id, and access still requires actually being signed in as that
// Steam account (verified server-side via Steam OpenID, signed session cookie).
const DEFAULT_OWNER_STEAM_ACCOUNT_ID = '35944021';

// Parse the SUPERUSER_STEAM_IDS allow-list into a Set of string account ids.
// Comma/space/newline separated; blank entries ignored. The owner default is
// always added, so the Set is never empty.
function parseSuperuserSteamIds() {
  const raw = process.env.SUPERUSER_STEAM_IDS || '';
  const ids = new Set(
    raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
  );
  // Always allow-list the owner so a missed env var can't lock them out.
  ids.add(DEFAULT_OWNER_STEAM_ACCOUNT_ID);
  return ids;
}

// True iff the given 32-bit Steam account id belongs to a superuser (owner or
// an allow-listed co-owner). Used by the owner-perk unlocks in the db /
// monetization layers, which have no req/session to consult.
function isSuperuserAccountId(accountId) {
  if (accountId == null || accountId === '') return false;
  return parseSuperuserSteamIds().has(String(accountId));
}

module.exports = {
  DEFAULT_OWNER_STEAM_ACCOUNT_ID,
  parseSuperuserSteamIds,
  isSuperuserAccountId,
};
