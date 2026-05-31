// Mirror of src/profileCosmetics.js (server-side). MUST stay in sync — the
// server re-validates everything the UI submits, so a divergence just shows
// itself as a 400 from /api/me/profile.

export const FREE_TITLES = [
  '',
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

export const PREMIUM_TITLES = [
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

export const FREE_THEMES = [
  '#3b82f6',
  '#22c55e',
  '#ef4444',
  '#f59e0b',
  '#a855f7',
  '#14b8a6',
];

export const PREMIUM_THEMES = [
  '#f43f5e',
  '#eab308',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#000000',
];

// Profile frames — CSS-based, no external assets needed.
export const FREE_FRAMES = [
  'none',
  'silver',
];

export const PREMIUM_FRAMES = [
  'gold',
  'neon-blue',
  'cosmic',
  'fire',
];

// Task #318 — Founders-only frame. Granted automatically to anyone whose
// pro_subscriptions row has is_founder=true (i.e. legacy lifetime holders
// + new lifetime SKU buyers). Not purchasable individually.
export const FOUNDER_FRAMES = ['founder'];

export const ALL_FRAMES = [...FREE_FRAMES, ...PREMIUM_FRAMES, ...FOUNDER_FRAMES];

// Frame display metadata — labels and CSS styles applied to the profile card wrapper.
export const FRAME_META = {
  none:       { label: 'None',      style: {} },
  silver:     { label: 'Silver',    style: { outline: '2px solid #c0c0c0', outlineOffset: '2px' } },
  gold:       { label: 'Gold',      style: { outline: '2px solid #f59e0b', outlineOffset: '2px', boxShadow: '0 0 8px rgba(245,158,11,0.5)' } },
  'neon-blue':{ label: 'Neon Blue', style: { outline: '2px solid #06b6d4', outlineOffset: '2px', boxShadow: '0 0 12px rgba(6,182,212,0.6)' } },
  cosmic:     { label: 'Cosmic',    style: { outline: '2px solid #a855f7', outlineOffset: '2px', boxShadow: '0 0 12px rgba(168,85,247,0.55)' } },
  fire:       { label: 'Fire',      style: { outline: '2px solid #ef4444', outlineOffset: '2px', boxShadow: '0 0 10px rgba(239,68,68,0.5)' } },
  founder:    { label: 'Founder',   style: { outline: '3px double #c5a975', outlineOffset: '2px', boxShadow: '0 0 14px rgba(197,169,117,0.7), inset 0 0 8px rgba(245,158,11,0.35)' } },
};

export const BIO_MAX = 300;
export const PINNED_HERO_CAPTION_MAX = 80;
// Task #270 — share-card tagline override (replaces the auto stats line).
export const SHARE_CARD_TAGLINE_MAX = 40;

export function isPremiumTitle(t) { return PREMIUM_TITLES.includes(t); }
export function isPremiumTheme(t) { return PREMIUM_THEMES.includes(t); }
export function isPremiumFrame(f) { return PREMIUM_FRAMES.includes(f); }

// v6.52 / Task #195 — Magazine v3 layout themes (mirror of src/profileCosmetics.js).
// Court & Pitch is the free default; the rest are Pro-only paid cosmetics.
export const FREE_LAYOUT_THEMES = ['court-pitch'];
export const PREMIUM_LAYOUT_THEMES = ['newsprint', 'carbon', 'holo', 'heritage', 'broadcast'];
export const ALL_LAYOUT_THEMES = [...FREE_LAYOUT_THEMES, ...PREMIUM_LAYOUT_THEMES];
export const DEFAULT_LAYOUT_THEME = 'court-pitch';
export const LAYOUT_THEME_META = {
  'court-pitch': { label: 'Court & Pitch', sub: 'Ink-navy + brass · default' },
  'newsprint':   { label: 'Newsprint',     sub: 'Sepia broadsheet' },
  'carbon':      { label: 'Carbon',        sub: 'Pitch-black + amber' },
  'holo':        { label: 'Holo',          sub: 'Iridescent purple/cyan' },
  'heritage':    { label: 'Heritage',      sub: 'Warm cigar + gold' },
  'broadcast':   { label: 'Broadcast',     sub: 'Sport-channel orange' },
};
export function isPremiumLayoutTheme(t) { return PREMIUM_LAYOUT_THEMES.includes(t); }
export function isValidLayoutTheme(t) {
  if (t == null || t === '') return true;
  return ALL_LAYOUT_THEMES.includes(t);
}

// v6.62 / Task #206 — Voice Packs Pro SKU (mirror of src/profileCosmetics.js).
// All five packs are Pro-only paid cosmetics. There is NO free pack — the
// existing church-bell chime in useInhouseAlerts.js IS the free default.
export const FREE_VOICE_PACKS = [];
export const PREMIUM_VOICE_PACKS = ['captain', 'hype', 'calm', 'roast', 'cinematic'];
export const ALL_VOICE_PACKS = [...FREE_VOICE_PACKS, ...PREMIUM_VOICE_PACKS];
// v6.82 — trimmed in lock-step with web/src/lib/voicePack.js. Voice
// packs are now a lobby-alerts-only cosmetic; see the long-form
// rationale comment over the canonical export there. This duplicate
// has no current importers (all consumers pull from ../lib/voicePack)
// but is kept in sync so a future re-import doesn't bring back the
// pre-trim event list.
export const VOICE_PACK_EVENTS = [
  'match-start',
  'level-up',
  'achievement-unlock',
];
export const VOICE_PACK_META = {
  captain:   { label: 'Captain Calls',  sub: 'Authoritative team-caller barks' },
  hype:      { label: 'Hype Train',     sub: 'High-energy esports caster' },
  calm:      { label: 'Calm Coach',     sub: 'Measured, strategic tone' },
  roast:     { label: 'Trash Talk',     sub: 'Friendly smack-talk one-liners' },
  cinematic: { label: 'Cinematic Epic', sub: 'Movie-trailer voice-over' },
};
export function isPremiumVoicePack(p) { return PREMIUM_VOICE_PACKS.includes(p); }
export function isValidVoicePack(p) {
  if (p == null || p === '') return true;
  return ALL_VOICE_PACKS.includes(p);
}

// v6.63 / Task #207 — Cover FX (Pro). Six animated effects mirror the
// server-side catalogue in src/profileCosmetics.js. Stored as a JSONB array
// on player_profiles.cover_fx; settings UI calls validateCoverFx() to
// canonicalise the array before saving.
export const COVER_FX_IDS = ['shimmer', 'kenburns', 'parallax', 'particle', 'vignette-pulse', 'streak-glow'];
export const COVER_FX_META = {
  shimmer:          { label: 'Shimmer sweep',     sub: 'Slow gold light pass over the cover',          motion: true  },
  kenburns:         { label: 'Ken Burns',         sub: 'Subtle zoom + drift on the hero backdrop',     motion: true  },
  parallax:         { label: 'Parallax depth',    sub: 'Background layer drifts on scroll',            motion: true  },
  particle:         { label: 'Particle drift',    sub: 'Soft amber motes float upward',                motion: true  },
  'vignette-pulse': { label: 'Vignette pulse',    sub: 'Edge vignette breathes around the cover',      motion: true  },
  'streak-glow':    { label: 'Streak glow',       sub: 'Accent halo around the streak / flair pills',  motion: false },
};
export function isValidCoverFxId(id) { return COVER_FX_IDS.includes(id); }
export function validateCoverFx(raw) {
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

// v6.63 / Task #207 — Founders Pass entitlement SKU id used by the shop
// and the cover ring renderer. Mirror of src/profileCosmetics.js.
export const FOUNDERS_RING_SKU = 'founders_pass_ring';

// Task #314 / v7.34 — Founders Ring catalog (mirror of src/profileCosmetics.js).
// 11 designs; `inscribed` is bundled with the Founders Pack, the other 10
// are individually-purchasable shop SKUs tiered as static or animated.
export const FOUNDER_RING_SLUGS = [
  'inscribed', 'classic', 'laurel', 'beveled',
  'phoenix',   'twin',    'astrolabe', 'eclipse',
  'forge',     'storm',   'starmap',
];
export const FOUNDER_RING_TIER = {
  inscribed: 'bundled',
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
export const FOUNDER_RING_LABEL = {
  inscribed: 'Inscribed',  classic: 'Classic Brass', laurel: 'Laurel Wreath',
  beveled:   'Beveled Edge', phoenix: 'Phoenix',     twin:   'Twin Halo',
  astrolabe: 'Astrolabe',  eclipse: 'Eclipse',       forge:  'Forge',
  storm:     'Storm',       starmap: 'Constellation',
};
export const FOUNDER_RING_USD_CENTS = { static: 499, animated: 799 };
export const FOUNDER_RING_COIN_PRICE = { static: 1200, animated: 2000 };
export function founderRingSku(slug) {
  if (slug === 'inscribed') return FOUNDERS_RING_SKU;
  return `founder_ring:${slug}`;
}
export function isValidFounderRingSlug(slug) {
  return typeof slug === 'string' && FOUNDER_RING_SLUGS.includes(slug);
}
export function isPurchasableFounderRingSlug(slug) {
  return isValidFounderRingSlug(slug) && FOUNDER_RING_TIER[slug] !== 'bundled';
}

export const DEFAULT_THEME = FREE_THEMES[0];
export const DEFAULT_FRAME = 'none';

// ---------- v5.81 extras (mockup-graduated knobs) ----------
export const HERO_BORDER_COLORS = [
  { value: '',        label: 'None' },
  { value: '#c5a975', label: 'Brass' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#22c55e', label: 'Radiant' },
  { value: '#ef4444', label: 'Dire' },
  { value: '#a855f7', label: 'Royal Purple' },
  { value: '#3b82f6', label: 'Steel Blue' },
  { value: '#f5efe2', label: 'Parchment' },
];
export const FREE_FLAIRS = [
  '', 'Inhouse Regular', 'Hard Carry', 'Mid Threat', 'Off-Lane Bruiser',
  'Roaming Support', 'Captain Material', 'Late Night Grinder',
];
export const PREMIUM_FLAIRS = [
  'GOAT', 'Mid Lord', 'Hook Wizard', 'Vision King', 'Comeback King',
  'First Blood King', 'MVP Magnet', 'Server MVP',
];
export const SOCIAL_URL_MAX = 200;
export function isPremiumFlair(f) { return PREMIUM_FLAIRS.includes(f); }

// Default extras shape — used when the API returns null/undefined.
export const DEFAULT_EXTRAS = {
  pinned_hero_border: null,
  pinned_achievement_id: null,
  flair_unlocked: false,
  flair_override: null,
  show_top_heroes: true,
  show_streak: true,
  frame_animated: false,
  bg_pattern: false,
  social_twitch: null,
  social_youtube: null,
  social_steam: null,
  // Task #259 — null = use pinned → most-played fallback;
  // 'most_played' = force most-played; or a positive integer hero id.
  share_card_hero_id: null,
  // Task #270 — optional tagline override (≤40 chars) shown in place of the
  // auto MMR / W-L stats line, and a toggle for the MMR pill.
  share_card_tagline: null,
  share_card_show_mmr: true,
  // Task #447 — public embeddable stat cards (iframe + PNG) opt-out.
  // Default true so existing players are opted-in; flip false on
  // /settings/profile to make `/embed/player/:id` + `/og/player/:id.png`
  // return a generic "embed disabled" placeholder.
  embed_enabled: true,
  // Task #445 — Live pick advisor opt-in. Off by default so only players
  // who explicitly want hero suggestions during inhouse draft see them.
  pick_advisor_optin: false,
};

// ---------------------------------------------------------------------------
// Task #664 — Lootbox cosmetic render metadata (full edition only).
// RENDER-ONLY. These maps drive how equipped lootbox cosmetics look in the UI.
// They intentionally have NO server-side mirror: equip requests are validated
// against the lootbox catalog (src/monetization/lootbox/catalog.js) + actual
// ownership, never against this file, so there is no /me/profile divergence to
// keep in sync. CSS-only (no external assets), static (no motion) to respect
// the reduced-motion / a11y house rules.
// ---------------------------------------------------------------------------
export const LOOTBOX_AVATAR_RINGS = {
  'brass-pulse':  { label: 'Brass Pulse',  boxShadow: '0 0 0 3px #c5a975, 0 0 12px rgba(197,169,117,.55)' },
  'radiant':      { label: 'Radiant',      boxShadow: '0 0 0 3px #22c55e, 0 0 12px rgba(34,197,94,.5)' },
  'dire':         { label: 'Dire',         boxShadow: '0 0 0 3px #ef4444, 0 0 12px rgba(239,68,68,.5)' },
  'frost':        { label: 'Frost Halo',   boxShadow: '0 0 0 3px #67e8f9, 0 0 14px rgba(103,232,249,.6)' },
  'ember':        { label: 'Ember Halo',   boxShadow: '0 0 0 3px #f97316, 0 0 16px rgba(249,115,22,.7)' },
  'prismatic':    { label: 'Prismatic Halo', boxShadow: '0 0 0 3px #a855f7, 0 0 18px rgba(168,85,247,.8)' },
  'cup-champion': { label: 'Cup Champion', boxShadow: '0 0 0 3px #f59e0b, 0 0 18px rgba(245,158,11,.8)' },
};
export function avatarRingStyle(value) {
  const m = LOOTBOX_AVATAR_RINGS[value];
  return m ? { boxShadow: m.boxShadow } : null;
}

export const LOOTBOX_BANNERS = {
  parchment:  { label: 'Parchment', background: 'linear-gradient(135deg,#f5efe2,#e7dcc3)' },
  court:      { label: 'Court',     background: 'linear-gradient(135deg,#0d1424,#1b2a4a)' },
  pitch:      { label: 'Pitch',     background: 'linear-gradient(135deg,#0b3d2e,#137a52)' },
  nightfall:  { label: 'Nightfall', background: 'linear-gradient(135deg,#0d1424,#3b1d5e)' },
  aurora:     { label: 'Aurora',    background: 'linear-gradient(120deg,#22c55e,#06b6d4,#a855f7)' },
  galaxy:     { label: 'Galaxy',    background: 'radial-gradient(circle at 30% 30%,#3b1d5e,#0d1424 70%)' },
  'cup-2026': { label: 'OCE Cup 2026', background: 'linear-gradient(135deg,#c5a975,#f59e0b)' },
};
export function bannerStyle(value) {
  const m = LOOTBOX_BANNERS[value];
  return m ? { background: m.background } : null;
}

const _TEXT_GRAD = (grad) => ({
  background: grad, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
});
export const LOOTBOX_NAMEPLATES = {
  shine:      { label: 'Shine',   style: { textShadow: '0 0 8px rgba(255,255,255,.5)' } },
  sparkle:    { label: 'Sparkle', style: { textShadow: '0 0 10px rgba(245,158,11,.6)' } },
  flame:      { label: 'Flame Text', style: _TEXT_GRAD('linear-gradient(0deg,#f97316,#fbbf24)') },
  rainbow:    { label: 'Rainbow Wave', style: _TEXT_GRAD('linear-gradient(90deg,#ef4444,#f59e0b,#22c55e,#06b6d4,#a855f7)') },
  'cup-gold': { label: 'Cup Gold Glow', style: { ..._TEXT_GRAD('linear-gradient(90deg,#c5a975,#fbbf24)'), textShadow: '0 0 12px rgba(245,158,11,.4)' } },
};
export function nameplateStyle(value) {
  const m = LOOTBOX_NAMEPLATES[value];
  return m ? m.style : null;
}

export const RECAP_SKINS = {
  classic:    { label: 'Classic Recap', accent: '#c5a975', bg: '#0d1424' },
  noir:       { label: 'Noir Recap',    accent: '#9ca3af', bg: '#000000' },
  gold:       { label: 'Gold Recap',    accent: '#f59e0b', bg: '#1a1408' },
  holo:       { label: 'Holo Recap',    accent: '#a855f7', bg: '#160d24' },
  'cup-2026': { label: 'OCE Cup 2026 Recap', accent: '#f59e0b', bg: '#0d1424' },
};
export function recapSkinSwatch(value) {
  const m = RECAP_SKINS[value];
  return m ? { background: `linear-gradient(135deg, ${m.bg}, ${m.accent})` } : null;
}

export const RARITY_COLORS = {
  common: '#9ca3af', rare: '#3b82f6', epic: '#a855f7', legendary: '#f59e0b',
};
