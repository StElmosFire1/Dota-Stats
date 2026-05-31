---
name: Draft order_num cross-source inconsistency
description: Why draft pick/ban numbering must not blindly +1 the stored order_num
---

The `draft` rows' `order_num` is stored with **different bases depending on the
ingestion source**:

- Replay-parsed matches (local OpenDota Java parser): `order_num` 1–24.
- OpenDota-sourced matches (picks_bans): `order_num` 0–23.

**Rule:** never derive the displayed draft position with a blind `order_num + 1`.
That produced 2–25 (no "#1") on replay matches in the MatchDetail Draft & Bans
panel.

**How to apply:** compute a 1-based chronological rank from the *sorted position*
of each entry across the full draft (picks + bans together), and key the lookup
Map by the **entry object reference** (not by `order_num`) so duplicate/dirty
order values can't collapse Map entries and skip numbers. `Array.filter`
(byTeam) preserves object identity, so reference-keyed lookup is safe.

**Why:** the two sources are a long-standing data inconsistency that won't be
normalised at write time, so any UI that surfaces draft order must normalise on
read.
