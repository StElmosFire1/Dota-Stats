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
- **Owner can never be locked out by a missing env var:** `parseSuperuserSteamIds()`
  always adds a hardcoded `DEFAULT_OWNER_STEAM_ACCOUNT_ID` (the owner's public
  32-bit accountId) on top of whatever `SUPERUSER_STEAM_IDS` lists — mirroring the
  `OWNER_DISCORD_ID || '<default>'` fallback in `src/discord/bot.js`. So the owner
  bypasses the lockdown gate + gets superuser even when `SUPERUSER_STEAM_IDS` is
  unset/typo'd. **Why:** an unset env var on the self-managed VPS repeatedly hard-locked
  the owner out with no web recovery; the hardcoded default removes that single point of
  failure. **Everyone else still fails closed** — non-owners not on `SUPERUSER_STEAM_IDS`
  get no elevation. Set the env var only to add co-owners.
- **`SUPERUSER_PASSWORD` is optional and automation-only:** when set, the
  `x-superuser-key: <password>` header still elevates scripts / deploy hooks / the
  browser-smoke runner. The web client never sends that header, so it isn't a
  user-facing password.

**Why password-free:** the owner kept getting locked out by a separate superuser
password layered on top of the Steam binding; the Steam allow-list alone is the
trust anchor (accountId is verified server-side via Steam OpenID, session cookie is
signed), so the extra password added lockout risk without real security gain.

## FULL_SITE_LOCKDOWN gate must honour the Steam allow-list too
The private-preview gate (`lockdownMiddleware`, in `createServer()`) is a SEPARATE
check from the admin role — it must independently bypass for an allow-listed Steam
session, else the owner can sign in but never see the app. Bypass order:
env/state → `req.session.isSuperuser` → `isAllowlistedSteamSuperuser(req)` →
`x-superuser-key` header → allowed-paths. `/api/auth/complete` also stamps
`isSuperuser` on sign-in for allow-listed accounts.

**Sibling-scope trap (cost a full architect FAIL):** `createServer()` and
`createApiRouter()` are SIBLING functions. Any helper both must call
(`parseSuperuserSteamIds`, `isAllowlistedSteamSuperuser`) MUST live at module
scope. Defining them inside `createApiRouter()` makes them invisible to
`lockdownMiddleware` → `ReferenceError` only on the lockdown path (silent until
the gate is on). They're now module-scope + exported; unit-tested in
`tests/superuserSteamAllowlist.test.js`.

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
