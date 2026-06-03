---
name: Superuser elevation on prod (full edition)
description: How owner reaches the admin panel; why "login does nothing" is usually a stale frontend bundle, not auth.
---

# Superuser elevation (full edition, oceinhouse.gg)

Admin panel requires `req.session.isSuperuser`. It is **session-only**, never DB-stored.
The ONLY way to set it is `POST /api/admin/superuser-login` (the crown → Superuser Login modal).
There is no "permanent DB superuser" by design — the env binding IS the permanent mechanism.

## Order of checks in the login handler
1. Password vs `SUPERUSER_PASSWORD` first → wrong → `401 {"error":"Invalid password"}`.
   (If the route returns 401 for a bogus password, `SUPERUSER_PASSWORD` is set; a 503 means unset.)
2. THEN the Task #749 Steam binding: if `SUPERUSER_STEAM_IDS` is non-empty, the request must
   have an authed Steam session AND `req.session.accountId` must be on that list, else 403
   "sign in with Steam first". Empty/unset list = binding disabled (password alone elevates).
3. The `x-superuser-key: <SUPERUSER_PASSWORD>` header path is NOT bound (scripts/automation only);
   the browser uses session-based superuser, never sends the password as a reusable header.

## Decisive diagnostics (do these before guessing)
- `GET /api/auth/me` in the user's normal browser: returns the user JSON with `accountId` if the
  server session is alive, else 401/empty. This is the single best test — it confirms both that the
  session persists server-side AND which accountId the binding will match.
- accountId = steamId64 − 76561197960265728.

## "Crown login does nothing, no console error" — most likely cause
**Stale frontend bundle**, NOT auth. `pm2 restart … --update-env` reloads backend env only; it does
NOT rebuild `web/dist/`. A service worker then pins the old bundle through a normal hard-refresh.
Fix: full `cd ~/Dota-Stats-Full && bash deploy.sh` (rebuilds web/dist) + in-browser
DevTools → Application → Service Workers → Unregister + Clear site data, then reload.
The modal now wraps the login fetch in try/catch + try/finally so a blocked/thrown request surfaces
a clear message instead of silently doing nothing.

## Dead ends (don't repeat)
- **Incognito Steam sign-in failing is expected** — incognito blocks the third-party cookies Steam
  OpenID relies on. Not a valid test of prod auth; ignore it.
