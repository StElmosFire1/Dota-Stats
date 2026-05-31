---
name: Steam avatar source
description: Where player/coach Steam avatars come from — they are NOT in our DB.
---

Steam avatar URLs are **not persisted** anywhere in our PostgreSQL schema (no `avatar`
column on `player_stats`, `nicknames`, `coaches`, or `player_profiles`). The only
source is OpenDota's player profile (`api/opendota.js` → `getPlayerProfile` →
`avatarFull`/`avatarMedium`).

**Why it matters:** any feature that wants to show an avatar must fetch from OpenDota,
whose client is **globally rate-limited (~1.1s/request, shared `lastRequest`)**. Do NOT
resolve many avatars synchronously in a hot/request path — N cold accounts = N×1.1s.

**How to apply:** cache resolved URLs in-memory (24h is the established TTL, see the
embed-avatar cache in `createServer` and the search-avatar cache at module scope in
`src/web/server.js`). For hot paths, peek the cache and warm misses in the background
rather than blocking. A `null` cache entry means "looked up, no avatar" — keep it so you
don't re-fetch.
