// Task #541 — Voiceline daily game data + asset resolution.
//
// Each clip is a short (~1-3s) segment of the hero's REAL in-game Dota 2 voice
// line, sourced from public community wikis and committed under
// `src/games/voice-lines/<slug>.mp3` (see scripts/fetch-voice-lines.js). Per the
// owner's decision (Task #665) we serve authentic Valve hero VO — accepting the
// copyright tradeoff — in place of the earlier licensing-clean TTS clips. Clips
// are served only through the HMAC audio proxy in routes.js, so the slug (and
// therefore the answer) never reaches the client. The line *text* is never sent
// either; the player guesses from the audio alone.

const fs = require('fs');
const path = require('path');

const CLIP_DIR = path.join(__dirname, 'voice-lines');

// hero_id → { slug, line }. `slug` doubles as the on-disk filename and the
// opaque token payload, and MUST match the canonical hero slug used elsewhere
// (HERO_ID_TO_SLUG in web/src/heroNames.js). `line` is the hero's iconic
// catchphrase the clip is matched against; clips are sourced by
// scripts/fetch-voice-lines.js. voiceReadyHeroIds() only surfaces heroes
// whose .mp3 actually exists on disk, so partial asset sets degrade gracefully.
const VOICE_LINES = [
  { heroId: 1,   slug: 'antimage',           line: 'The hand is faster than the eye.' },
  { heroId: 2,   slug: 'axe',                line: 'Axe is here!' },
  { heroId: 3,   slug: 'bane',               line: 'Sweet dreams.' },
  { heroId: 4,   slug: 'bloodseeker',        line: 'Thirst for blood!' },
  { heroId: 5,   slug: 'crystal_maiden',     line: 'Feel the cold embrace of death.' },
  { heroId: 6,   slug: 'drow_ranger',        line: 'Silence is golden.' },
  { heroId: 7,   slug: 'earthshaker',        line: 'The earth shall shake!' },
  { heroId: 8,   slug: 'juggernaut',         line: 'There can be only one!' },
  { heroId: 9,   slug: 'mirana',             line: 'Starstorm!' },
  { heroId: 10,  slug: 'morphling',          line: 'Adapt, or die.' },
  { heroId: 11,  slug: 'nevermore',          line: 'Your soul is mine.' },
  { heroId: 12,  slug: 'phantom_lancer',     line: 'Many hands make light work.' },
  { heroId: 13,  slug: 'puck',               line: 'Catch me if you can!' },
  { heroId: 14,  slug: 'pudge',              line: 'Fresh meat!' },
  { heroId: 15,  slug: 'razor',              line: 'Feel the static!' },
  { heroId: 16,  slug: 'sand_king',          line: 'Sandstorm!' },
  { heroId: 17,  slug: 'storm_spirit',       line: 'Lightning never strikes twice.' },
  { heroId: 18,  slug: 'sven',               line: 'For honor, and glory!' },
  { heroId: 19,  slug: 'tiny',               line: 'Time to grow!' },
  { heroId: 20,  slug: 'vengefulspirit',     line: 'Vengeance will be mine!' },
  { heroId: 21,  slug: 'windrunner',         line: 'Right on target.' },
  { heroId: 22,  slug: 'zuus',               line: "Feel the thunder god's wrath!" },
  { heroId: 23,  slug: 'kunkka',             line: 'Boots on the ground!' },
  { heroId: 25,  slug: 'lina',               line: 'Burn, baby, burn!' },
  { heroId: 26,  slug: 'lion',               line: 'I will have your soul!' },
  { heroId: 27,  slug: 'shadow_shaman',      line: 'Time for a shackle!' },
  { heroId: 28,  slug: 'slardar',            line: 'From the depths!' },
  { heroId: 29,  slug: 'tidehunter',         line: 'Ravage!' },
  { heroId: 30,  slug: 'witch_doctor',       line: 'Death ward!' },
  { heroId: 31,  slug: 'lich',               line: 'Winter has come.' },
  { heroId: 32,  slug: 'riki',               line: 'You never saw it coming.' },
  { heroId: 33,  slug: 'enigma',             line: 'The void consumes all.' },
  { heroId: 34,  slug: 'tinker',             line: 'Rearm!' },
  { heroId: 35,  slug: 'sniper',             line: 'Boom! Headshot!' },
  { heroId: 36,  slug: 'necrolyte',          line: 'Death is only the beginning.' },
  { heroId: 37,  slug: 'warlock',            line: 'Chaos reigns!' },
  { heroId: 38,  slug: 'beastmaster',        line: 'Unleash the beasts!' },
  { heroId: 39,  slug: 'queenofpain',        line: 'Pain is pleasure.' },
  { heroId: 40,  slug: 'venomancer',         line: 'Drown in venom!' },
  { heroId: 41,  slug: 'faceless_void',      line: 'Time is on my side.' },
  { heroId: 42,  slug: 'skeleton_king',      line: 'The dead do not rest.' },
  { heroId: 43,  slug: 'death_prophet',      line: 'The dead shall rise!' },
  { heroId: 44,  slug: 'phantom_assassin',   line: 'Death comes swiftly.' },
  { heroId: 45,  slug: 'pugna',              line: 'Decay!' },
  { heroId: 46,  slug: 'templar_assassin',   line: 'The Temple sends its regards.' },
  { heroId: 47,  slug: 'viper',              line: 'Slither, and strike.' },
  { heroId: 48,  slug: 'luna',               line: 'Lucent beam!' },
  { heroId: 49,  slug: 'dragon_knight',      line: 'Dragon form!' },
  { heroId: 50,  slug: 'dazzle',             line: 'Shadow wave!' },
  { heroId: 51,  slug: 'rattletrap',         line: 'Tick tock!' },
  { heroId: 52,  slug: 'leshrac',            line: 'Embrace the storm!' },
  { heroId: 53,  slug: 'furion',             line: 'Nature calls.' },
  { heroId: 54,  slug: 'life_stealer',       line: 'Feast on their flesh!' },
  { heroId: 55,  slug: 'dark_seer',          line: 'Surge ahead!' },
  { heroId: 56,  slug: 'clinkz',             line: 'Burning arrows!' },
  { heroId: 57,  slug: 'omniknight',         line: 'Faith is my shield.' },
  { heroId: 58,  slug: 'enchantress',        line: 'The forest protects me.' },
  { heroId: 59,  slug: 'huskar',             line: 'Pain only makes me stronger.' },
  { heroId: 60,  slug: 'night_stalker',      line: 'Night falls!' },
  { heroId: 61,  slug: 'broodmother',        line: 'The web tightens.' },
  { heroId: 62,  slug: 'bounty_hunter',      line: "There's a price on your head." },
  { heroId: 63,  slug: 'weaver',             line: 'Weaving through time.' },
  { heroId: 64,  slug: 'jakiro',             line: 'Fire and ice!' },
  { heroId: 65,  slug: 'batrider',           line: 'Light them up!' },
  { heroId: 66,  slug: 'chen',               line: 'By the holy light!' },
  { heroId: 67,  slug: 'spectre',            line: 'Haunt.' },
  { heroId: 68,  slug: 'ancient_apparition', line: 'Cold has a sound.' },
  { heroId: 69,  slug: 'doom_bringer',       line: 'Doom! There is no escape.' },
  { heroId: 70,  slug: 'ursa',               line: 'Feel my fury!' },
  { heroId: 71,  slug: 'spirit_breaker',     line: 'Charge of darkness!' },
  { heroId: 72,  slug: 'gyrocopter',         line: 'Bombs away!' },
  { heroId: 73,  slug: 'alchemist',          line: 'Greed is good!' },
  { heroId: 74,  slug: 'invoker',            line: 'I am all the elements.' },
  { heroId: 75,  slug: 'silencer',           line: 'Silence!' },
  { heroId: 76,  slug: 'obsidian_destroyer', line: "Sanity's eclipse!" },
  { heroId: 77,  slug: 'lycan',              line: 'The wolves are hungry.' },
  { heroId: 78,  slug: 'brewmaster',         line: 'Drink up!' },
  { heroId: 79,  slug: 'shadow_demon',       line: 'Embrace the shadows.' },
  { heroId: 80,  slug: 'lone_druid',         line: 'The bear answers.' },
  { heroId: 81,  slug: 'chaos_knight',       line: 'Chaos!' },
  { heroId: 82,  slug: 'meepo',              line: 'Meepo, Meepo, Meepo!' },
  { heroId: 83,  slug: 'treant',             line: 'Nature endures.' },
  { heroId: 84,  slug: 'ogre_magi',          line: 'Multicast!' },
  { heroId: 85,  slug: 'undying',            line: 'Death cannot save you.' },
  { heroId: 86,  slug: 'rubick',             line: 'Magic is mine to command.' },
  { heroId: 87,  slug: 'disruptor',          line: 'Static storm!' },
  { heroId: 88,  slug: 'nyx_assassin',       line: 'From the shadows.' },
  { heroId: 89,  slug: 'naga_siren',         line: 'Hear my song.' },
  { heroId: 90,  slug: 'keeper_of_the_light', line: 'Let there be light!' },
  { heroId: 91,  slug: 'wisp',               line: 'Together, we are strong.' },
  { heroId: 92,  slug: 'visage',             line: 'The grave calls.' },
  { heroId: 93,  slug: 'slark',              line: 'Pick on someone your own size.' },
  { heroId: 94,  slug: 'medusa',             line: 'Look into my eyes.' },
  { heroId: 95,  slug: 'troll_warlord',      line: 'Time to rampage!' },
  { heroId: 96,  slug: 'centaur',            line: 'Stampede!' },
  { heroId: 97,  slug: 'magnataur',          line: 'Reverse polarity!' },
  { heroId: 98,  slug: 'shredder',           line: 'Timber!' },
  { heroId: 99,  slug: 'bristleback',        line: 'Snot rocket!' },
  { heroId: 100, slug: 'tusk',               line: 'Snowball time!' },
  { heroId: 101, slug: 'skywrath_mage',      line: 'Mystic flare!' },
  { heroId: 102, slug: 'abaddon',            line: 'Death is my ally.' },
  { heroId: 103, slug: 'elder_titan',        line: 'The earth trembles.' },
  { heroId: 104, slug: 'legion_commander',   line: 'Let us duel, to the death!' },
  { heroId: 105, slug: 'techies',            line: 'Boom goes the dynamite!' },
  { heroId: 106, slug: 'ember_spirit',       line: 'Burning embers!' },
  { heroId: 107, slug: 'earth_spirit',       line: 'Roll out!' },
  { heroId: 108, slug: 'abyssal_underlord',  line: 'From the abyss!' },
  { heroId: 109, slug: 'terrorblade',        line: 'Reflection!' },
  { heroId: 110, slug: 'phoenix',            line: 'Rise from the ashes!' },
  { heroId: 111, slug: 'oracle',             line: 'I see your fate.' },
  { heroId: 112, slug: 'winter_wyvern',      line: "Winter's curse!" },
  { heroId: 113, slug: 'arc_warden',         line: 'Double trouble.' },
  { heroId: 114, slug: 'monkey_king',        line: 'Monkey business!' },
  { heroId: 119, slug: 'dark_willow',        line: 'Into the bramble!' },
  { heroId: 120, slug: 'pangolier',          line: 'Roll with it!' },
  { heroId: 121, slug: 'grimstroke',         line: 'Ink swell!' },
  { heroId: 123, slug: 'hoodwink',           line: 'Bushwhack!' },
  { heroId: 126, slug: 'void_spirit',        line: 'Step through the void.' },
  { heroId: 128, slug: 'snapfire',           line: 'Hot cookies coming through!' },
  { heroId: 129, slug: 'mars',               line: 'For the arena!' },
  { heroId: 131, slug: 'ringmaster',         line: 'Step right up!' },
  { heroId: 135, slug: 'dawnbreaker',        line: 'Break of dawn!' },
  { heroId: 137, slug: 'primal_beast',       line: 'Trample!' },
  { heroId: 138, slug: 'muerta',             line: 'Death calls.' },
  { heroId: 145, slug: 'kez',                line: 'Two blades, one path.' },
];

const _bySlug = new Map(VOICE_LINES.map(v => [v.slug, v]));
const _byHero = new Map(VOICE_LINES.map(v => [v.heroId, v]));

// Validates a slug carried in a proxy token and resolves it to an on-disk clip
// path. Returns null for unknown slugs or path-traversal attempts so the proxy
// can 404 without ever touching the filesystem outside CLIP_DIR.
function clipPathForSlug(slug) {
  if (!_bySlug.has(slug)) return null;
  const file = path.join(CLIP_DIR, `${slug}.mp3`);
  const resolved = path.resolve(file);
  if (!resolved.startsWith(path.resolve(CLIP_DIR) + path.sep)) return null;
  return resolved;
}

function slugForHero(heroId) {
  const e = _byHero.get(Number(heroId));
  return e ? e.slug : null;
}

// Hero ids that actually have a clip file on disk — the daily/endless answer
// pool. Computed once; missing files (e.g. a half-deployed asset set) are
// silently excluded so the game never points at a 404 clip.
let _ready = null;
function voiceReadyHeroIds() {
  if (_ready) return _ready;
  _ready = VOICE_LINES
    .filter(v => {
      try { return fs.existsSync(path.join(CLIP_DIR, `${v.slug}.mp3`)); }
      catch (_) { return false; }
    })
    .map(v => v.heroId);
  return _ready;
}

module.exports = {
  CLIP_DIR,
  VOICE_LINES,
  clipPathForSlug,
  slugForHero,
  voiceReadyHeroIds,
};
