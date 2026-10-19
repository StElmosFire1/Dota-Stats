# Shared replay parser: ownership and production migration

## Contract

`replay-parser.service` is the **only** production lifecycle owner. Both editions
use `127.0.0.1:5600` as clients. They probe health at startup, every five seconds,
and before parsing; they never launch Java, signal a process, or evict a listener.
Shutdown stops only that client's health checks. A failed health check disables
parsing until a later check succeeds. Uploads already in flight are not retried
automatically: retry manually after recovery to avoid duplicate work.

The service uses a root-owned, immutable JAR under `/opt/oi-replay-parser/`,
not a file inside either deploy checkout. An app deployment or restart does not
upgrade or restart the parser. systemd restarts Java on failure (five-second
delay, at most five starts per minute). A bind conflict fails visibly without
killing the other listener. After fixing a persistent failure, run
`systemctl reset-failed replay-parser && systemctl start replay-parser`.

Health:

```sh
curl --fail --max-time 3 http://127.0.0.1:5600/healthz
systemctl show replay-parser -p MainPID -p ActiveState -p SubState -p NRestarts
sha256sum /opt/oi-replay-parser/current.jar
tail -n 80 /var/log/oi-replay-parser/stderr.log
journalctl -u replay-parser --since '15 minutes ago' --no-pager
```

`/healthz` returns service identity, protocol version, SHA-256 of the **running**
JAR, process ID, and startup time (Unix milliseconds). Compare both hash and PID;
HTTP 200 alone does not identify the build or owner. `development-classes` is
returned only when running unbundled classes. The health endpoint checks HTTP
availability, not whether a particular replay is decodable.

Java stdout and exceptions are persisted separately under
`/var/log/oi-replay-parser/`, including across app restarts and reboots.
`ops/replay-parser/logrotate.conf` keeps 14 compressed rotations. With
copy-truncate a small amount of output can be lost at rotation; systemd
start/stop/failure messages also appear in the system journal. Do not flush historical logs during
diagnosis. Loopback binding is intentional; do not expose port 5600 publicly.

## Approval and prerequisites

**This document is a runbook, not an executed production change.** Approval to
prepare the code does not authorize a production interruption. Obtain separate
approval for a maintenance window before the cutover block. It stops **both
sites/bots**, not just uploads, because legacy apps can respawn/evict Java.
Wait for active uploads, automatic parsing jobs, and queued matches to drain.
Keep the maintenance window open through smoke tests or rollback.

Run only on the production **bot host**, as root (`root@Dota-Stats`), not the
dedicated game-server droplet or the Replit workspace. Required: systemd with
`StandardOutput=append:` support, Java 21+, git, curl, Python 3, logrotate,
`ss`, and the existing root PM2 instance. Verify `/usr/bin/java -version`.
Do not install or change Java during this migration.

Expected active checkouts:

* Full: `/root/Dota-Stats-Full`, PM2 `oi-bot`, `src/index.js`.
* Community: `/root/Dota-Stats`, PM2 `inhouse-bot`,
  `community-edition/src/index.js`.

Check `pm2 describe` for both processes and confirm those paths before proceeding.
Both checkouts must be clean; record any uncommitted changes and stop if present.
Use one approved merged commit containing this change for both editions.
Do not run two migration sessions concurrently.

### 1. Stage and preserve the old lifecycle (no process interruption)

This intentionally refuses an existing backup or service installation. For a
resumed migration, inspect the preserved directory rather than overwriting it.
`git fetch` obtains code but does not deploy or restart anything.

```bash
set -euo pipefail
test "$(id -u)" = 0
test "$(hostname)" = Dota-Stats
/usr/bin/java -version
python3 - <<'PY'
import re, subprocess
version = subprocess.check_output(['/usr/bin/java', '-version'], stderr=subprocess.STDOUT, text=True)
major = re.search(r'version "(\d+)', version)
assert major and int(major.group(1)) >= 21, 'The committed parser requires Java 21+; stop before maintenance.'
PY
pm2 describe oi-bot
pm2 describe inhouse-bot
test -z "$(git -C /root/Dota-Stats-Full status --porcelain)"
test -z "$(git -C /root/Dota-Stats status --porcelain)"
test ! -e /etc/systemd/system/replay-parser.service
test ! -e /etc/logrotate.d/oi-replay-parser
test ! -e /opt/oi-replay-parser
B=/root/oi-parser-migration
test ! -e "$B"
git -C /root/Dota-Stats-Full fetch origin
git -C /root/Dota-Stats fetch origin
read -r -p 'Approved merged commit SHA: ' RELEASE
RELEASE=$(git -C /root/Dota-Stats-Full rev-parse "${RELEASE}^{commit}")
# Both deploy scripts reset to origin/main, so stop if that is not the approved release.
test "$RELEASE" = "$(git -C /root/Dota-Stats-Full rev-parse origin/main)"
test "$RELEASE" = "$(git -C /root/Dota-Stats rev-parse origin/main)"
git -C /root/Dota-Stats-Full show "$RELEASE:src/replay/replayParser.js" | grep 'extends ParserServiceClient'
git -C /root/Dota-Stats-Full show "$RELEASE:community-edition/src/replay/replayParser.js" | grep 'extends ParserServiceClient'
install -d -m 0700 "$B"
printf '%s\n' "$RELEASE" > "$B/release"
git -C /root/Dota-Stats-Full rev-parse HEAD > "$B/full-before"
git -C /root/Dota-Stats rev-parse HEAD > "$B/community-before"
cp /root/Dota-Stats-Full/src/replay/replayParser.js "$B/full-replayParser.js"
cp /root/Dota-Stats/community-edition/src/replay/replayParser.js "$B/community-replayParser.js"
cp /root/Dota-Stats-Full/odota-parser/target/stats-0.1.0.jar "$B/full-before.jar"
cp /root/Dota-Stats/odota-parser/target/stats-0.1.0.jar "$B/community-before.jar"
git -C /root/Dota-Stats-Full archive "$RELEASE" \
  ops/replay-parser odota-parser/target/stats-0.1.0.jar | tar -x -C "$B"
sha256sum "$B/odota-parser/target/stats-0.1.0.jar" | tee "$B/staged-sha"
ss -ltnp 'sport = :5600' | tee "$B/listener-before.txt"
curl --max-time 3 -sS http://127.0.0.1:5600/healthz > "$B/health-before.txt" || true
```

Inspect the listener with `ps -o pid,ppid,lstart,args -p PID` and
`ls -l /proc/PID/fd/1 /proc/PID/fd/2`. Confirm it is the known replay Java JAR.
Never infer identity solely from the port, and never use `fuser -k`, `pkill java`,
or `killall java`. If another service owns the listener, stop and investigate.

### 2. Approved cutover (interrupts both editions)

Keep the root shell open. The PID prompt occurs **after** stopping both legacy
apps; re-inspect because app shutdown might already have terminated its child.
If no listener remains, press Enter. A hung process must be investigated, not
automatically escalated to SIGKILL. Do not continue until port 5600 is free.

```bash
set -euo pipefail
B=/root/oi-parser-migration
test -s "$B/release"
read -r -p 'Approved maintenance window: type MIGRATE to stop both sites: ' CONFIRM
test "$CONFIRM" = MIGRATE
pm2 stop oi-bot inhouse-bot
ss -ltnp 'sport = :5600'
read -r -p 'Verified orphan replay-parser PID (Enter if no listener): ' PID
if [ -n "$PID" ]; then
  [[ "$PID" =~ ^[0-9]+$ ]] && test "$PID" -gt 1
  test "$(cat "/proc/$PID/comm")" = java
  tr '\0' ' ' < "/proc/$PID/cmdline"; echo
  read -r -p 'Confirm this exact process is the old replay parser: type STOP: ' STOP
  test "$STOP" = STOP
  kill -TERM "$PID"
  for i in $(seq 1 30); do
    test ! -e "/proc/$PID" && break
    sleep 1
  done
fi
test "$(ss -H -ltn 'sport = :5600' | wc -l)" -eq 0
install -d -m 0755 /opt/oi-replay-parser/releases
SHA=$(sha256sum "$B/odota-parser/target/stats-0.1.0.jar" | cut -d' ' -f1)
install -m 0644 "$B/odota-parser/target/stats-0.1.0.jar" "/opt/oi-replay-parser/releases/$SHA.jar"
ln -s "releases/$SHA.jar" /opt/oi-replay-parser/current.jar
install -m 0644 "$B/ops/replay-parser/replay-parser.service" /etc/systemd/system/replay-parser.service
install -m 0644 "$B/ops/replay-parser/logrotate.conf" /etc/logrotate.d/oi-replay-parser
systemd-analyze verify /etc/systemd/system/replay-parser.service
logrotate --debug /etc/logrotate.d/oi-replay-parser
systemctl daemon-reload
systemctl enable --now replay-parser
for i in $(seq 1 30); do
  curl --fail --max-time 2 -sS http://127.0.0.1:5600/healthz > "$B/health-after.json" && break
  sleep 1
done
export SHA
export OWNER_PID="$(systemctl show replay-parser -p MainPID --value)"
python3 - <<'PY'
import json, os
h = json.load(open('/root/oi-parser-migration/health-after.json'))
assert h['service'] == 'oi-replay-parser' and h['protocolVersion'] == 1
assert h['status'] == 'ok'
assert h['buildSha256'] == os.environ['SHA']
assert h['pid'] == int(os.environ['OWNER_PID'])
print(h)
PY
# Recheck origin/main has not moved before invoking the normal deploy scripts.
git -C /root/Dota-Stats-Full fetch origin
git -C /root/Dota-Stats fetch origin
test "$(cat "$B/release")" = "$(git -C /root/Dota-Stats-Full rev-parse origin/main)"
test "$(cat "$B/release")" = "$(git -C /root/Dota-Stats rev-parse origin/main)"
(cd /root/Dota-Stats-Full && bash deploy.sh)
(cd /root/Dota-Stats && bash community-edition/deploy.sh)
# If upstream moves during deploy, do not reopen traffic; inspect/roll back.
test "$(cat "$B/release")" = "$(git -C /root/Dota-Stats-Full rev-parse HEAD)"
test "$(cat "$B/release")" = "$(git -C /root/Dota-Stats rev-parse HEAD)"
pm2 save
```

If any command fails, leave the sites stopped (or stop any one already started),
inspect the named error and service logs, then either resume deliberately or use
rollback below. Do not rerun the entire cutover blindly.

### 3. Verify before ending maintenance

1. Compare health hash to `sha256sum current.jar`, and health PID to systemd
   `MainPID`; `ss -ltnp` must show exactly one loopback listener.
2. Confirm both PM2 logs say `External parser ready` with the same build/PID.
   Use fresh timestamps; do not flush logs.
3. Upload a known-good replay to **each** edition; confirm match recording and
   parser stderr diagnostics. Retry a known failing replay only if needed for
   diagnosis; this change does not repair corrupt/incompatible replay data.
4. Record health PID/start time. Restart `oi-bot` only, then `inhouse-bot` only.
   The parser PID/start time must not change and each edition must still parse.
5. With no in-flight replay, `systemctl restart replay-parser`. Both clients
   should report unavailable briefly and ready within their next five-second
   checks. Confirm the PID changes, hash stays the same, and both can parse.
6. Read stderr and journal; no bind conflicts or restart loop. Confirm log files
   exist and logrotate's debug output accepts the policy. Keep backups.

These are production acceptance checks for the operator, not claims that they
have been run by the agent. Local tests exercise the packaged Java process,
ownership conflicts, client restart/recovery and persistent file output.
The Replit container does not run systemd as PID 1, so host-specific systemd
boot/restart/logrotate behavior must be confirmed here.

## Lifecycle-only rollback (also interrupts both sites)

This restores the two saved active app lifecycle files and each checkout's old
JAR, not an unrelated whole-release rollback. It intentionally reintroduces the
old ownership weakness temporarily. Keep saved commit IDs for a whole-release
rollback if other deployed changes require it. Do not run a normal deploy
after restoring these files: it would overwrite them. Coordinate the subsequent
fix/redeploy. Never allow legacy apps to run alongside the new service.

```bash
set -euo pipefail
B=/root/oi-parser-migration
test -s "$B/full-replayParser.js"
test -s "$B/community-replayParser.js"
test -s "$B/full-before.jar"
test -s "$B/community-before.jar"
read -r -p 'Approved rollback interruption: type ROLLBACK: ' CONFIRM
test "$CONFIRM" = ROLLBACK
pm2 stop oi-bot inhouse-bot
systemctl disable --now replay-parser
test "$(ss -H -ltn 'sport = :5600' | wc -l)" -eq 0
cp "$B/full-replayParser.js" /root/Dota-Stats-Full/src/replay/replayParser.js
cp "$B/community-replayParser.js" /root/Dota-Stats/community-edition/src/replay/replayParser.js
cp "$B/full-before.jar" /root/Dota-Stats-Full/odota-parser/target/stats-0.1.0.jar
cp "$B/community-before.jar" /root/Dota-Stats/odota-parser/target/stats-0.1.0.jar
# Preserve service config and logs instead of deleting evidence.
if test -f /etc/systemd/system/replay-parser.service; then
  mv /etc/systemd/system/replay-parser.service "$B/replay-parser.service.disabled"
fi
systemctl daemon-reload
pm2 restart oi-bot --update-env
READY=0
for i in $(seq 1 40); do
  if curl --fail --max-time 2 -sS http://127.0.0.1:5600/healthz; then READY=1; break; fi
  sleep 1
done
test "$READY" -eq 1
# Start the second legacy client only after the first listener is healthy.
pm2 restart inhouse-bot --update-env
pm2 save
ss -ltnp 'sport = :5600'
```

Confirm both sites parse again. Keep `/opt/oi-replay-parser`, logs, logrotate
policy and the backup directory for diagnosis; the service is disabled and
unregistered. If failure occurred before service installation, skip only the
`systemctl disable` command after confirming no such service exists. If a
legacy parser is still occupying the port, identify it manually as in cutover;
do not automatically evict it.

## Subsequent parser upgrades (separate approval)

Rebuild/test the JAR and stage it to a **new hash-named** release file. Never
overwrite an active JAR. Record `readlink /opt/oi-replay-parser/current.jar`,
wait for parses to drain, obtain interruption approval, replace the symlink
atomically (`ln -s releases/NEW_HASH.jar current.jar.next` then
`mv -Tf current.jar.next current.jar`), and restart **only** `replay-parser`.
Verify health SHA/PID and both uploads. To roll back, restore the recorded
symlink atomically and restart the service. Neither app deploy script should
change that symlink or restart Java.

## Local verification

```sh
bash scripts/build-parser.sh
node --test --test-force-exit tests/replayParserLifecycle.test.js community-edition/tests/replayParserFailure.test.js
```

Tests use an ephemeral port for Java and fake health servers, so they do not
touch an existing port 5600 listener. For local manual parsing, explicitly run
`java -jar odota-parser/target/stats-0.1.0.jar` in its own terminal/service;
starting or stopping either app will leave it alone.
