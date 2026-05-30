// Task #426 — Browser smoke test journeys.
//
// Each entry describes one user-visible page the Playwright suite loads, an
// assertion selector that proves the page rendered (not just a blank shell),
// and an optional `auth` flag for journeys that require the synthetic Steam
// test-login (env-gated via SMOKE_TEST_LOGIN_TOKEN + SMOKE_TEST_ACCOUNT_IDS).
// Authenticated journeys are silently skipped when test-login isn't
// configured — the runner records them as 'skipped' with a clear reason.
//
// The runner iterates this list, screenshots each page, perceptual-diffs
// against the stored baseline under tests/smoke/baselines/<key>.png, and
// records pass/fail to browser_smoke_steps. Adding a new journey is a
// one-line append. Keep this list intentionally small (10-15) — these are
// "if this loads the site is alive" canaries, not exhaustive functional
// tests.

// Optional env-driven path helpers so a single committed list works against
// any prod tenant. Defaults are sensible OCE prod values; override per
// deploy via SMOKE_MATCH_ID / SMOKE_PLAYER_ID / SMOKE_COACH_ID /
// SMOKE_TOURNAMENT_ID when the canonical sample changes.
const ENV = process.env;
const SAMPLE_MATCH       = ENV.SMOKE_MATCH_ID      || '1';
const SAMPLE_PLAYER      = ENV.SMOKE_PLAYER_ID     || ENV.SMOKE_TEST_ACCOUNT_IDS?.split(',')[0]?.trim() || '1';
const SAMPLE_COACH       = ENV.SMOKE_COACH_ID      || '1';
const SAMPLE_TOURNAMENT  = ENV.SMOKE_TOURNAMENT_ID || '1';

const JOURNEYS = [
  // ── Anonymous public journeys ──────────────────────────────────────────
  { key: 'home',         path: '/',                                label: 'Home page',           expect: 'main, .container, .home-hero, h1' },
  { key: 'leaderboard',  path: '/leaderboard',                     label: 'Leaderboard',         expect: 'table, .leaderboard, h1' },
  { key: 'matches',      path: '/matches',                         label: 'Match list',          expect: 'table, .matches, h1' },
  { key: 'match_detail', path: `/match/${SAMPLE_MATCH}`,           label: 'Match detail',        expect: '.match, table, h1, h2' },
  { key: 'player_detail',path: `/player/${SAMPLE_PLAYER}`,         label: 'Player profile',      expect: '.profile, .player, h1, h2' },
  { key: 'heroes',       path: '/heroes',                          label: 'Hero stats',          expect: 'table, .heroes, h1' },
  { key: 'coaches',      path: '/coaches',                         label: 'Coaches listing',     expect: '.coaches, .coach-card, h1' },
  { key: 'coach_detail', path: `/coaches/${SAMPLE_COACH}`,         label: 'Coach profile',       expect: '.coach, h1, h2' },
  { key: 'tournaments',  path: '/tournaments',                     label: 'Tournaments index',   expect: '.tournaments, .tournament, h1' },
  { key: 'tournament_detail', path: `/tournaments/${SAMPLE_TOURNAMENT}`, label: 'Tournament detail', expect: '.tournament, h1, h2' },
  { key: 'inhouse',      path: '/inhouse',                         label: 'Inhouse lobby (anon)',expect: 'h1, main, .inhouse' },
  { key: 'patch_notes',  path: '/patch-notes',                     label: 'Patch notes',         expect: '.patch-notes, h1, article' },
  { key: 'health_json',  path: '/api/health',                      label: '/v1/health endpoint', expect: null, asJson: true },

  // ── Authenticated journeys (require SMOKE_TEST_LOGIN_TOKEN) ────────────
  { key: 'auth_profile',  path: '/profile',                  label: 'Signed-in profile',     expect: '.profile, h1, h2', auth: true },
  { key: 'auth_inhouse',  path: '/inhouse',                  label: 'Inhouse lobby (signed-in)', expect: 'h1, button, .inhouse', auth: true },
];

// Pixel-diff tolerance: a step fails if the proportion of differing pixels
// exceeds this. 1% is loose enough to absorb anti-aliasing + font hinting
// jitter on different OS renderers, tight enough to catch a layout shift.
const DEFAULT_DIFF_THRESHOLD = 0.01;

module.exports = { JOURNEYS, DEFAULT_DIFF_THRESHOLD };
