---
name: Vite proxy prefix collision
description: Plain string proxy keys in vite.config.js prefix-match SPA routes (e.g. '/api' captures /api-docs)
---

Plain string keys in Vite's `server.proxy` are prefix matches. `'/api'` also captured the SPA route `/api-docs`, handing it to the backend, which served a stale built index.html whose hashed assets 404'd → completely blank page in dev.

**Why:** discovered during the anonymous public-route sweep; only visible in dev (prod backend serves everything itself).

**How to apply:** use regex keys like `'^/api(/|$)'` for API proxies, and when adding SPA routes make sure they don't share a prefix with a proxy key. `scripts/anon-sweep.mjs` walks all public routes headlessly and flags blank/raw-error pages.
