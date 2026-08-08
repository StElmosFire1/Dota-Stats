---
name: Test suite & deploy gate quirks
description: node --test needs --test-force-exit; some tests fail only in the Replit dev env; suite is >5 min.
---

- The full `node --test tests/` suite never exits on its own — background intervals/handles in required modules keep the process alive. The npm `test` script must keep `--test-force-exit` or anything gating on it (deploys, CI) hangs forever.
- **Why:** the prod deploy script runs the full suite as a hard pre-restart gate; a hang blocks all deploys silently.
- A handful of tests (draft deadline, pick'em paywall, notification-defaults matrix, superuser route manifest, voice-pack premium) fail in the Replit dev environment even on a clean checkout — dev DB state / route drift, not your diff. Baseline first: `git stash && node --test --test-force-exit <files>` before blaming new changes.
- **How to apply:** the suite takes >5 min; chunk test files across multiple shell calls (300s cap) when verifying locally.
- Deploy health probes must read PORT from the PM2 process env (`pm2 jlist` → `pm2_env.env.PORT`), not the deploy shell — PM2 carries the bot's real port and the shell usually doesn't have it exported.
