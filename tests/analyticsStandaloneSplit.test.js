// Task #930 — Draft Trainer / Captain Sim runs are folded into the analytics
// summary + daily series, but they have NO daily/endless mode. This test pins
// the contract that keeps the "Daily vs endless" card honest:
//   1. getAnalyticsGameStats UNIONs all three sources with a has_mode flag
//      that is true only for game_results rows.
//   2. The summary exposes mode_plays = COUNT(*) FILTER (WHERE has_mode),
//      so standalone runs never inflate the endless count.
//   3. AnalyticsPanel derives the daily-vs-endless split from mode_plays,
//      not total_plays.
//
// We don't load src/db/index.js (needs a live pg pool); we assert on the
// source text, same pattern as other query-contract tests in this suite.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dbSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'index.js'), 'utf8');
const panelSrc = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'pages', 'AdminPanel.jsx'), 'utf8');

function fnBody(src, name) {
  const start = src.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  // crude but sufficient: grab up to the next top-level "\nasync function" or "\nfunction"
  const rest = src.slice(start);
  const end = rest.slice(1).search(/\n(async )?function /);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

const body = fnBody(dbSrc, 'getAnalyticsGameStats');

test('all three play sources are unioned with a has_mode flag', () => {
  assert.match(body, /FROM game_results/, 'game_results source missing');
  assert.match(body, /FROM draft_trainer_runs/, 'draft_trainer_runs source missing');
  assert.match(body, /FROM captain_mode_runs/, 'captain_mode_runs source missing');
  // game_results is the only mode-classified source
  assert.match(body, /true AS has_mode[\s\S]*?FROM game_results/, 'game_results must set has_mode = true');
  // both standalone sources must be has_mode = false
  const falses = body.match(/false AS has_mode/g) || [];
  assert.strictEqual(falses.length, 2, 'both standalone sources must set has_mode = false');
});

test('summary exposes mode_plays filtered on has_mode', () => {
  assert.match(body, /FILTER \(WHERE has_mode\)::int AS mode_plays/,
    'summary must expose mode_plays = COUNT(*) FILTER (WHERE has_mode)');
  assert.match(body, /FILTER \(WHERE is_daily\)::int AS daily_plays/,
    'summary daily_plays must come from the unioned is_daily flag');
});

test('AnalyticsPanel daily-vs-endless card uses mode_plays, not total_plays', () => {
  const cardIdx = panelSrc.indexOf('"Daily vs endless"');
  assert.ok(cardIdx >= 0, 'Daily vs endless card not found');
  const card = panelSrc.slice(cardIdx, panelSrc.indexOf('/>', cardIdx));
  assert.match(card, /g\.mode_plays/, 'card must use mode_plays as denominator');
  assert.doesNotMatch(card, /g\.total_plays/, 'card must not derive endless from total_plays');
});
