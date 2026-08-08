---
name: Prod bot-host ops are user-run
description: How to perform ops on the production bot host — the agent has no SSH access; the user pastes command blocks.
---

# Prod bot-host ops are user-run (no agent SSH)

The Replit workspace has NO SSH key for the bot host (`root@170.64.182.110`, "Dota Stats" droplet). All prod-host operations are done by giving the user a single idempotent copy-paste bash block (via AskQuestion) and verifying from the pasted output.

**Why:** `ssh root@170.64.182.110` from the workspace fails `Permission denied (publickey)`; historically every prod change (RCON rotation, env edits, pm2 restarts) went through user-pasted blocks.

**How to apply:**
- Make blocks idempotent and self-verifying (print before/after state, tail logs). Users sometimes run them in the wrong shell — the Replit workspace prompt is `~/workspace$`, the host prompt is `root@Dota-Stats:~#`; check the prompt in pasted output before trusting it.
- When verifying via `pm2 logs`, `pm2 flush` first — old pre-restart lines otherwise mix into the grep and mislead.
- The prod checkouts track their own GitHub origin, which can lag this workspace (unpushed commits). `grep -c` a marker string in the deployed file to confirm whether a code path even exists on prod before expecting its log lines.

**npm install silent deaths:** deploy scripts run `npm install --silent` under `set -e`, so an npm failure kills the deploy with NO error text — the step banner is the last line. Always re-run without `--silent` to see the real error. A corrupted node_modules (ENOTEMPTY rename error from an earlier interrupted install) masquerades as missing dev deps ("eslint: not found"); fix is `rm -rf node_modules` + fresh install.
