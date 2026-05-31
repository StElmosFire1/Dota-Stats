---
name: Postgres ROUND(AVG(...)) numeric cast footgun
description: Why AVG over a float/double column must be cast ::numeric before ROUND(_, n) in this codebase's stats queries.
---

# ROUND(AVG(...)) must cast to ::numeric

In Postgres, `ROUND(value, scale)` (the two-arg form) only exists for `numeric`.
`AVG()` over a `double precision`/`float` expression returns `double precision`, and
`ROUND(double precision, integer)` does **not** exist → the query throws
`function round(double precision, integer) does not exist` and the whole endpoint 500s.

**Rule:** any stats query doing `ROUND(AVG(<float-or-::float expr>), n)` must cast to
numeric first — either `ROUND(AVG(expr)::numeric, n)` or cast the operands
(e.g. `(kills + assists)::numeric / deaths`). The one-arg `ROUND(double precision)`
(no scale) is fine and does not need a cast, but casting anyway keeps it consistent.

**Why:** this has bitten the Hall of Fame `getHallOfFameCareerStats` query in BOTH
editions independently (full edition first, then the community edition's copy). The
`avg_kda`/`avg_gpm` columns are the usual offenders because KDA uses `::float`
division. The healthy reference pattern is `getPlayerBenchmarkAverages`, which already
casts every `AVG(...)` to `::numeric`.

**How to apply:** when adding or editing any `ROUND(AVG(...))` in `src/db/index.js` or
`community-edition/src/db/index.js`, confirm the AVG argument is numeric. The two
edition db files are independent copies — fixing one does NOT fix the other, so check
both when a stats query bug is reported. Verify quickly with
`psql "$DATABASE_URL" -tAc "SELECT ROUND(AVG(col)::numeric, 2) FROM player_stats;"`.
