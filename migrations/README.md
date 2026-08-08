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

`node-pg-migrate` is a pinned root dependency (see package.json), so a plain
`npm install` provides it. It reads `DATABASE_URL` from the environment (or
`.env` via dotenv) and tracks applied migrations in the `pgmigrations` table.

## Deploy wiring (Task #856)

`deploy.sh` runs `npm run migrate` on every deploy, after the test suite and
BEFORE the PM2 restart — so a failed migration aborts the deploy and leaves
the previous build live against the previous schema. Migrations must remain
backward-compatible with the currently-running code for that window (additive
columns/tables; never drop/rename in the same deploy that stops using them).

## Backup & rollback procedure

Before any migration that is destructive or touches hot tables:

```
# 1. Backup (run on the prod host; ~seconds for this DB size)
pg_dump "$DATABASE_URL" -Fc -f ~/backups/pre-$(date +%Y%m%d-%H%M%S).dump

# 2. Apply
npm run migrate

# 3. If it goes wrong — roll back the migration record + schema change:
npm run migrate -- down 1
#    ...or, worst case, restore the backup:
pg_restore --clean --if-exists -d "$DATABASE_URL" ~/backups/pre-<stamp>.dump
```

Write a paired `down` whenever the SQL is reversible; for irreversible SQL
(data deletes), the pg_dump backup is the rollback path — take it first.

Separate from these one-off pre-migration dumps, a **nightly automated
pg_dump** ships off-host with retention + failure alerting (Task #896) — see
`docs/db-backups.md` for setup, monitoring, and the tested restore procedure.
Manual dumps in `~/backups/` are never pruned by the nightly job (it only
manages `nightly-*.dump` files in its own staging dir).

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
