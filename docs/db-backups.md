# Nightly database backups (Task #896)

Full-database disaster recovery for the production Postgres. The admin panel's
"📸 Backup" button only snapshots three ratings tables *into the same
database* — if the DB host dies, match history, purchases, and Stripe records
die with it. This pipeline takes a full `pg_dump` every night and ships it
**off the bot host** so a host failure can't take the backups with it.

## How it works

- **Job**: `src/jobs/nightlyDbBackup.js`, scheduled from `src/index.js` via
  node-cron at **02:30 Australia/Sydney** nightly (quiet hours, before the
  03:00 Sunday browser smoke).
- **Dump**: `pg_dump -Fc` (custom format, compressed) of `DATABASE_URL` into
  the local staging dir (`BACKUP_LOCAL_DIR`, default `~/backups/nightly/`),
  named `nightly-YYYYMMDD-HHMMSS.dump`.
- **Retention**: keeps the newest **14 daily** dumps plus the newest
  **8 Sunday (weekly)** dumps; everything older is pruned. Files that don't
  match the `nightly-*.dump` pattern (manual / pre-migration dumps per
  `migrations/README.md`) are never touched.
- **Off-host shipping**: `rclone sync <staging dir> $BACKUP_RCLONE_REMOTE`
  (scoped to `nightly-*.dump`). Because the staging dir is pruned *first*,
  the remote mirrors the same retention window automatically. rclone works
  with S3, DigitalOcean Spaces, Backblaze B2, sftp to a second host, etc.
- **Failure alerting — silent failure is impossible**:
  - every failed step calls `reportError` → Discord ping via
    `ERROR_ALERT_WEBHOOK_URL`;
  - the `nightly_db_backup` cron heartbeat (AdminPanel → System heartbeats)
    flips to `error` with the failure message, and shows the dump name +
    ship status on every clean run;
  - in production, **no `BACKUP_RCLONE_REMOTE` configured is itself treated
    as a failure** (nightly alert) unless you explicitly accept the risk
    with `BACKUP_ALLOW_LOCAL_ONLY=1`. A backup that lives only on the host
    it protects is not a backup.

## Env vars

| Var | Default | Purpose |
|-----|---------|---------|
| `BACKUP_RCLONE_REMOTE` | *(unset)* | rclone destination, e.g. `spaces:oi-backups/nightly`. **Required in production.** |
| `BACKUP_LOCAL_DIR` | `~/backups/nightly` | Local staging dir for dumps. |
| `BACKUP_KEEP_DAILY` | `14` | Daily dumps retained. |
| `BACKUP_KEEP_WEEKLY` | `8` | Sunday dumps retained beyond the daily window. |
| `BACKUP_ALLOW_LOCAL_ONLY` | *(unset)* | Set `1` to suppress the prod "no remote" alert (explicit risk acceptance only). |
| `BACKUP_PG_DUMP_PATH` / `BACKUP_RCLONE_PATH` | `pg_dump` / `rclone` | Binary overrides if not on PATH. |

## One-time host setup (owner-run, paste-ready)

Prod ops are owner-run (the agent has no SSH to the bot host). On the bot
host as the deploy user:

```bash
# 1. Install rclone (idempotent)
command -v rclone >/dev/null || curl -fsSL https://rclone.org/install.sh | sudo bash

# 2. Configure a remote — example: DigitalOcean Spaces (any rclone backend works)
rclone config create oi-backups s3 provider=DigitalOcean \
  access_key_id=<SPACES_KEY> secret_access_key=<SPACES_SECRET> \
  endpoint=syd1.digitaloceanspaces.com acl=private

# 3. Verify the remote is writable
rclone touch oi-backups:oi-db-backups/nightly/.write-test && \
rclone delete oi-backups:oi-db-backups/nightly/.write-test && echo "remote OK"

# 4. Point the bot at it and restart
pm2 set oi-bot:noop 1 >/dev/null 2>&1 || true   # ensure pm2 env editing works
# add to the PM2 process env (however you manage it, e.g. ecosystem file or:)
#   BACKUP_RCLONE_REMOTE=oi-backups:oi-db-backups/nightly
pm2 restart oi-bot --update-env

# 5. Prove the whole pipeline end-to-end (same code path as the cron):
cd ~/Dota-Stats-Full && node scripts/run-db-backup.js
rclone ls oi-backups:oi-db-backups/nightly   # dump should be listed here
```

Watch for `[Backup] OK — ... (shipped off-host)` and exit code 0. Any failure
also pings the error alert webhook, so a broken config surfaces immediately.

## Restore procedure (tested)

Restores use `pg_restore` against the custom-format dump. **Test the drill
before you need it** — steps 1–3 restore into a scratch database and prove
the dump is usable without touching prod.

```bash
# 0. Fetch the dump you want (newest listed last):
rclone ls oi-backups:oi-db-backups/nightly
rclone copy oi-backups:oi-db-backups/nightly/nightly-<stamp>.dump ~/restore/

# 1. DRILL — restore into a scratch DB (safe anytime, no prod impact):
createdb oi_restore_drill
pg_restore --no-owner -d oi_restore_drill ~/restore/nightly-<stamp>.dump

# 2. Verify the restore looks sane:
psql oi_restore_drill -c "SELECT count(*) FROM matches;"
psql oi_restore_drill -c "SELECT count(*) FROM stripe_webhook_inbox;"   # money records survived
psql oi_restore_drill -c "SELECT max(created_at) FROM matches;"        # data recency matches dump date

# 3. Clean up the drill:
dropdb oi_restore_drill

# 4. REAL restore (disaster only — this overwrites the target DB):
pm2 stop oi-bot                                  # stop writers first
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" ~/restore/nightly-<stamp>.dump
pm2 restart oi-bot --update-env
curl -fsS http://127.0.0.1:<port>/api/health     # expect ok:true
```

Notes:
- `--clean --if-exists` drops and recreates objects, so the target must not
  have active connections — stop the bot first.
- Anything written between the dump timestamp and the failure is lost
  (nightly cadence ⇒ up to 24h RPO). Stripe's dashboard remains the source
  of truth for payments in that window — reconcile via the admin Payment
  Review page after a restore.
- Pre-migration one-off dumps (`migrations/README.md`) share the same
  `pg_restore` mechanics.

## Monitoring checklist

- AdminPanel → System heartbeats → `nightly_db_backup` shows a run within
  the last ~24h with status `ok`.
- The error alert Discord channel is quiet (any backup failure posts there).
- Occasionally spot-check `rclone ls $BACKUP_RCLONE_REMOTE` — expect ~14–22
  files, newest dated last night.
