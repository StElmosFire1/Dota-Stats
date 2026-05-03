// Shared cosmetics catalogue for profile customization (`profile_customization`
// feature). Used by the server to validate POST /api/me/profile inputs and to
// reject premium values from non-Pro players. The web client imports a parallel
// catalogue from web/src/profileCosmetics.js — the two MUST stay in sync.

const FREE_TITLES = [
  '',                     // no title
  'Inhouse Regular',
  'Captain',
  'Stack Builder',
  'Replay Reviewer',
  'Pos 1 Enjoyer',
  'Pos 2 Enjoyer',
  'Pos 3 Enjoyer',
  'Pos 4 Enjoyer',
  'Pos 5 Enjoyer',
  'Late Night Grinder',
];

const PREMIUM_TITLES = [
  'Inhouse Legend',
  'The Drafter',
  'Hook Wizard',
  'First Blood King',
  'MVP Magnet',
  'Tower Tickler',
  'Comeback King',
  'Server MVP',
  'Pro Tier Founder',
];

// Tailwind-ish accents — kept short so they validate cheaply.
const FREE_THEMES = [
  '#3b82f6', // blue (default)
  '#22c55e', // green
  '#ef4444', // red
  '#f59e0b', // amber
  '#a855f7', // purple
  '#14b8a6', // teal
];

const PREMIUM_THEMES = [
  '#f43f5e', // rose
  '#eab308', // gold
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
  '#000000', // void black
];

// Profile frames — CSS-based, no external assets.
// 'none' = no frame (default). Free frames are available to all players.
// Premium frames require Pro membership.
const FREE_FRAMES = [
  'none',
  'silver',
];

const PREMIUM_FRAMES = [
  'gold',
  'neon-blue',
  'cosmic',
  'fire',
];

const ALL_TITLES = [...FREE_TITLES, ...PREMIUM_TITLES];
const ALL_THEMES = [...FREE_THEMES, ...PREMIUM_THEMES];
const ALL_FRAMES = [...FREE_FRAMES, ...PREMIUM_FRAMES];

function isPremiumTitle(title) {
  return PREMIUM_TITLES.includes(title);
}
function isPremiumTheme(theme) {
  return PREMIUM_THEMES.includes(theme);
}
function isPremiumFrame(frame) {
  return PREMIUM_FRAMES.includes(frame);
}
function isValidTitle(title) {
  if (title == null || title === '') return true;
  return ALL_TITLES.includes(title);
}
function isValidTheme(theme) {
  if (theme == null || theme === '') return true;
  return ALL_THEMES.includes(theme);
}
function isValidFrame(frame) {
  if (frame == null || frame === '' || frame === 'none') return true;
  return ALL_FRAMES.includes(frame);
}

const BIO_MAX = 300;
const PINNED_HERO_CAPTION_MAX = 80;

module.exports = {
  FREE_TITLES,
  PREMIUM_TITLES,
  FREE_THEMES,
  PREMIUM_THEMES,
  FREE_FRAMES,
  PREMIUM_FRAMES,
  ALL_TITLES,
  ALL_THEMES,
  ALL_FRAMES,
  isPremiumTitle,
  isPremiumTheme,
  isPremiumFrame,
  isValidTitle,
  isValidTheme,
  isValidFrame,
  BIO_MAX,
  PINNED_HERO_CAPTION_MAX,
};
