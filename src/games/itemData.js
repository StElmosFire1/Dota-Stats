// Task #451 — item metadata for the Item-zoom mini-game, sourced from
// `dotaconstants`. We build a stable shortlist of recognisable, purchasable
// items (the "100-item shortlist" the player guesses from) by filtering the
// full item table to meaningful quals + a cost floor, then capping the list.

let _items = null;
let _shortlist = null;

function _load() {
  if (_items) return;
  _items = require('dotaconstants/build/items.json');
}

// Quals that read as "real items" players recognise on a scoreboard. Excludes
// consumables (tango/clarity) and tiny common components to keep the guess
// pool fair and recognisable.
const NOTABLE_QUALS = new Set([
  'component', 'secret_shop', 'rare', 'epic', 'artifact',
]);

// A handful of slugs to always drop (event/junk/duplicate-tier noise).
const EXCLUDE = /^(river_painter|mystery|present|greevil|seasonal|ad_|trident|recipe_|tpscroll$|enchanted_mango|faerie_fire|smoke_of_deceit$)/;

function itemImgUrl(slug) {
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${slug}.png`;
}

// Returns the curated shortlist as [{ id, slug, name, cost }], stable & sorted.
function shortlist() {
  if (_shortlist) return _shortlist;
  _load();
  const arr = Object.entries(_items)
    .filter(([slug, v]) =>
      v && v.id && v.dname && v.cost > 0 &&
      v.qual !== 'recipe' && v.qual !== 'consumable' && v.qual !== 'common' &&
      NOTABLE_QUALS.has(v.qual) &&
      v.cost >= 500 &&
      !EXCLUDE.test(slug)
    )
    .filter(([, v]) => !/ - (Roshan|Consumable|Trapped)/.test(v.dname))
    .map(([slug, v]) => ({ id: v.id, slug, name: v.dname, cost: v.cost }));
  // De-dupe by display name (some neutral/upgrade variants share a dname).
  const seen = new Set();
  const deduped = [];
  for (const it of arr.sort((a, b) => a.name.localeCompare(b.name))) {
    if (seen.has(it.name)) continue;
    seen.add(it.name);
    deduped.push(it);
  }
  _shortlist = deduped;
  return _shortlist;
}

function shortlistIds() {
  return shortlist().map(i => i.id);
}

function getItemById(id) {
  return shortlist().find(i => i.id === Number(id)) || null;
}

function getItemBySlug(slug) {
  return shortlist().find(i => i.slug === slug) || null;
}

module.exports = {
  itemImgUrl,
  shortlist,
  shortlistIds,
  getItemById,
  getItemBySlug,
};
