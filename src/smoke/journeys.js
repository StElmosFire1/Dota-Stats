// Task #426 — Browser smoke test journeys.
//
// Each entry describes one user-visible page the Playwright suite loads, an
// assertion selector that proves the page rendered (not just a blank shell),
// and an optional viewport hint. The runner iterates this list, screenshots
// each page, perceptual-diffs against the stored baseline under
// tests/smoke/baselines/<key>.png, and records pass/fail to
// browser_smoke_steps. Adding a new journey is a one-line append.
//
// Keep this list intentionally small (10-15) — these are the "if this loads
// the site is alive" canaries, not exhaustive functional tests.

const JOURNEYS = [
  { key: 'home',         path: '/',                          label: 'Home page',           expect: 'main, .container, .home-hero, h1' },
  { key: 'leaderboard',  path: '/leaderboard',               label: 'Leaderboard',         expect: 'table, .leaderboard, h1' },
  { key: 'players',      path: '/players',                   label: 'Players index',       expect: 'table, .players, h1' },
  { key: 'matches',      path: '/matches',                   label: 'Match list',          expect: 'table, .matches, h1' },
  { key: 'heroes',       path: '/heroes',                    label: 'Hero stats',          expect: 'table, .heroes, h1' },
  { key: 'synergy',      path: '/synergy',                   label: 'Synergy grid',        expect: '.synergy, table, h1' },
  { key: 'coaches',      path: '/coaches',                   label: 'Coaches listing',     expect: '.coaches, .coach-card, h1' },
  { key: 'tournaments',  path: '/tournaments',               label: 'Tournaments',         expect: '.tournaments, .tournament, h1' },
  { key: 'inhouse',      path: '/inhouse',                   label: 'Inhouse lobby',       expect: '.inhouse, h1' },
  { key: 'patch_notes',  path: '/patch-notes',               label: 'Patch notes',         expect: '.patch-notes, h1, article' },
  { key: 'pro',          path: '/pro',                       label: 'Pro tier upsell',     expect: 'h1, .pro' },
  { key: 'health_json',  path: '/api/health',                label: '/v1/health endpoint', expect: null, asJson: true },
];

// Pixel-diff tolerance: a step fails if the proportion of differing pixels
// exceeds this. 1% is loose enough to absorb anti-aliasing + font hinting
// jitter on different OS renderers, tight enough to catch a layout shift.
const DEFAULT_DIFF_THRESHOLD = 0.01;

module.exports = { JOURNEYS, DEFAULT_DIFF_THRESHOLD };
