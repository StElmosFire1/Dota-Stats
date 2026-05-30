// Task #541 — Voiceline daily game data + asset resolution.
//
// We do NOT rehost Valve's copyrighted hero VO. Instead each clip is a short,
// self-generated text-to-speech rendition of a hero's iconic (un-copyrightable)
// catchphrase, committed under `src/games/voice-lines/<slug>.mp3` and served
// only through the HMAC audio proxy in routes.js — so the slug (and therefore
// the answer) never reaches the client. The line *text* is never sent either;
// the player guesses from the audio alone.

const fs = require('fs');
const path = require('path');

const CLIP_DIR = path.join(__dirname, 'voice-lines');

// hero_id → { slug, line }. `slug` doubles as the on-disk filename and the
// opaque token payload. Curated to talking heroes with a recognisable line.
const VOICE_LINES = [
  { heroId: 1,   slug: 'antimage',         line: 'The hand is faster than the eye.' },
  { heroId: 2,   slug: 'axe',              line: 'Axe is here!' },
  { heroId: 5,   slug: 'crystal_maiden',   line: 'Feel the cold embrace of death.' },
  { heroId: 7,   slug: 'earthshaker',      line: 'The earth shall shake!' },
  { heroId: 8,   slug: 'juggernaut',       line: 'There can be only one!' },
  { heroId: 14,  slug: 'pudge',            line: 'Fresh meat!' },
  { heroId: 18,  slug: 'sven',             line: 'For honor, and glory!' },
  { heroId: 22,  slug: 'zuus',             line: "Feel the thunder god's wrath!" },
  { heroId: 25,  slug: 'lina',             line: 'Burn, baby, burn!' },
  { heroId: 26,  slug: 'lion',             line: 'I will have your soul!' },
  { heroId: 29,  slug: 'tidehunter',       line: 'Ravage!' },
  { heroId: 30,  slug: 'witch_doctor',     line: 'Death ward!' },
  { heroId: 34,  slug: 'tinker',           line: 'Rearm!' },
  { heroId: 35,  slug: 'sniper',           line: 'Boom! Headshot!' },
  { heroId: 41,  slug: 'faceless_void',    line: 'Time is on my side.' },
  { heroId: 42,  slug: 'skeleton_king',    line: 'The dead do not rest.' },
  { heroId: 44,  slug: 'phantom_assassin', line: 'Death comes swiftly.' },
  { heroId: 54,  slug: 'life_stealer',     line: 'Feast on their flesh!' },
  { heroId: 69,  slug: 'doom_bringer',     line: 'Doom! There is no escape.' },
  { heroId: 74,  slug: 'invoker',          line: 'I am all the elements.' },
  { heroId: 82,  slug: 'meepo',            line: 'Meepo, Meepo, Meepo!' },
  { heroId: 93,  slug: 'slark',            line: 'Pick on someone your own size.' },
  { heroId: 99,  slug: 'bristleback',      line: 'Snot rocket!' },
  { heroId: 104, slug: 'legion_commander', line: 'Let us duel, to the death!' },
  { heroId: 105, slug: 'techies',          line: 'Boom goes the dynamite!' },
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
