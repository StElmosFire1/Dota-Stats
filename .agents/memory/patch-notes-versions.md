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
