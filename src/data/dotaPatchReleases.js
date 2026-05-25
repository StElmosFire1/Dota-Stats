// Task #382 — Hero meta v2. Approximate Dota 2 patch release dates used by
// db.backfillMatchPatch() to fill `matches.patch` for rows uploaded before
// the column was being populated on insert. Newest-first; backfill picks
// the first entry whose `start` is <= the match's date. These are coarse
// (some are best-effort guesses) — admin can tune live by editing this
// file and re-running the backfill. Forward-going uploads set the patch
// directly on insert and never rely on this table.
module.exports = [
  { patch: '7.40', start: '2026-04-01' },
  { patch: '7.39', start: '2025-10-01' },
  { patch: '7.38', start: '2025-02-19' },
  { patch: '7.37', start: '2024-07-25' },
  { patch: '7.36', start: '2024-05-22' },
  { patch: '7.35', start: '2023-12-14' },
  { patch: '7.34', start: '2023-08-08' },
  { patch: '7.33', start: '2023-04-20' },
  { patch: '7.32', start: '2022-08-23' },
  { patch: '7.31', start: '2022-02-23' },
];
