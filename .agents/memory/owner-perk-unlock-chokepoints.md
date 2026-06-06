---
name: Owner-perk unlock chokepoints
description: Where to short-circuit ownership so superusers own everything in BOTH display and equip validation.
---

Granting "own everything" to superusers (allow-list in `src/auth/superusers.js`,
a dependency-free leaf required by web/db/monetization) means short-circuiting
ownership reads at the LOWEST layer so display lists and equip/save validation
agree. Missing one half = a cosmetic shows owned but won't equip (or vice versa).

**Why:** the equip-validation reads are split across two files and easy to miss:
- `src/db/index.js`: isProMember, isFounder, hasFrameUnlocked, getOwnedFrames,
  getCoinOwnedCosmetics, hasCoinCosmetic, getOwnedEntitlements, hasEntitlement,
  listOwnedFounderRings.
- `src/monetization/magazineV3/oneOffPerks.js`: hasOneOffPerk, listOneOffPerks.
- `src/monetization/lootbox/db.js`: **equipCosmetic** (ownership SELECT before the
  UPDATE) and **getCollection** (builds owned Set from DB rows) — these do NOT go
  through `db.getCoinOwnedCosmetics`, so patching only db/index.js leaves lootbox
  locker/equip broken for superusers. This was the gap the first pass missed.

**How to apply:** any future "grant X for free" / role-based ownership change must
patch every place that *reads* ownership for both render and mutation. Grep for
`coin_owned_cosmetics`, `frame_purchases`, `entitlements`, `user_one_off_perks`
direct reads. Coins are a spendable currency, deliberately NOT auto-filled.
