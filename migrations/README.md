# Migrations (Task #313 scaffolding)

This directory is the home for `node-pg-migrate`-style SQL migrations. It is
**additive** — the existing `src/db/index.js` `init()` function remains the
source of truth for the current production schema. New schema work going
forward should land here as a numbered file, and over time pieces of `init()`
will be moved out into migrations.

## Running

```
npm run migrate            # apply all pending migrations
npm run migrate -- down 1  # roll back the latest migration
```

If `node-pg-migrate` is not installed, the script will tell you to
`npm install --save-dev node-pg-migrate` and re-run.

## File naming

`NNNN_short_description.sql` — sequential 4-digit prefix. `0000_baseline.sql`
is a no-op placeholder that documents the contract: the live prod schema
is what `init()` produced, and migration `0001+` builds incrementally on top.

## Why not migrate everything at once?

`init()` is ~1700 lines of `CREATE TABLE IF NOT EXISTS` + ad-hoc
`ALTER TABLE`s accreted over two years. A wholesale conversion is high-risk
against a live prod DB — one drift between the migration file and what
`init()` actually produced and the next deploy fails or silently mismatches.
We will retire `init()` incrementally over follow-up tasks.
