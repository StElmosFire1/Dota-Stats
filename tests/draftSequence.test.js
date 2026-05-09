// Task #211 — direct unit tests for the shared "whose turn is it to
// pick?" helpers in src/inhouse/draftSequence.js.
//
// Both src/web/server.js (the /draft-pick + /draft-status handlers) and
// src/inhouse/autoStartTicker.js (the per-pick deadline sweep + the
// recovery sweep) used to do the same count-non-captain-drafted-players
// then index-into-DRAFT_PICK_SEQUENCE math inline against slightly
// different player shapes. These assertions exercise the helper
// directly so they don't have to round-trip through the ticker / route
// handlers — that's the point of pulling the math up into one module.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DRAFT_PICK_SEQUENCE,
  teamForPickIndex,
  countDraftedNonCaptains,
  currentPickerTeam,
} = require('../src/inhouse/draftSequence');

// ---------------------------------------------------------------------------
// teamForPickIndex — pure index → team lookup with bounds handling.
// ---------------------------------------------------------------------------

test('teamForPickIndex: returns the canonical sequence for every valid pick', () => {
  for (let i = 0; i < DRAFT_PICK_SEQUENCE.length; i++) {
    assert.equal(teamForPickIndex(i), DRAFT_PICK_SEQUENCE[i]);
  }
});

test('teamForPickIndex: returns null past the end of the sequence', () => {
  assert.equal(teamForPickIndex(DRAFT_PICK_SEQUENCE.length), null);
  assert.equal(teamForPickIndex(DRAFT_PICK_SEQUENCE.length + 5), null);
});

test('teamForPickIndex: returns null for negative or non-numeric input', () => {
  assert.equal(teamForPickIndex(-1), null);
  assert.equal(teamForPickIndex(null), null);
  assert.equal(teamForPickIndex(undefined), null);
  assert.equal(teamForPickIndex(NaN), null);
  assert.equal(teamForPickIndex('not-a-number'), null);
});

// ---------------------------------------------------------------------------
// countDraftedNonCaptains — count guard against the captain-by-account-id
// exclusion rule (the rule that previously lived in two places).
// ---------------------------------------------------------------------------

const CAPS = { captain1_account_id: 1, captain2_account_id: 2 };

test('countDraftedNonCaptains: ignores captains even when team !== 0', () => {
  const players = [
    { account_id: 1, team: 1 }, // captain — must NOT count
    { account_id: 2, team: 2 }, // captain — must NOT count
    { account_id: 100, team: 1, pick_order: 1 },
    { account_id: 101, team: 2, pick_order: 2 },
  ];
  assert.equal(countDraftedNonCaptains(players, CAPS), 2);
});

test('countDraftedNonCaptains: undrafted seats (team 0/null/undefined) are skipped', () => {
  const players = [
    { account_id: 1, team: 1 },
    { account_id: 2, team: 2 },
    { account_id: 100, team: 0, status: 'registered' },
    { account_id: 101, team: null },
    { account_id: 102, team: undefined },
    { account_id: 103, team: 1, pick_order: 1 },
  ];
  assert.equal(countDraftedNonCaptains(players, CAPS), 1);
});

test('countDraftedNonCaptains: account_id matching is numeric (string vs number safe)', () => {
  // Captains stored as strings on either side must still be excluded.
  const players = [
    { account_id: '1', team: 1 },
    { account_id: 2,   team: 2 },
    { account_id: '100', team: 1, pick_order: 1 },
  ];
  assert.equal(countDraftedNonCaptains(players, CAPS), 1);
});

test('countDraftedNonCaptains: null/missing session means no captain exclusions', () => {
  const players = [
    { account_id: 1, team: 1 },
    { account_id: 2, team: 2 },
    { account_id: 100, team: 1, pick_order: 1 },
  ];
  // With no captain ids to exclude every drafted seat counts.
  assert.equal(countDraftedNonCaptains(players, null), 3);
  assert.equal(countDraftedNonCaptains(players, undefined), 3);
});

test('countDraftedNonCaptains: defensive against non-array / null entries', () => {
  assert.equal(countDraftedNonCaptains(null, CAPS), 0);
  assert.equal(countDraftedNonCaptains(undefined, CAPS), 0);
  assert.equal(countDraftedNonCaptains('not-an-array', CAPS), 0);
  // null / undefined entries inside the array must not throw.
  const players = [null, undefined, { account_id: 100, team: 1 }];
  assert.equal(countDraftedNonCaptains(players, CAPS), 1);
});

// ---------------------------------------------------------------------------
// currentPickerTeam — the canonical "whose turn is it?" answer that both
// the server route and the ticker now share.
// ---------------------------------------------------------------------------

test('currentPickerTeam: pickIdx 0 with only captains drafted → team 1', () => {
  const players = [
    { account_id: 1, team: 1 },
    { account_id: 2, team: 2 },
  ];
  assert.equal(currentPickerTeam(players, CAPS), 1);
});

test('currentPickerTeam: walks the sequence as picks accumulate', () => {
  const players = [
    { account_id: 1, team: 1 },
    { account_id: 2, team: 2 },
  ];
  for (let i = 0; i < DRAFT_PICK_SEQUENCE.length; i++) {
    assert.equal(
      currentPickerTeam(players, CAPS),
      DRAFT_PICK_SEQUENCE[i],
      `after ${i} non-captain picks the picker should be team ${DRAFT_PICK_SEQUENCE[i]}`
    );
    // Add the next non-captain pick onto whichever team is on the clock
    // — the actual team assigned doesn't affect the count.
    players.push({ account_id: 100 + i, team: DRAFT_PICK_SEQUENCE[i], pick_order: i + 1 });
  }
  // 8 non-captain picks placed → draft complete.
  assert.equal(currentPickerTeam(players, CAPS), null);
});

test('currentPickerTeam: declined / undrafted seats do not advance the clock', () => {
  const players = [
    { account_id: 1, team: 1 },
    { account_id: 2, team: 2 },
    { account_id: 50, team: 0, status: 'declined' },
    { account_id: 51, team: 0, status: 'registered' },
  ];
  assert.equal(currentPickerTeam(players, CAPS), DRAFT_PICK_SEQUENCE[0]);
});
