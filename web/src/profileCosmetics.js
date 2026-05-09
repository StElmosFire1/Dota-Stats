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

export const ALL_FRAMES = [...FREE_FRAMES, ...PREMIUM_FRAMES];

// Frame display metadata — labels and CSS styles applied to the profile card wrapper.
export const FRAME_META = {
  none:       { label: 'None',      style: {} },
  silver:     { label: 'Silver',    style: { outline: '2px solid #c0c0c0', outlineOffset: '2px' } },
  gold:       { label: 'Gold',      style: { outline: '2px solid #f59e0b', outlineOffset: '2px', boxShadow: '0 0 8px rgba(245,158,11,0.5)' } },
  'neon-blue':{ label: 'Neon Blue', style: { outline: '2px solid #06b6d4', outlineOffset: '2px', boxShadow: '0 0 12px rgba(6,182,212,0.6)' } },
  cosmic:     { label: 'Cosmic',    style: { outline: '2px solid #a855f7', outlineOffset: '2px', boxShadow: '0 0 12px rgba(168,85,247,0.55)' } },
  fire:       { label: 'Fire',      style: { outline: '2px solid #ef4444', outlineOffset: '2px', boxShadow: '0 0 10px rgba(239,68,68,0.5)' } },
};

export const BIO_MAX = 300;
export const PINNED_HERO_CAPTION_MAX = 80;

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
};
