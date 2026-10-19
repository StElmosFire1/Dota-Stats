---
name: Prod bot-host ops are user-run
description: How to perform ops on the production bot host — the agent has no SSH access; the user pastes command blocks.
---

# Prod bot-host ops are user-run (no agent SSH)

**Orphaned production parser:** On 2026-10-19 the shared Java parser was observed
running since September 22 with parent PID 1 and stderr pointing to a socket,
while application logs showed adoption of an existing parser.

**Why:** Restarting an app can reuse an old parser process; app logs alone may
not expose the currently serving parser's exceptions.

**How to apply:** Check the listener's parent, start time and stderr destination
before assuming an app restart refreshed the parser or that absent Java errors
prove no parsing exception. Do not kill the shared listener without warning
that both editions' replay processing may be interrupted.

**Parser reset diagnosis:** A fresh parser with working stderr exposed a Clarity
binary-decoding exception behind an upload's curl “send failure / connection
reset.” The restart restored diagnostics but did not resolve that replay.

**Why:** A parser can abandon a request while curl is still sending its body;
the transport error alone does not distinguish an incompatible/corrupt replay
from a crashed service or memory exhaustion.

**How to apply:** Obtain the Java exception before choosing a fix. Check the
dependency version embedded in the deployed JAR, not only the source POM, and
validate a proposed compatibility update with the failing replay.

**Packaging caveat:** Clarity's own Maven pom.properties is absent from the
bundled parser JAR, including the production build inspected by the owner.
The parser's embedded com.opendota/stats/pom.xml is available in the workspace
build and records its declared Clarity dependency.

**Why:** Requesting the dependency's pom.properties returned “filename not
matched,” despite Clarity classes demonstrably running.

**How to apply:** Inspect the archive inventory or embedded parser POM instead.
Distinguish a build-declared version from independently verified binary contents,
and exclude commented-out dependency examples when reading XML.

The Replit workspace has NO SSH key for the bot host (`root@170.64.182.110`, "Dota Stats" droplet). All prod-host operations are done by giving the user a single idempotent copy-paste bash block (via AskQuestion) and verifying from the pasted output.

**Why:** `ssh root@170.64.182.110` from the workspace fails `Permission denied (publickey)`; historically every prod change (RCON rotation, env edits, pm2 restarts) went through user-pasted blocks.

**How to apply:**
- Make blocks idempotent and self-verifying (print before/after state, tail logs). Users sometimes run them in the wrong shell — the Replit workspace prompt is `~/workspace$`, the host prompt is `root@Dota-Stats:~#`; check the prompt in pasted output before trusting it.
- Preserve incident logs. Use pre-restart line offsets or `tail -n 0 -F` to separate new output from historical errors; do not use `pm2 flush` during diagnosis.

  **Why:** Untimestamped historical parser bind errors looked relevant to current
  upload failures. Clearing logs would remove evidence without establishing causality.
- The prod checkouts track their own GitHub origin, which can lag this workspace (unpushed commits). `grep -c` a marker string in the deployed file to confirm whether a code path even exists on prod before expecting its log lines.

**npm install silent deaths:** deploy scripts run `npm install --silent` under `set -e`, so an npm failure kills the deploy with NO error text — the step banner is the last line. Always re-run without `--silent` to see the real error. A corrupted node_modules (ENOTEMPTY rename error from an earlier interrupted install) masquerades as missing dev deps ("eslint: not found"); fix is `rm -rf node_modules` + fresh install.

**Lockfile registry poisoning:** npm installs run inside the Replit workspace rewrite package-lock.json resolved URLs to `http://package-firewall.replit.local/npm/...`. Prod can't resolve that host → npm install hangs forever with EAI_AGAIN retries. post-merge.sh now auto-rewrites lockfiles to registry.npmjs.org before pushing; if a hang recurs, grep lockfiles for package-firewall first.
