---
name: Lootbox catalog single-source
description: Why the lootbox cosmetic metadata in profileCosmetics.js has no server mirror, unlike the older purchasable cosmetics.
---

The lootbox system (FULL edition, `src/monetization/lootbox/`) treats the server
catalog (`src/monetization/lootbox/catalog.js`) as the single source of truth for
box odds, cosmetic SKUs, dupe-refund/wildcard rules, and set retirement. The public
`GET /api/lootbox/catalog` returns exactly what the user rolls against — published
odds and server weights are the same object.

**Decision:** The lootbox cosmetic visual metadata appended to
`web/src/profileCosmetics.js` (avatarRingStyle / bannerStyle / nameplateStyle /
recapSkinSwatch / RARITY_COLORS) is **render-only** and deliberately has **no
server-side mirror**, unlike the older purchasable cosmetics which keep a paired
server/client list in sync.

**Why:** Equip requests (`POST /api/lootbox/equip`, `{kind,value}`) are validated
server-side against the lootbox catalog + the user's entitlements, not against
profileCosmetics. So the client styling map can drift/extend freely without a
security or correctness risk — an unknown value just renders no style. Adding a
server mirror would be dead weight.

**How to apply:** When adding a new lootbox cosmetic, add it to `catalog.js`
(authoritative) and optionally a visual style in `profileCosmetics.js`. Do NOT add
it to the legacy purchasable-cosmetics server mirror. recap_skin is collectible /
equippable / preview-swatched only — it is NOT yet applied to the actual generated
scoreboard image (`src/services/scoreboardImage.js`) because that render is
multi-player and whose skin wins is ambiguous (deferred as a follow-up).

## Ownership-aware drop selection
`rollDrop(boxId, retired, rng, ownedSkus)` rolls the rarity by published weight,
then within that rarity bucket prefers items the player does NOT own. A duplicate
(→ coin refund, or wildcard token for legendary) only happens once the player owns
*everything* in the rolled rarity. **Why:** keeps the published rarity odds exactly
truthful (the rarity distribution is never altered) while making dupes a genuine
"you own it all" fallback rather than random waste — a hard requirement, not just a
nicety. **How to apply:** any new open path must read owned cosmetics
(coin_owned_cosmetics) and pass them in; never roll raw odds for a real open.
pro_time is never written to coin_owned_cosmetics so it always counts as unowned
and stays rollable.
