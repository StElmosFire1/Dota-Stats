---
name: Browser-smoke baseline capture vs site lockdown
description: Why the browser-smoke runner must have FULL_SITE_LOCKDOWN off to capture/compare real baselines, and that baseline capture is a prod-host-only operation.
---

# Browser-smoke baselines require lockdown OFF

The full-edition lockdown gate (`lockdownMiddleware` in `src/web/server.js`) only
bypasses for a **superuser** session (`req.session.isSuperuser`) or the
`x-superuser-key` header. The browser-smoke runner (`src/smoke/runner.js`)
authenticates via `/auth/steam/test-login`, which produces a *normal user*
session — that does **not** bypass the gate.

**Consequence:** if the lockdown gate is ON (env `FULL_SITE_LOCKDOWN=1`, or the
DB-backed AdminPanel toggle) when a smoke run executes, every HTML journey
screenshots the inline "Sign in" gate page and `/api/health` returns 401. So:
- Capturing baselines while locked down poisons all baselines (they become 12
  copies of the sign-in page).
- Even routine weekly/post-merge smoke runs silently fail / mis-compare whenever
  lockdown is toggled on.

**How to apply:**
- Before capturing baselines (Admin → `/admin/browser-smoke` → ▶ Run smoke now →
  Approve new baseline per step), turn OFF the lockdown toggle
  (Admin → Overview → "🔒 Site lockdown"); re-enable after.
- Baseline capture is a **prod-host-only** operation — it needs a shell on the
  prod host (`npx playwright install chromium` once) and a superuser browser
  session. It cannot be done from the isolated dev environment.

**Why:** the captured baseline must be exactly what prod's own runner renders;
the 1% pixel-diff threshold absorbs cross-renderer jitter but not a wholesale
"sign-in page vs real content" difference.

**Durable fix (implemented):** the smoke runner now sends `x-superuser-key:
$SUPERUSER_PASSWORD` on the whole Playwright context (`browser.newContext({
extraHTTPHeaders })`) so document navs, subresources, the page's own XHR/fetch,
and the asJson probes all bypass the lockdown gate — runs/baseline-capture work
whether or not lockdown is on. The header only bypasses the gate and elevates
preview-state feature flags; it does NOT flip the session into superuser (the
frontend reads `/admin/session-status`, which is session-only), so pages still
render as the normal signed-in user. When `SUPERUSER_PASSWORD` is unset the
runner probes `/api/health`; a 401 (the gate's signature) makes it bail with a
clear `_lockdown` SKIPPED step instead of screenshotting the gate page.

**Caveat:** because the header elevates *preview-state* feature flags, baselines
captured before this change (no header) may need a one-time re-approval if any
preview flag affects a journey page.

## Journey `expect` selectors: lead with one that actually renders

The runner's selector check (`src/smoke/runner.js`) is: do a quick `count()` on
each comma-separated selector; if none hit (it races SPA hydration, so an
unmounted React page legitimately misses), wait for **any** of them up to 5s.
*Before this was fixed it waited on only the **first** selector* — so a journey
whose first selector never exists (e.g. `/inhouse` listed `.inhouse` but the page
has no such class and only renders `<h1>` after a `Loading…` state) was a
**deterministic** false failure, not flake.

**How to apply:** when adding/editing a journey in `src/smoke/journeys.js`, the
`expect` list must contain at least one selector that genuinely renders on that
page; prefer leading with a stable one (`h1`, `main`, a real class). Don't invent
a class name that "should" be there — verify against the component. The runner now
waits on any listed selector, but a list where *none* match still fails.

## Fresh context = site-wide modals re-pop on every screenshot

The runner uses a brand-new Playwright context per run, so any modal gated on a
localStorage "dismissed" flag (the `WelcomeModal` "what's new", keyed
`welcome_modal_dismissed_v<n>` where the version is fetched at runtime; the
onboarding nudge keyed `onboarding_modal_seen`) overlays **every** journey.

**How to apply:** the runner pre-suppresses these via `context.addInitScript`
(intercepts `localStorage.getItem` to report any `welcome_modal_dismissed_v*` key
as set + seeds `onboarding_modal_seen`). Any *new* global modal added to
`web/src/App.jsx` that gates on a stored flag will start poisoning baselines until
its flag is added to that init script. Symptom: every baseline shows the same
centered popup.
