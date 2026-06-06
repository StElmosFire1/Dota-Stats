// Task #826 — shared overlay customisation helpers.
// Every overlay reads the streamer's prefs from its endpoint payload
// (`data.prefs`) and applies the chosen theme/accent + per-element
// visibility. Keeping this in one module means the OBS overlays and the
// Settings live-preview stay in lockstep.

export const OVERLAY_THEMES = {
  court:   { label: 'Court (brass)', accent: '#c5a975' },
  pitch:   { label: 'Pitch (green)', accent: '#34d399' },
  amber:   { label: 'Amber',         accent: '#f59e0b' },
  crimson: { label: 'Crimson',       accent: '#e0123c' },
  mono:    { label: 'Mono',          accent: '#cbd5e1' },
};

export const OVERLAY_THEME_OPTIONS = [
  ...Object.entries(OVERLAY_THEMES).map(([value, t]) => ({ value, label: t.label })),
  { value: 'custom', label: 'Custom accent' },
];

// Element toggles grouped by which overlay surfaces them. Used to render
// the customisation controls in Settings.
export const OVERLAY_ELEMENT_GROUPS = [
  {
    title: 'Ticker & season',
    items: [
      { key: 'mmr', label: 'MMR' },
      { key: 'tier', label: 'Tier' },
      { key: 'winRate', label: 'Win rate' },
      { key: 'streak', label: 'Streak' },
      { key: 'region', label: 'Region' },
      { key: 'bestHero', label: 'Best hero' },
      { key: 'rankTrend', label: 'Rank trend' },
    ],
  },
  {
    title: 'Scoreboard & recap',
    items: [
      { key: 'kda', label: 'K/D/A' },
      { key: 'netWorth', label: 'Net worth' },
      { key: 'gpm', label: 'GPM' },
      { key: 'xpm', label: 'XPM' },
      { key: 'lasthits', label: 'Last hits / denies' },
      { key: 'mvp', label: 'MVP (recap)' },
      { key: 'records', label: 'Records (recap)' },
    ],
  },
  {
    title: 'Draft & live',
    items: [
      { key: 'bans', label: 'Bans' },
    ],
  },
];

export function defaultOverlayPrefs() {
  const elements = {};
  for (const g of OVERLAY_ELEMENT_GROUPS) for (const it of g.items) elements[it.key] = true;
  return { theme: 'court', accent: '#c5a975', elements };
}

// Resolve the effective accent colour for a prefs blob.
export function resolveAccent(prefs) {
  if (!prefs) return null;
  if (prefs.theme === 'custom' && /^#[0-9a-fA-F]{6}$/.test(prefs.accent || '')) return prefs.accent;
  const t = OVERLAY_THEMES[prefs.theme];
  return t ? t.accent : null;
}

// Inline style for the overlay root — overrides the brass/accent CSS vars
// so the existing overlay CSS (which references var(--brass)) recolours
// without per-theme stylesheets.
export function overlayRootStyle(prefs) {
  const accent = resolveAccent(prefs);
  if (!accent) return undefined;
  return { '--brass': accent, '--accent': accent };
}

// Whether a given element should be shown. Defaults to visible when the
// prefs (or the specific key) are absent, so overlays never hide content
// for streamers who haven't customised anything.
export function elementShown(prefs, key, def = true) {
  if (!prefs || !prefs.elements) return def;
  const v = prefs.elements[key];
  return v == null ? def : v !== false;
}
