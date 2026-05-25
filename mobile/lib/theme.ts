// Mirrors the web frontend palette defined in web/src/styles.css so the
// mobile app feels consistent with oceinhouse.gg. Keep these in sync when
// the website palette changes.
export const theme = {
  bg: '#0d1424',
  surface: '#15203a',
  surfaceAlt: '#1c2a48',
  border: '#2a3a5a',
  text: '#f5efe2',
  textMuted: '#9aa6bd',
  accent: '#c5a975',
  gold: '#c5a975',
  brass: '#b08d4a',
  amber: '#f59e0b',
  parchment: '#f5efe2',
  inkNavy: '#0d1424',
  win: '#22c55e',
  loss: '#ef4444',
} as const;

export type Theme = typeof theme;
