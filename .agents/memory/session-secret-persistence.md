---
name: Session secret must persist across restarts
description: Why signed-in users (and the lockdown gate) get logged out on every deploy, and the fix.
---

# Symptom
Everyone gets logged out — bounced to Steam sign-in and (full edition) the owner-only
lockdown password prompt — after *every* deploy/restart, even moments after logging in.

# Cause
The `express-session` cookie is signed with `SESSION_SECRET`. If that signing key
changes, all existing signed cookies become invalid (rejected), which reads as a
logout even though the session row still exists in the Postgres store. The non-prod
boot path used to mint a brand-new random secret on every start, so each restart
rotated the key. The post-merge hook auto-deploys after every batch, so this fired
constantly on the self-hosted PM2 box (which runs with `NODE_ENV` unset → non-prod path).

**Why:** stable cookie signature is the *only* thing tying a browser to its stored
session across restarts; rotating the secret silently invalidates every session.

# Fix / how to apply
- Production: still hard-fail (`process.exit(1)`) if `SESSION_SECRET` env is missing/<32
  chars — both editions. Never fall back to a generated/predictable secret in prod.
- Non-prod / env unset: persist a generated 48-byte secret to a **gitignored**
  `.session-secret` file and reuse it across boots. Survives `git reset --hard`
  (deploy.sh does NOT `git clean`). Use exclusive-create (`flag:'wx'`) so concurrent
  worker starts agree on one secret. The recommended real fix is to set a permanent
  `SESSION_SECRET` env var on the host.
- Never ship a predictable hardcoded default secret (forgeable sessions — threat-model
  violation). Community edition previously did this.
