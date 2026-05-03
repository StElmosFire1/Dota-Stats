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

export const DEFAULT_THEME = FREE_THEMES[0];
export const DEFAULT_FRAME = 'none';
