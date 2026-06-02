---
name: Steam admin roles & live auth resolution
description: How admin/mod authorization works after the password-login removal; the "always resolve role live" rule.
---

# Steam-account admin roles (full edition)

Admin/moderator privilege is granted **per Steam account** by the OWNER (superuser),
stored in the `admin_roles` table, NOT via any password. The old UPLOAD_KEY-password
"Login" button and `POST /api/admin/login` are gone (the route now returns 410).

## The core rule: never make an auth decision on a cached `req.session.isAdmin`
`req.session.isAdmin` is only a **hint / UI-cache**, stamped at `/auth/complete` when the
live DB role is `admin`. Every actual authorization decision MUST resolve the role LIVE:

- Server source of truth: `getEffectiveRole(req)` → superuser (session flag / `x-superuser-key`) > `db.getAdminRole(accountId)` > null. Fail-closed on DB error.
- Use `isAdminOrHigher(req)` (returns true for admin|superuser) or `requireTier('admin'|'moderator')` — both call `getEffectiveRole`.
- `authMiddleware` is **async**: it re-verifies a session admin against `db.getAdminRole` on every request; machine header clients (`x-upload-key`/`x-superuser-key`) and the `isSuperuser` session flag pass directly.

**Why:** if you gate on the cached `req.session.isAdmin` flag, a revoked admin keeps
access until their session resets. Two real spots were caught this way (chat-log preview
visibility in `GET /matches/:matchId`, and the replay-download paywall/quota bypass in
`_replayDownloadHandler`) — both had to be switched to `await isAdminOrHigher(req)`.

**How to apply:** when adding any staff-gated branch, grep for `req.session.isAdmin`; the
only legitimate raw uses are the login-time stamp, the logout-time clear, and the hint in
`authMiddleware` that is immediately followed by a live `db.getAdminRole` check. Anything
else that decides access on `req.session.isAdmin` is a stale-session privilege-retention bug.

## Scope note
Legacy `authMiddleware` routes (uploads, seasons, tournaments, match meta/delete, patch
notes, hero overrides) remain the ADMIN-tier surface. A finer destructive/financial split
(e.g. forcing match-delete or payout-delete to superuser-only) was deliberately NOT done —
the user's ADMIN buckets are broad and over-tightening risks breaking admin UI flows.
