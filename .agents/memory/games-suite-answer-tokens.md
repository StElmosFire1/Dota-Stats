---
name: Games suite answer tokens & kinds
description: How the daily mini-games suite hides answers and dispatches per game "kind".
---

# Games suite: answer secrecy & the `kind` switch

**Endless `answerToken` is signed, NOT encrypted.** `seed.signToken` is HMAC-signed
base64url JSON — the client *can* decode it. It is anti-tamper, not secret. So the
true leak-free guarantee only holds for **daily** (answer kept server-side in the
`game_daily_puzzles.answer` column, never in the clue/choices payload). For endless,
never put anything in the token you wouldn't show the player; identity/answer riding
in the token matches the established statline pattern.

**Per-game dispatch keys off `GAME_META[game].kind`** (`hero` | `item` | `player`).
`answerKey()` maps kind → the field compared in `isCorrect` (`heroId`/`itemId`/`accountId`);
`revealAnswer()` and the daily `choices` source branch on it too. Adding a new game =
add to `GAMES` + `GAME_META`, then handle its kind in those three spots (plus a clue
renderer + `ClueArea` branch on the frontend).

**Account IDs are Number-safe.** Dota32 account ids are < 2^32, so comparing them via
`Number()` in `isCorrect` is safe even though the column is BIGINT.

**Anonymised players** must be excluded from both the answer pool and the guess roster:
LEFT JOIN `player_profiles` and require `anonymized_at IS NULL` (accounts with no profile
row pass the filter, which is correct — they were never anonymised).
