---
name: Superuser elevation on prod (full edition)
description: How the owner reaches the admin panel; superuser is password-free and purely Steam-account-bound; why "login does nothing" is usually a stale frontend bundle.
---

# Superuser elevation (full edition, oceinhouse.gg)

The admin panel requires `req.session.isSuperuser` (session-only, never DB-stored).
Superuser is now **password-free and purely linked to the signed-in Steam account.**

## How it works
- `SUPERUSER_STEAM_IDS` is a server allow-list of 32-bit Steam account ids
  (the value on `req.session.accountId`; accountId = steamId64 − 76561197960265728).
- `getEffectiveRole()` and `requireSuperuser()` auto-grant superuser to any
  authenticated Steam session whose accountId is on that list — so an allow-listed
  owner is superuser **automatically on sign-in** (crown shows "👑 Admin", no modal,
  no password). The password-free `/admin/superuser-login` just flips the session flag.
- **Fail-closed:** an empty/unset allow-list means *nobody* can elevate via the browser.
  `SUPERUSER_STEAM_IDS` MUST be set in prod or the owner is locked out of the panel.
- **`SUPERUSER_PASSWORD` is optional and automation-only:** when set, the
  `x-superuser-key: <password>` header still elevates scripts / deploy hooks / the
  browser-smoke runner. The web client never sends that header, so it isn't a
  user-facing password.

**Why password-free:** the owner kept getting locked out by a separate superuser
password layered on top of the Steam binding; the Steam allow-list alone is the
trust anchor (accountId is verified server-side via Steam OpenID, session cookie is
signed), so the extra password added lockout risk without real security gain.

## Decisive diagnostics (do these before guessing)
- `GET /api/auth/me` in the user's normal browser returns the user JSON with
  `accountId` if the server session is alive, else 401/empty. Single best test —
  confirms both that the session persists server-side AND which accountId the
  allow-list must contain.

## "Crown login does nothing, no console error" — most likely cause
**Stale frontend bundle**, NOT auth. `pm2 restart … --update-env` reloads backend env
only; it does NOT rebuild `web/dist/`. A service worker then pins the old bundle
through a normal hard-refresh. Fix: full `cd ~/Dota-Stats-Full && bash deploy.sh`
(rebuilds web/dist) + DevTools → Application → Service Workers → Unregister + Clear
site data, then reload.

## Dead ends (don't repeat)
- **Incognito Steam sign-in failing is expected** — incognito blocks the third-party
  cookies Steam OpenID relies on. Not a valid test of prod auth; ignore it.
