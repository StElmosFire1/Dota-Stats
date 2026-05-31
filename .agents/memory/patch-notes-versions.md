---
name: Patch-notes version uniqueness
description: How to pick a new version for src/data/patchNotes.js without tripping the uniqueness gate.
---

When adding an entry to `src/data/patchNotes.js`, the `check:patch-notes` gate
(`npm run check:patch-notes`) asserts every `version` is unique **across the
whole file**, not just the top.

**Why:** versions are NOT globally monotonic. Old/reused version numbers live
deep in the history (e.g. an `8.39` existed thousands of lines down while the
newest entry at the top was `8.38`), so "top entry + 0.01" can collide with a
historical entry and fail the gate.

**How to apply:** before committing, grep the full file for your candidate
version (`rg '"version": "X.YZ"'`). If it already appears anywhere, bump to the
next free number. The gate's failure message tells you the duplicate's entry
index if you miss it.

**Parallel-task collisions are systemic, not a one-off.** Isolated task agents
each add their own patch note and pick a version without seeing the others'
choices, so two queued merges routinely land the same number (e.g. both bump a
`8.75` entry to `8.76`). The gate then fails in *post-merge* of the second
merge, which silently blocks the GitHub push for that merge. Expect to dedupe by
hand after most multi-task batches.

**Critical recovery ordering:** when you fix a post-merge duplicate, the fix
lands in the *working tree* but the already-merged HEAD commit still contains the
duplicate. `post-merge.sh` pushes the committed `HEAD:main`, and the gate it runs
reads the *working tree* — so re-running post-merge would pass the gate yet push
the still-broken commit to GitHub, breaking prod's own deploy gate. Never
re-run/push until the fix is an actual commit. As main agent you cannot
`git commit` (sandbox blocks it); the turn-end checkpoint commits the fix, and
the next task merge then fast-forward-pushes the corrected history.
