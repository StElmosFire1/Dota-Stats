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

// v6.52 / Task #195 — Magazine v3 layout themes. Court & Pitch is the default
// (free) ink-navy/brass look that ships with the v3 cover graduation. The
// other five are paid cosmetic-shop themes gated behind the existing Pro
// flag, mirroring the PREMIUM_THEMES / PREMIUM_FRAMES pattern. Stored in
// player_profiles.profile_layout_theme; null/empty means "court-pitch".
const FREE_LAYOUT_THEMES = ['court-pitch'];
const PREMIUM_LAYOUT_THEMES = ['newsprint', 'carbon', 'holo', 'heritage', 'broadcast'];
const ALL_LAYOUT_THEMES = [...FREE_LAYOUT_THEMES, ...PREMIUM_LAYOUT_THEMES];

const ALL_TITLES = [...FREE_TITLES, ...PREMIUM_TITLES];
const ALL_THEMES = [...FREE_THEMES, ...PREMIUM_THEMES];
const ALL_FRAMES = [...FREE_FRAMES, ...PREMIUM_FRAMES];

function isPremiumTitle(title) {
  return PREMIUM_TITLES.includes(title);
}
function isPremiumTheme(theme) {
  return PREMIUM_THEMES.includes(theme);
}
function isPremiumLayoutTheme(t) {
  return PREMIUM_LAYOUT_THEMES.includes(t);
}

function isValidLayoutTheme(t) {
  if (t == null || t === '') return true;
  return ALL_LAYOUT_THEMES.includes(t);
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

// ---------- v5.81 extras (mockup-graduated knobs) ----------
// All extras live in player_profiles.extras (JSONB). Validated by
// validateExtras() below; the route handler does Pro-gating on the values
// flagged as PRO-only. See web/src/profileCosmetics.js for the UI mirror.

const HERO_BORDER_COLORS = [
  '', '#c5a975', '#f59e0b', '#22c55e', '#ef4444', '#a855f7', '#3b82f6', '#f5efe2',
];

// Catalogue of override flairs the player may pick. The "auto" flair is
// computed server-side from their stats and is always available.
const FREE_FLAIRS = [
  '', 'Inhouse Regular', 'Hard Carry', 'Mid Threat', 'Off-Lane Bruiser',
  'Roaming Support', 'Captain Material', 'Late Night Grinder',
];
const PREMIUM_FLAIRS = [
  'GOAT', 'Mid Lord', 'Hook Wizard', 'Vision King', 'Comeback King',
  'First Blood King', 'MVP Magnet', 'Server MVP',
];
const ALL_FLAIRS = [...FREE_FLAIRS, ...PREMIUM_FLAIRS];

const SOCIAL_URL_MAX = 200;
const SOCIAL_HOST_ALLOWLIST = {
  social_twitch: ['twitch.tv', 'www.twitch.tv'],
  social_youtube: ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com'],
  social_steam: ['steamcommunity.com', 'www.steamcommunity.com', 'steampowered.com'],
};

function isHttpsUrl(s) {
  if (typeof s !== 'string' || !s) return false;
  try { const u = new URL(s); return u.protocol === 'https:'; } catch { return false; }
}
function isAllowedSocialUrl(field, raw) {
  if (raw == null || raw === '') return true;
  if (typeof raw !== 'string' || raw.length > SOCIAL_URL_MAX) return false;
  if (!isHttpsUrl(raw)) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return (SOCIAL_HOST_ALLOWLIST[field] || []).includes(host);
  } catch { return false; }
}

function isValidHeroBorder(c) {
  if (c == null || c === '') return true;
  return HERO_BORDER_COLORS.includes(c);
}
function isValidFlair(f) {
  if (f == null || f === '') return true;
  return ALL_FLAIRS.includes(f);
}
function isPremiumFlair(f) { return PREMIUM_FLAIRS.includes(f); }

// Returns { ok: true, extras } or { ok: false, error }. The route handler
// checks Pro on flagged-premium values (frame_animated, bg_pattern,
// any premium flair, flair_unlocked itself).
function validateExtras(raw) {
  const e = (raw && typeof raw === 'object') ? raw : {};
  const out = {
    pinned_hero_border: e.pinned_hero_border == null || e.pinned_hero_border === '' ? null : String(e.pinned_hero_border),
    pinned_achievement_id: e.pinned_achievement_id == null || e.pinned_achievement_id === '' ? null : String(e.pinned_achievement_id).slice(0, 64),
    flair_unlocked: !!e.flair_unlocked,
    flair_override: e.flair_override == null || e.flair_override === '' ? null : String(e.flair_override),
    show_top_heroes: e.show_top_heroes == null ? true : !!e.show_top_heroes,
    show_streak:     e.show_streak     == null ? true : !!e.show_streak,
    frame_animated:  !!e.frame_animated,
    bg_pattern:      !!e.bg_pattern,
    social_twitch:  e.social_twitch  == null || e.social_twitch  === '' ? null : String(e.social_twitch),
    social_youtube: e.social_youtube == null || e.social_youtube === '' ? null : String(e.social_youtube),
    social_steam:   e.social_steam   == null || e.social_steam   === '' ? null : String(e.social_steam),
  };
  if (!isValidHeroBorder(out.pinned_hero_border)) return { ok: false, error: 'Unknown pinned-hero border colour' };
  if (!isValidFlair(out.flair_override)) return { ok: false, error: 'Unknown flair override' };
  for (const k of ['social_twitch', 'social_youtube', 'social_steam']) {
    if (!isAllowedSocialUrl(k, out[k])) {
      return { ok: false, error: `${k} must be an https URL on the official ${k.replace('social_', '')} domain (≤${SOCIAL_URL_MAX} chars)` };
    }
  }
  return { ok: true, extras: out };
}

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
  FREE_LAYOUT_THEMES,
  PREMIUM_LAYOUT_THEMES,
  ALL_LAYOUT_THEMES,
  isPremiumTitle,
  isPremiumTheme,
  isPremiumFrame,
  isPremiumLayoutTheme,
  isValidTitle,
  isValidTheme,
  isValidFrame,
  isValidLayoutTheme,
  BIO_MAX,
  PINNED_HERO_CAPTION_MAX,
  // v5.81 extras
  HERO_BORDER_COLORS,
  FREE_FLAIRS,
  PREMIUM_FLAIRS,
  ALL_FLAIRS,
  SOCIAL_URL_MAX,
  isPremiumFlair,
  isValidFlair,
  isValidHeroBorder,
  validateExtras,
};
