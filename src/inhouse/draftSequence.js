// Snake-draft pick sequence for the 8 non-captain slots (4 each side).
// Order: T1, T2, T2, T1, T1, T2, T2, T1 — the captain who picks first only
// gets one back-to-back at the very end so it's roughly even on tempo.
//
// Single source of truth (Task #192). Imported by:
//   - src/web/server.js (the /draft-pick + /draft-status handlers)
//   - src/inhouse/autoStartTicker.js (the per-pick deadline auto-pick sweep)
//   - tests/inhouseDraftDeadline.test.js (sequence-team math assertions)
//
// If this sequence ever changes, every consumer picks up the new order
// automatically and the unit tests assert against the same array rather
// than a stale local copy.
const DRAFT_PICK_SEQUENCE = Object.freeze([1, 2, 2, 1, 1, 2, 2, 1]);

// Task #211 — shared "whose turn is it to pick?" helpers. Both the
// /draft-pick + /draft-status handlers in src/web/server.js and the
// per-pick deadline sweep in src/inhouse/autoStartTicker.js were running
// the same count-drafted-non-captains-then-index-into-the-sequence math
// inline against slightly different player shapes. A future change to
// "what counts as drafted" (e.g. excluding declined picks, or treating
// admin-override picks differently) had to be made in two places and
// could silently disagree. These helpers consolidate the rule in one
// place — same trap Task #192 just closed for the constant.

// Returns the team (1 or 2) that should make the pick at zero-based
// position `pickIdx` in the snake draft, or null if the index is past
// the end of the sequence (draft complete).
function teamForPickIndex(pickIdx) {
  if (pickIdx === null || pickIdx === undefined) return null;
  const n = Number(pickIdx);
  if (!Number.isFinite(n) || n < 0 || n >= DRAFT_PICK_SEQUENCE.length) return null;
  return DRAFT_PICK_SEQUENCE[n];
}

// Counts non-captain drafted players from a session players array. The
// captain exclusion is by account_id (more robust than relying on
// pick_order > 0, since admin-override picks may arrive without a
// pick_order set). Players with team === 0 / null / undefined are
// treated as undrafted.
//
// `session` may be null/undefined (we just won't have captain account
// ids to exclude); callers in production always pass it.
function countDraftedNonCaptains(players, session) {
  if (!Array.isArray(players)) return 0;
  const cap1 = session ? Number(session.captain1_account_id) : null;
  const cap2 = session ? Number(session.captain2_account_id) : null;
  let n = 0;
  for (const p of players) {
    if (!p) continue;
    if (p.team === 0 || p.team == null) continue;
    const aid = Number(p.account_id);
    if (aid === cap1 || aid === cap2) continue;
    n++;
  }
  return n;
}

// Returns the team (1 or 2) whose captain is currently on the clock, or
// null if the draft is already complete. Combines the count helper with
// the sequence index — the canonical "whose turn is it?" answer.
function currentPickerTeam(players, session) {
  const drafted = countDraftedNonCaptains(players, session);
  return teamForPickIndex(drafted);
}

module.exports = {
  DRAFT_PICK_SEQUENCE,
  teamForPickIndex,
  countDraftedNonCaptains,
  currentPickerTeam,
};
