// Task #451 — hero metadata for the mini-games, sourced from `dotaconstants`
// (the OpenDota static data package). The repo's own web/src/heroNames.js
// only carries id→name/slug, which isn't enough for Heroguessr/Talent guesser
// hints (primary attribute, roles, talents, ability icons). dotaconstants
// gives us all of that from a versioned, offline JSON bundle.

let _heroes = null;
let _heroAbilities = null;
let _abilities = null;

function _load() {
  if (_heroes) return;
  _heroes = require('dotaconstants/build/heroes.json');
  _heroAbilities = require('dotaconstants/build/hero_abilities.json');
  _abilities = require('dotaconstants/build/abilities.json');
}

const ATTR_LABEL = {
  str: 'Strength',
  agi: 'Agility',
  int: 'Intelligence',
  all: 'Universal',
};

// Steam CDN slug for a hero image, derived from the npc name
// (npc_dota_hero_antimage → antimage). dotaconstants `img` already encodes
// the slug but we keep it explicit so silhouette/icon URLs are predictable.
function _slugFromNpc(npc) {
  return String(npc || '').replace('npc_dota_hero_', '');
}

function heroImgUrl(npc) {
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${_slugFromNpc(npc)}.png`;
}

function abilityImgUrl(abilitySlug) {
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/${abilitySlug}.png`;
}

// All playable heroes as { id, name, npc, slug }. Filtered to entries that
// have a real localized name (drops the odd placeholder rows in the bundle).
function rosterHeroes() {
  _load();
  return Object.values(_heroes)
    .filter(h => h && h.id && h.localized_name && h.name)
    .map(h => ({
      id: h.id,
      name: h.localized_name,
      npc: h.name,
      slug: _slugFromNpc(h.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function heroIds() {
  return rosterHeroes().map(h => h.id);
}

function getHero(id) {
  _load();
  return _heroes[String(id)] || null;
}

function heroName(id) {
  const h = getHero(id);
  return h ? h.localized_name : `Hero #${id}`;
}

// The 4 non-talent, non-facet ability icon slugs for a hero (used for the
// "ability silhouettes" Heroguessr hint). Skips hidden/talent/ally variants.
function heroAbilitySlugs(id) {
  _load();
  const h = getHero(id);
  if (!h) return [];
  const entry = _heroAbilities[h.name];
  if (!entry || !Array.isArray(entry.abilities)) return [];
  const out = [];
  for (const a of entry.abilities) {
    if (!a || a === 'generic_hidden') continue;
    if (a.endsWith('_ally')) continue; // e.g. antimage_counterspell_ally
    const meta = _abilities[a];
    if (!meta) continue;
    out.push(a);
    if (out.length >= 4) break;
  }
  return out;
}

// Level-by-level talent tree for a hero, resolved to display names.
// Returns [{ level: 10|15|20|25, options: ['+something', '+other'] }].
// dotaconstants talent `level` is 1..4 → game talent levels 10/15/20/25.
// Fallback for the handful of talents dotaconstants ships without a `dname`.
// Turns "special_bonus_unique_alchemist_5" into "Alchemist Talent" rather than
// surfacing a raw npc_ key to players.
function _humanizeTalent(key) {
  return 'Hidden talent';
}

// Heroes whose talent tree resolves to display names at every tier. The Talent
// guesser pulls only from this pool so a daily puzzle never shows a player a
// "Hidden talent" placeholder they can't reason about.
function talentReadyHeroIds() {
  _load();
  const out = [];
  for (const id of heroIds()) {
    const h = getHero(id);
    const entry = _heroAbilities[h.name];
    if (!entry || !Array.isArray(entry.talents) || entry.talents.length === 0) continue;
    const allResolved = entry.talents.every(
      t => t && t.name && _abilities[t.name] && _abilities[t.name].dname
    );
    if (allResolved) out.push(id);
  }
  return out;
}

function heroTalents(id) {
  _load();
  const h = getHero(id);
  if (!h) return [];
  const entry = _heroAbilities[h.name];
  if (!entry || !Array.isArray(entry.talents)) return [];
  const byLevel = new Map();
  for (const t of entry.talents) {
    if (!t || !t.name) continue;
    const lvl = [10, 15, 20, 25][(t.level || 1) - 1] || 10;
    let dname = (_abilities[t.name] && _abilities[t.name].dname) || _humanizeTalent(t.name);
    // Strip unresolved value templates like "{s:bonus_damage}" / "{x}" that
    // dotaconstants leaves in some talent dnames.
    dname = dname.replace(/\{[^}]*\}\s*/g, '').replace(/\s{2,}/g, ' ').trim();
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl).push(dname);
  }
  return [10, 15, 20, 25]
    .filter(l => byLevel.has(l))
    .map(level => ({ level, options: byLevel.get(level).slice(0, 2) }));
}

// Compact, leak-free hint set for Heroguessr. The hero name itself is never
// included; ability icons are referenced by slug (the API proxies them so the
// slug never reaches the client as a clue to the answer).
function heroHints(id) {
  const h = getHero(id);
  if (!h) return [];
  const name = h.localized_name;
  return [
    { key: 'attr', label: 'Primary attribute', value: ATTR_LABEL[h.primary_attr] || h.primary_attr },
    { key: 'attack', label: 'Attack type', value: h.attack_type || '—' },
    { key: 'roles', label: 'Roles', value: (h.roles || []).slice(0, 3).join(' · ') || '—' },
    { key: 'legs', label: 'Number of legs', value: String(h.legs == null ? '—' : h.legs) },
    { key: 'abilities', label: 'Ability icons', abilitySlugs: heroAbilitySlugs(id) },
    { key: 'letter', label: 'First letter', value: name ? name[0].toUpperCase() : '?' },
  ];
}

module.exports = {
  ATTR_LABEL,
  rosterHeroes,
  heroIds,
  getHero,
  heroName,
  heroImgUrl,
  abilityImgUrl,
  heroAbilitySlugs,
  heroTalents,
  talentReadyHeroIds,
  heroHints,
};
