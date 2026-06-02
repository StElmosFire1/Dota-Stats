/**
 * Lootbox & Collection — single source of truth (Task #664, full edition only).
 *
 * EVERYTHING about boxes, drop odds, prices, dupe handling and the cosmetic
 * catalog lives here. The server rolls drops from this module and the frontend
 * fetches the *same* object via `GET /api/lootbox/catalog`, so the published
 * odds in the UI can never drift from what the server actually does.
 *
 * Coins-only. No real-money path touches a box.
 *
 * Cosmetic kinds introduced by this system (granted into `coin_owned_cosmetics`
 * as `kind:value`, re-using the existing coin-ownership plumbing):
 *   - avatar_ring     — animated/!static ring drawn around the profile portrait
 *   - profile_banner  — cover / banner art behind the profile header
 *   - nameplate_fx    — username / nameplate visual effect
 *   - recap_skin      — scoreboard / recap-card skin
 *
 * Plus a non-cosmetic special drop:
 *   - pro_time        — grants N days of Pro membership (rare Legendary chase)
 *
 * Rarities: common < rare < epic < legendary.
 */

'use strict';

const RARITIES = ['common', 'rare', 'epic', 'legendary'];

const RARITY_META = Object.freeze({
  common:    { label: 'Common',    color: '#9ca3af' },
  rare:      { label: 'Rare',      color: '#3b82f6' },
  epic:      { label: 'Epic',      color: '#a855f7' },
  legendary: { label: 'Legendary', color: '#f59e0b' },
});

// ---------------------------------------------------------------------------
// Seasonal / tournament sets. A retired set's items can no longer DROP from
// boxes (and disappear from the published odds), but anything already owned
// stays owned and equippable. Default-retired state lives here; admins flip the
// live state at runtime (stored in the lootbox_retired_sets table).
// ---------------------------------------------------------------------------
const SETS = Object.freeze({
  'oce-cup-2026': {
    id: 'oce-cup-2026',
    label: 'OCE Cup 2026',
    description: 'Tournament set — limited to the 2026 cup season, retired afterwards.',
    retiredByDefault: false,
  },
});

// ---------------------------------------------------------------------------
// Cosmetic + special item catalog. `value` is the per-kind slug; the SKU is
// `${kind}:${value}` and matches the coin_owned_cosmetics (kind, value) pair.
//
//   boxExclusive: true  → never sold in the coin shop, only obtainable from a
//                         box (or a wildcard token redemption).
//   set: '<setId>'      → belongs to a seasonal/tournament set (retirable).
//   freePool: true      → eligible for the free weekly box's weaker pool.
//   days: N             → (pro_time only) days of Pro membership granted.
// ---------------------------------------------------------------------------
const ITEMS = [
  // ---- avatar rings -------------------------------------------------------
  { kind: 'avatar_ring', value: 'brass-pulse',  label: 'Brass Pulse Ring',   rarity: 'common', freePool: true },
  { kind: 'avatar_ring', value: 'radiant',      label: 'Radiant Ring',       rarity: 'common', freePool: true },
  { kind: 'avatar_ring', value: 'dire',         label: 'Dire Ring',          rarity: 'rare',   freePool: true },
  { kind: 'avatar_ring', value: 'frost',        label: 'Frost Halo',         rarity: 'rare' },
  { kind: 'avatar_ring', value: 'ember',        label: 'Ember Halo',         rarity: 'epic' },
  { kind: 'avatar_ring', value: 'prismatic',    label: 'Prismatic Halo',     rarity: 'legendary', boxExclusive: true },
  { kind: 'avatar_ring', value: 'cup-champion', label: 'Cup Champion Ring',  rarity: 'epic', set: 'oce-cup-2026', boxExclusive: true },

  // ---- profile banners ----------------------------------------------------
  { kind: 'profile_banner', value: 'parchment', label: 'Parchment Banner', rarity: 'common', freePool: true },
  { kind: 'profile_banner', value: 'court',     label: 'Court Banner',     rarity: 'common', freePool: true },
  { kind: 'profile_banner', value: 'pitch',     label: 'Pitch Banner',     rarity: 'rare',   freePool: true },
  { kind: 'profile_banner', value: 'nightfall', label: 'Nightfall Banner', rarity: 'rare' },
  { kind: 'profile_banner', value: 'aurora',    label: 'Aurora Banner',    rarity: 'epic' },
  { kind: 'profile_banner', value: 'galaxy',    label: 'Galaxy Banner',    rarity: 'legendary', boxExclusive: true },
  { kind: 'profile_banner', value: 'cup-2026',  label: 'OCE Cup 2026 Banner', rarity: 'rare', set: 'oce-cup-2026', boxExclusive: true },

  // ---- nameplate effects --------------------------------------------------
  { kind: 'nameplate_fx', value: 'shine',   label: 'Shine',          rarity: 'common', freePool: true },
  { kind: 'nameplate_fx', value: 'sparkle', label: 'Sparkle',        rarity: 'rare',   freePool: true },
  { kind: 'nameplate_fx', value: 'flame',   label: 'Flame Text',     rarity: 'epic' },
  { kind: 'nameplate_fx', value: 'rainbow', label: 'Rainbow Wave',   rarity: 'legendary', boxExclusive: true },
  { kind: 'nameplate_fx', value: 'cup-gold',label: 'Cup Gold Glow',  rarity: 'epic', set: 'oce-cup-2026', boxExclusive: true },

  // ---- recap / scoreboard skins -------------------------------------------
  { kind: 'recap_skin', value: 'classic', label: 'Classic Recap', rarity: 'common', freePool: true },
  { kind: 'recap_skin', value: 'noir',    label: 'Noir Recap',    rarity: 'rare',   freePool: true },
  { kind: 'recap_skin', value: 'gold',    label: 'Gold Recap',    rarity: 'epic' },
  { kind: 'recap_skin', value: 'holo',    label: 'Holo Recap',    rarity: 'legendary', boxExclusive: true },
  { kind: 'recap_skin', value: 'cup-2026',label: 'OCE Cup 2026 Recap', rarity: 'rare', set: 'oce-cup-2026', boxExclusive: true },

  // ---- special: Pro-membership time (the rare Legendary chase) -------------
  { kind: 'pro_time', value: '7',  label: '7 Days of Pro',  rarity: 'epic',      days: 7,  boxExclusive: true, special: true },
  { kind: 'pro_time', value: '30', label: '30 Days of Pro', rarity: 'legendary', days: 30, boxExclusive: true, special: true },
].map((it) => Object.freeze({ ...it, sku: `${it.kind}:${it.value}` }));

const ITEMS_BY_SKU = Object.freeze(
  ITEMS.reduce((m, it) => { m[it.sku] = it; return m; }, {})
);

// Kinds that are equippable cosmetics (everything but the pro_time special).
const COSMETIC_KINDS = Object.freeze(['avatar_ring', 'profile_banner', 'nameplate_fx', 'recap_skin']);

// ---------------------------------------------------------------------------
// Box tiers — coin prices + published rarity odds. Weights are relative; the
// UI normalises them to percentages. Within a rolled rarity bucket the drop is
// uniform across the currently-active (non-retired, tier-eligible) items.
// ---------------------------------------------------------------------------
const BOXES = Object.freeze({
  common: Object.freeze({
    id: 'common',
    label: 'Common Crate',
    price: 150,
    blurb: 'A dependable crate. Mostly common cosmetics, the odd rare.',
    rarityWeights: Object.freeze({ common: 80, rare: 18, epic: 2, legendary: 0 }),
  }),
  rare: Object.freeze({
    id: 'rare',
    label: 'Rare Cache',
    price: 400,
    blurb: 'Better odds for epics, with a slim shot at a legendary.',
    rarityWeights: Object.freeze({ common: 50, rare: 35, epic: 13, legendary: 2 }),
  }),
  legendary: Object.freeze({
    id: 'legendary',
    label: 'Legendary Vault',
    price: 900,
    blurb: 'The best odds for epics and legendaries — including Pro-time drops.',
    rarityWeights: Object.freeze({ common: 20, rare: 38, epic: 30, legendary: 12 }),
  }),
});

// Free weekly box — no price, claimable once per ISO week, from a weaker pool
// (free-pool items only; common/rare rarities only; never Pro-time).
const FREE_BOX = Object.freeze({
  id: 'free',
  label: 'Weekly Free Box',
  price: 0,
  blurb: 'One free box every week, drawn from a weaker pool of cosmetics.',
  rarityWeights: Object.freeze({ common: 88, rare: 12, epic: 0, legendary: 0 }),
});

// ---------------------------------------------------------------------------
// Duplicate handling. When a box rolls a cosmetic you already own:
//   - common/rare/epic dupes → a coin refund (so a box is never "wasted")
//   - legendary dupes        → a wildcard token (redeemable for any one
//                              eligible cosmetic you don't own yet)
// pro_time is never a dupe — every drop grants more days.
// ---------------------------------------------------------------------------
const DUPE_REFUND_COINS = Object.freeze({ common: 25, rare: 90, epic: 220, legendary: 0 });
const DUPE_GRANTS_TOKEN = Object.freeze({ legendary: true });

function isValidBoxId(id) {
  return id === 'free' || Object.prototype.hasOwnProperty.call(BOXES, id);
}
function getBox(id) {
  if (id === 'free') return FREE_BOX;
  return BOXES[id] || null;
}
function getItem(sku) {
  return ITEMS_BY_SKU[sku] || null;
}
function isCosmeticKind(kind) {
  return COSMETIC_KINDS.includes(kind);
}

/**
 * Resolve an item's effective set id. Static membership (catalog `it.set`)
 * takes precedence; `setMembership` (a runtime sku→setId map for admin-created
 * custom sets) layers on top for items the static catalog doesn't assign.
 */
function itemSetId(item, setMembership = null) {
  if (item.set) return item.set;
  if (setMembership) {
    const m = setMembership instanceof Map ? setMembership.get(item.sku) : setMembership[item.sku];
    if (m) return m;
  }
  return null;
}

/**
 * Items eligible to DROP from a given box, excluding any whose set is retired.
 * `retiredSetIds` is a Set/array of set ids currently retired (runtime state).
 * `setMembership` is an optional sku→setId map for admin-created custom sets so
 * retiring such a set removes its member items from drops too.
 */
function eligibleItems(boxId, retiredSetIds = [], setMembership = null) {
  const retired = new Set(retiredSetIds);
  const isFree = boxId === 'free';
  return ITEMS.filter((it) => {
    const setId = itemSetId(it, setMembership);
    if (setId && retired.has(setId)) return false;
    if (isFree && !it.freePool) return false;
    return true;
  });
}

/**
 * Published odds for a box, given the current retired sets. Returns an array of
 * { rarity, label, color, weight, pct, items: [{sku,label,...}] } so the UI can
 * render the exact same numbers the server rolls against. Rarities with no
 * eligible items (or zero weight) are omitted.
 */
function publishedOdds(boxId, retiredSetIds = [], setMembership = null) {
  const box = getBox(boxId);
  if (!box) return [];
  const items = eligibleItems(boxId, retiredSetIds, setMembership);
  const byRarity = {};
  for (const r of RARITIES) byRarity[r] = [];
  for (const it of items) byRarity[it.rarity].push(it);

  // Effective weight per rarity = configured weight, but zeroed if no eligible
  // items remain in that bucket (so retiring a whole rarity's worth of items
  // can't silently keep advertising it).
  const eff = {};
  let total = 0;
  for (const r of RARITIES) {
    const w = (byRarity[r].length > 0) ? (box.rarityWeights[r] || 0) : 0;
    eff[r] = w;
    total += w;
  }
  const rows = [];
  for (const r of RARITIES) {
    if (eff[r] <= 0) continue;
    rows.push({
      rarity: r,
      label: RARITY_META[r].label,
      color: RARITY_META[r].color,
      weight: eff[r],
      pct: total > 0 ? +((eff[r] / total) * 100).toFixed(2) : 0,
      items: byRarity[r].map((it) => ({
        sku: it.sku, kind: it.kind, value: it.value, label: it.label,
        boxExclusive: !!it.boxExclusive, set: itemSetId(it, setMembership), special: !!it.special,
        days: it.days || null,
      })),
    });
  }
  return rows;
}

/**
 * Server-authoritative drop roll. Picks a rarity by effective weight, then an
 * item within that bucket. Falls back to the next-lower non-empty rarity if the
 * rolled bucket somehow has no eligible items.
 *
 * Ownership-aware: when `ownedSkus` is supplied, the within-bucket pick prefers
 * items the player does NOT already own, so a box only ever yields a duplicate
 * once the player owns *everything* in the rolled rarity. This keeps the
 * published rarity odds exactly truthful (the rarity distribution is untouched)
 * while making dupes a genuine "you own it all" fallback rather than random
 * waste. pro_time items are never recorded as owned cosmetics, so they always
 * count as unowned candidates and stay rollable.
 *
 * `rng` defaults to Math.random (injectable for tests). `ownedSkus` is an
 * optional Set/array of owned SKUs (`${kind}:${value}`); omit for raw odds.
 */
function rollDrop(boxId, retiredSetIds = [], rng = Math.random, ownedSkus = null, setMembership = null) {
  const box = getBox(boxId);
  if (!box) throw new Error(`rollDrop: unknown box ${boxId}`);
  const items = eligibleItems(boxId, retiredSetIds, setMembership);
  const byRarity = {};
  for (const r of RARITIES) byRarity[r] = [];
  for (const it of items) byRarity[it.rarity].push(it);

  const eff = {};
  let total = 0;
  for (const r of RARITIES) {
    const w = (byRarity[r].length > 0) ? (box.rarityWeights[r] || 0) : 0;
    eff[r] = w;
    total += w;
  }
  if (total <= 0) throw new Error(`rollDrop: no eligible items for box ${boxId}`);

  let roll = rng() * total;
  let chosenRarity = null;
  for (const r of RARITIES) {
    if (eff[r] <= 0) continue;
    if (roll < eff[r]) { chosenRarity = r; break; }
    roll -= eff[r];
  }
  if (!chosenRarity) {
    // Floating-point safety: take the highest non-empty rarity.
    for (let i = RARITIES.length - 1; i >= 0; i--) {
      if (eff[RARITIES[i]] > 0) { chosenRarity = RARITIES[i]; break; }
    }
  }
  const bucket = byRarity[chosenRarity];

  // Prefer unowned items within the rolled rarity. Only when the player owns
  // every item in the bucket does the pick fall back to the full bucket (a
  // genuine duplicate, which the open engine converts to a refund / token).
  let candidates = bucket;
  if (ownedSkus) {
    const ownedSet = ownedSkus instanceof Set ? ownedSkus : new Set(ownedSkus);
    const unowned = bucket.filter((it) => !ownedSet.has(it.sku));
    if (unowned.length > 0) candidates = unowned;
  }
  const pick = candidates[Math.floor(rng() * candidates.length)] || candidates[0];
  return pick;
}

module.exports = {
  RARITIES,
  RARITY_META,
  SETS,
  ITEMS,
  ITEMS_BY_SKU,
  COSMETIC_KINDS,
  BOXES,
  FREE_BOX,
  DUPE_REFUND_COINS,
  DUPE_GRANTS_TOKEN,
  isValidBoxId,
  getBox,
  getItem,
  isCosmeticKind,
  itemSetId,
  eligibleItems,
  publishedOdds,
  rollDrop,
};
