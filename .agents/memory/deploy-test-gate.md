---
name: Test suite & deploy gate quirks
description: node --test needs --test-force-exit; some tests fail only in the Replit dev env; suite is >5 min.
---

- The full `node --test tests/` suite never exits on its own — background intervals/handles in required modules keep the process alive. The npm `test` script must keep `--test-force-exit` or anything gating on it (deploys, CI) hangs forever.
- **Why:** the prod deploy script runs the full suite as a hard pre-restart gate; a hang blocks all deploys silently.
- A handful of tests (draft deadline, pick'em paywall, notification-defaults matrix, superuser route manifest, voice-pack premium) fail in the Replit dev environment even on a clean checkout — dev DB state / route drift, not your diff. Baseline first: `git stash && node --test --test-force-exit <files>` before blaming new changes.
- **How to apply:** the suite takes >5 min; chunk test files across multiple shell calls (300s cap) when verifying locally.
- Deploy health probes must read PORT from the PM2 process env (`pm2 jlist` → `pm2_env.env.PORT`), not the deploy shell — PM2 carries the bot's real port and the shell usually doesn't have it exported.
- The two editions intentionally have different health fingerprints on the same host: full normally owns :3001 and returns `{ok,services,...}`; community normally owns :5000 and returns `{status,db,uptime,version}`. The community responder must never be called “stray” or stopped just because the full deploy gate rejects its response shape.
- **Why:** the community process was once mistaken for a port-5000 squatter and removed, causing a real 502 on `dota.stats.corvidaeinc.com`.
- **How to apply:** full deploy scans ports but accepts only the `services` fingerprint; community deploy accepts only `status:"ok"`, `db:true`, and `version`. Diagnose/restart by PM2 process name (`oi-bot` vs `inhouse-bot`), never by killing a port owner solely from its health shape.
