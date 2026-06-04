---
name: Lockdown gate Steam sign-in loop
description: Why the FULL_SITE_LOCKDOWN private-preview gate can trap the owner in a sign-in loop, and what the gate page must do.
---

# Lockdown gate must bootstrap the Steam token exchange itself

When `FULL_SITE_LOCKDOWN` (or the DB `site_lockdown` toggle) is on, the lockdown
middleware is registered with `app.use(lockdownMiddleware)` **before**
`express.static` and the SPA `index.html` fallback. For any document navigation
with an empty/non-superuser session it serves a **static gate page**, so the
React SPA never loads.

Steam sign-in is split: `/auth/steam/return` does **not** set the session on its
302 (deliberately — avoids SameSite/Secure Set-Cookie-on-redirect edge cases).
It issues a single-use token and redirects to `/?auth=success&t=<token>`,
expecting the **SPA** to exchange it via `/api/auth/complete`. But during
lockdown the SPA never loads, so:

empty session → gate page served → no token exchange → `req.session.accountId`
never set → `isAllowlistedSteamSuperuser()` always false → bounce back to the
gate → **infinite loop.** Hardcoding the owner's accountId in the allow-list does
NOT help, because the session is empty at the moment the gate checks.

**Fix / invariant:** the gate page itself must carry an inline (CSP-nonce'd)
script that, on `?auth=success&t=`, calls `/api/auth/complete` (already in
`LOCKDOWN_ALLOWED_PATHS`) and then `location.replace('/')`. After the exchange
the session has `accountId` + `isSuperuser` (for the owner), so the reload passes
the gate and serves the SPA.

**Why:** introduced when superuser went password-free / Steam-only — the old gate
had a password form (`/api/admin/superuser-login`) that set the session
server-side, which masked the chicken-and-egg. Removing it exposed the loop.

**How to apply:** any change that gates the SPA behind a server-rendered page
(lockdown, maintenance, etc.) must keep an allow-listed path the gate page can
hit to establish the session, and the gate page must actually call it — never
assume SPA-side auth code will run. Inline gate scripts need `nonce="${nonce}"`
(scriptSrc allows `'self'` + nonce); the fetch target must be within
`connectSrc` (`'self'` covers same-origin).
