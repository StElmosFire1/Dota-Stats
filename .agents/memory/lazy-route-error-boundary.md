---
name: Lazy-route chunk-load blank screen
description: Why SPA navigation blanks after a deploy, and the root-error-boundary + one-shot reload pattern that heals it.
---

# Lazy-route stale-chunk blank screen

Every route in `web/src/App.jsx` is `React.lazy()` code-split. The `<Suspense>`
around `<Routes>` had NO error boundary, so a rejected dynamic import threw past
Suspense to the root and React unmounted the whole tree → **blank white page**.

**Trigger:** a deploy changes the hashed chunk filenames. A tab opened *before*
the deploy still references the old `Foo-OLDHASH.js`, which 404s after the new
build replaces it. Navigating to that lazy route rejects its import. Hard refresh
fixes it (fresh index.html) — which is why the symptom is "blank sometimes when
clicking around, refresh helps". Frequent deploys make this routine.

**Fix (the pattern):** a root error boundary (`RootErrorBoundary`) wraps the
Suspense/Routes *inside* `<main>` so `<Nav>` stays outside and usable on error.
- Detect chunk errors by message regex (`Failed to fetch dynamically imported
  module` / `Importing a module script failed` / `ChunkLoadError` / `Loading
  chunk … failed`, etc. — phrasings differ per browser).
- On a chunk error, `window.location.reload()` exactly once, guarded by a
  per-tab `sessionStorage` timestamp (15s window) so a still-broken reload shows
  an actionable fallback instead of looping.
- Reset boundary error state on navigation via `getDerivedStateFromProps` keyed
  on `location.pathname` — clicking a nav link recovers without remounting the
  Suspense subtree.

**Why:** without a boundary, lazy-import rejection = full-app unmount, not a
local error. Any new top-level Suspense/lazy tree needs the same guard.

**How to apply:** if a page goes blank only *sometimes* and a refresh fixes it,
suspect stale-chunk import failure (a deploy just happened), not a render bug.
