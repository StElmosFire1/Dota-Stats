---
name: rating_history is the per-match MMR snapshot source
description: Where per-match MMR-at-time-of-game comes from and its gaps
---
`rating_history` gets one row per player per rated match (written by `updateRating` at record time, with `match_id`). It is the authoritative "MMR at match time" snapshot — no separate snapshot column is needed.

**Why:** Match History team-average badges and per-match deltas both read it; duplicating snapshots elsewhere would drift.

**How to apply:** Join `rating_history` on `(player_id, match_id)` (take latest row by id) and fall back to the live `ratings.mmr` when absent. Note: the dev database's `rating_history` is empty — snapshot features only show real data on prod; verify locally with a synthetic row.
