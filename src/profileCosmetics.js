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

// Task #318 — Founders-only frame. Granted automatically when
// pro_subscriptions.is_founder = TRUE; not individually purchasable.
const FOUNDER_FRAMES = ['founder'];

// v6.52 / Task #195 — Magazine v3 layout themes. Court & Pitch is the default
// (free) ink-navy/brass look that ships with the v3 cover graduation. The
// other five are paid cosmetic-shop themes gated behind the existing Pro
// flag, mirroring the PREMIUM_THEMES / PREMIUM_FRAMES pattern. Stored in
// player_profiles.profile_layout_theme; null/empty means "court-pitch".
const FREE_LAYOUT_THEMES = ['court-pitch'];
const PREMIUM_LAYOUT_THEMES = ['newsprint', 'carbon', 'holo', 'heritage', 'broadcast'];
const ALL_LAYOUT_THEMES = [...FREE_LAYOUT_THEMES, ...PREMIUM_LAYOUT_THEMES];

// v6.62 / Task #206 — Voice Packs Pro SKU. All five packs are Pro-only paid
// cosmetics; there is no free pack (the existing church-bell chime in
// useInhouseAlerts.js IS the free default). Stored in
// player_profiles.selected_voice_pack; null/empty means "default bell".
const FREE_VOICE_PACKS = [];
const PREMIUM_VOICE_PACKS = ['captain', 'hype', 'calm', 'roast', 'cinematic'];
const ALL_VOICE_PACKS = [...FREE_VOICE_PACKS, ...PREMIUM_VOICE_PACKS];
// Event slot names matching files at web/public/voice-packs/<pack>/<event>.mp3.
const VOICE_PACK_EVENTS = [
  'match-start',
  'first-blood',
  'win',
  'loss',
  'level-up',
  'achievement-unlock',
];

const ALL_TITLES = [...FREE_TITLES, ...PREMIUM_TITLES];
const ALL_THEMES = [...FREE_THEMES, ...PREMIUM_THEMES];
const ALL_FRAMES = [...FREE_FRAMES, ...PREMIUM_FRAMES, ...FOUNDER_FRAMES];

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

function isPremiumVoicePack(p) {
  return PREMIUM_VOICE_PACKS.includes(p);
}
function isValidVoicePack(p) {
  if (p == null || p === '') return true;
  return ALL_VOICE_PACKS.includes(p);
}

// v6.63 / Task #207 — Cover FX (Pro). Six animated effects applied as a
// layer over the Magazine v3 cover via data-fx-* attributes. Stored as a
// JSONB array on player_profiles.cover_fx; validateCoverFx() canonicalises
// the input (dedupes, drops unknowns, caps at COVER_FX_IDS.length).
const COVER_FX_IDS = ['shimmer', 'kenburns', 'parallax', 'particle', 'vignette-pulse', 'streak-glow'];
const COVER_FX_META = {
  shimmer:          { label: 'Shimmer sweep',     sub: 'Slow gold light pass over the cover',          motion: true  },
  kenburns:         { label: 'Ken Burns',         sub: 'Subtle zoom + drift on the hero backdrop',     motion: true  },
  parallax:         { label: 'Parallax depth',    sub: 'Background layer drifts on scroll',            motion: true  },
  particle:         { label: 'Particle drift',    sub: 'Soft amber motes float upward',                motion: true  },
  'vignette-pulse': { label: 'Vignette pulse',    sub: 'Edge vignette breathes around the cover',      motion: true  },
  'streak-glow':    { label: 'Streak glow',       sub: 'Accent halo around the streak / flair pills',  motion: false },
};
// One-time entitlement SKU for the Founders Pass cover ring. Used as the
// `sku` value on the `entitlements` table.
const FOUNDERS_RING_SKU = 'founders_pass_ring';

// Task #314 / v7.34 — Founders Ring catalog. 11 designs total: `inscribed`
// is bundled with the Founders Pack (granted via FOUNDERS_RING_SKU); the
// other 10 are individually-purchasable shop SKUs. Static-tier rings
// (no animation) are $4.99 / 1200🪙; animated rings are $7.99 / 2000🪙.
// Coin prices stay deliberately above the Stripe equivalent so the coin
// path remains the "alternative" route, not the cheap one.
const FOUNDER_RING_SLUGS = [
  'inscribed', 'classic', 'laurel', 'beveled',
  'phoenix',   'twin',    'astrolabe', 'eclipse',
  'forge',     'storm',   'starmap',
];
const FOUNDER_RING_TIER = {
  inscribed: 'bundled',  // not individually purchasable — comes with Founders Pack
  classic:   'static',
  laurel:    'static',
  beveled:   'animated',
  phoenix:   'animated',
  twin:      'animated',
  astrolabe: 'animated',
  eclipse:   'animated',
  forge:     'animated',
  storm:     'animated',
  starmap:   'animated',
};
const FOUNDER_RING_LABEL = {
  inscribed: 'Inscribed',  classic: 'Classic Brass', laurel: 'Laurel Wreath',
  beveled:   'Beveled Edge', phoenix: 'Phoenix',     twin:   'Twin Halo',
  astrolabe: 'Astrolabe',  eclipse: 'Eclipse',       forge:  'Forge',
  storm:     'Storm',       starmap: 'Constellation',
};
const FOUNDER_RING_USD_CENTS = { static: 499, animated: 799 };
const FOUNDER_RING_COIN_PRICE = { static: 1200, animated: 2000 };
// Convert slug → server-side SKU used on the entitlements/coin_owned_cosmetics
// tables. Inscribed reuses the legacy FOUNDERS_RING_SKU; everything else gets
// a `founder_ring:<slug>` namespaced SKU.
function founderRingSku(slug) {
  if (slug === 'inscribed') return FOUNDERS_RING_SKU;
  return `founder_ring:${slug}`;
}
function isValidFounderRingSlug(slug) {
  return typeof slug === 'string' && FOUNDER_RING_SLUGS.includes(slug);
}
function isPurchasableFounderRingSlug(slug) {
  return isValidFounderRingSlug(slug) && FOUNDER_RING_TIER[slug] !== 'bundled';
}
function isValidCoverFxId(id) { return COVER_FX_IDS.includes(id); }
// Returns a canonical array (deduped, allow-listed). Accepts any input
// shape and never throws — empty array on garbage input. Cap at
// COVER_FX_IDS.length (6) so a malicious client can't flood the column.
function validateCoverFx(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    if (!isValidCoverFxId(v)) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= COVER_FX_IDS.length) break;
  }
  return out;
}

function isPremiumFrame(frame) {
  return PREMIUM_FRAMES.includes(frame);
}
function isFounderFrame(frame) {
  return FOUNDER_FRAMES.includes(frame);
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
// Task #270 — share-card tagline override (replaces the auto stats line).
const SHARE_CARD_TAGLINE_MAX = 40;

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

// Canonical Twitch login for the "Live now" hub: lower-case [a-z0-9_], 3-25
// chars. Accepts a bare login or a full twitch.tv URL; anything else clears it.
function normalizeTwitchLogin(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/twitch\.tv\/([A-Za-z0-9_]+)/i);
  if (m) s = m[1];
  s = s.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (s.length < 3 || s.length > 25) return null;
  return s;
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
  // Task #259 — share_card_hero_id override for the OG unfurl card.
  // Accepted values: null (use the existing pinned → most-played fallback
  // chain), the string sentinel 'most_played' (force most-played even when
  // a pinned hero is set), or a positive integer hero id (force that hero).
  // Anything else is coerced to null so a malformed client save can't poison
  // the field. The route handler does no Pro-gating — every signed-in
  // player can override their own share-card hero.
  let shareCardHeroId = null;
  const rawShare = e.share_card_hero_id;
  if (rawShare === 'most_played') {
    shareCardHeroId = 'most_played';
  } else if (rawShare != null && rawShare !== '') {
    const n = parseInt(rawShare, 10);
    if (Number.isFinite(n) && n > 0 && n < 1000000) shareCardHeroId = n;
  }
  // Task #270 — share-card tagline override (≤40 chars after trim) and
  // show_mmr toggle. The OG card renderer prefers the tagline over the
  // auto MMR/W-L stats line when present; show_mmr=false hides the MMR
  // pill regardless. No Pro-gating — every signed-in player can use them.
  let shareCardTagline = null;
  if (e.share_card_tagline != null && e.share_card_tagline !== '') {
    const t = String(e.share_card_tagline).replace(/\s+/g, ' ').trim().slice(0, SHARE_CARD_TAGLINE_MAX);
    if (t) shareCardTagline = t;
  }
  const shareCardShowMmr = e.share_card_show_mmr == null ? true : !!e.share_card_show_mmr;
  // Task #447 — per-player toggle for the public embeddable stat cards
  // (`/embed/player/:steamId` + `/og/player/:steamId.png`). Defaults to
  // true so existing players opt in; setting it false makes the embed
  // routes return a 403 + a plain "embed disabled" placeholder.
  const embedEnabled = e.embed_enabled == null ? true : !!e.embed_enabled;
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
    share_card_hero_id: shareCardHeroId,
    share_card_tagline: shareCardTagline,
    share_card_show_mmr: shareCardShowMmr,
    embed_enabled: embedEnabled,
    // "Live now" hub — linked Twitch channel (canonical login or null). No
    // Pro-gating; every signed-in player can surface their own stream.
    twitch_login: normalizeTwitchLogin(e.twitch_login),
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
  FOUNDER_FRAMES,
  ALL_TITLES,
  ALL_THEMES,
  ALL_FRAMES,
  FREE_LAYOUT_THEMES,
  PREMIUM_LAYOUT_THEMES,
  ALL_LAYOUT_THEMES,
  FREE_VOICE_PACKS,
  PREMIUM_VOICE_PACKS,
  ALL_VOICE_PACKS,
  VOICE_PACK_EVENTS,
  isPremiumTitle,
  isPremiumTheme,
  isPremiumFrame,
  isFounderFrame,
  isPremiumLayoutTheme,
  isPremiumVoicePack,
  isValidTitle,
  isValidTheme,
  isValidFrame,
  isValidLayoutTheme,
  isValidVoicePack,
  // v6.63 / Task #207 — Cover FX
  COVER_FX_IDS,
  COVER_FX_META,
  isValidCoverFxId,
  validateCoverFx,
  FOUNDERS_RING_SKU,
  FOUNDER_RING_SLUGS,
  FOUNDER_RING_TIER,
  FOUNDER_RING_LABEL,
  FOUNDER_RING_USD_CENTS,
  FOUNDER_RING_COIN_PRICE,
  founderRingSku,
  isValidFounderRingSlug,
  isPurchasableFounderRingSlug,
  BIO_MAX,
  PINNED_HERO_CAPTION_MAX,
  SHARE_CARD_TAGLINE_MAX,
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
