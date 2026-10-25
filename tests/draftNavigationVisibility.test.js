'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('unfinished draft menu flags are independently seeded off without overwriting admin choices', () => {
  const db = read('src/db/index.js');
  for (const key of ['draft_assistant_navigation', 'draft_trainer_navigation']) {
    assert.ok(db.includes(`('${key}', 'off',`));
  }
  const seed = db.slice(db.indexOf("('home_launch_banner'"), db.indexOf('// Task #507'));
  assert.match(seed, /ON CONFLICT \(key\) DO NOTHING/);
});

test('draft dropdown entries require explicitly resolved visibility flags', () => {
  const app = read('web/src/App.jsx');
  assert.match(app, /showDraftAssistant = navigationFlags\.draft_assistant_navigation === true/);
  assert.match(app, /showDraftTrainer = navigationFlags\.draft_trainer_navigation === true/);
  assert.match(app, /showDraftAssistant && <DropdownItem to="\/draft"/);
  assert.match(app, /showDraftTrainer && <DropdownItem to="\/heroes\/draft-trainer"/);
  assert.match(app, /<Route path="\/draft-assistant" element={<DraftAssistant \/>} \/>/);
  assert.match(app, /<Route path="\/heroes\/draft-trainer" element={<DraftTrainer \/>} \/>/);
});

test('saving a feature flag refreshes navigation and describes menu-only scope', () => {
  const admin = read('web/src/pages/AdminPanel.jsx');
  const card = admin.slice(admin.indexOf('function FeatureFlagsEditorCard('));
  assert.match(card, /const \{ refresh: refreshPublicFlags \} = useFeatureFlags\(\)/);
  assert.match(card, /await setFeatureFlag\(\{ key, state \}, superuserKey\);\s+await refreshPublicFlags\(\)/);
  assert.match(card, /only hide dropdown entries; direct links and Analyze in Draft still work/);
});
