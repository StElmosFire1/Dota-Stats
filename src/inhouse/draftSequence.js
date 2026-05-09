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

module.exports = { DRAFT_PICK_SEQUENCE };
