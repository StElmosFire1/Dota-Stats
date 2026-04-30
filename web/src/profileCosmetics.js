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

export const BIO_MAX = 300;
export const PINNED_HERO_CAPTION_MAX = 80;

export function isPremiumTitle(t) { return PREMIUM_TITLES.includes(t); }
export function isPremiumTheme(t) { return PREMIUM_THEMES.includes(t); }

export const DEFAULT_THEME = FREE_THEMES[0];
