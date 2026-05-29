# OCE Inhouse — Mobile companion (Task #381, write actions added in #414)

Expo app for [oceinhouse.gg](https://oceinhouse.gg). Full edition only —
the community edition is intentionally not wired up.

## What's in scope (v0.2 — Task #414)

Read-only surface from v0.1 (Home, Leaderboard, Recent Matches, Match
Detail, Settings, Steam sign-in, Expo push registration), PLUS the most-
requested write actions:

- Lobby ready-check accept / decline
  (`POST /api/inhouse/:id/accept` and `/decline`).
- Post-match MVP vote
  (`POST /api/matches/:id/mvp-vote` — added in #414).
- Scrim respond — accept / decline
  (`POST /api/scrims/:id/respond`).
- Roster-transfer respond — approve / decline
  (`POST /api/roster-transfers/:id/respond`).
- Coach booking, both 1:1 and VOD (cash or plan redemption)
  (`POST /api/coaches/:id/book`, `POST /api/coaches/:id/vod-review`).
- Coach booking-reminder ack
  (`POST /api/bookings/:id/reminder-ack` — added in #414).

Push notifications encode the action URL as `data.url` (e.g.
`/action/ready-check/123`). Tapping the push opens straight onto that
screen via the deep-link router in `app/_layout.tsx`. A 401 from any
write action raises a single app-wide reauth modal.

## Offline write-action queue (Task #460)

If the network drops mid-tap (flaky transit Wi-Fi), a write action no
longer fails with a red error and loses the user's intent. Instead:

- The api client (`lib/api.ts`) detects a *network-level* failure (no HTTP
  response) on any write opted in via `queue: { kind }` and persists the
  `{ method, path, body }` triple to an AsyncStorage-backed queue
  (`lib/offlineQueue.ts`), then throws a `QueuedError`.
- The action screen shows an amber "Queued — will retry when online"
  affordance (via `actionErrorState` in `components/ActionShell.tsx`)
  instead of the red error.
- A foreground drainer wired to `NetInfo` + `AppState` (started once in
  `app/_layout.tsx` via `startOfflineQueue`) replays the queue the moment
  connectivity is restored, in tap order, single-flight.
- Per-kind TTLs (`ready-check` 2 min, `mvp-vote` / `booking-reminder` 1 h,
  `scrim` 6 h, `roster-transfer` 1 day) drop stale intents so a queued
  ready-check accept never fires after the accept window closes.
- Any HTTP response on replay (even a 4xx) counts as delivered and the
  intent is dropped; only true network failures keep it queued. Coach
  booking / VOD review are NOT queued — they need an interactive Stripe
  Checkout hand-off, so deferring them makes no sense.

Requires `@react-native-async-storage/async-storage` and
`@react-native-community/netinfo` (run `npx expo install` after pulling).

## Out of scope (intentionally)

- Any other write/mutation flow (admin panel, queue management,
  captain draft).
- iOS / Android app-store submission (EAS build pipeline only).
- Community-edition wiring.

## Running locally

```bash
cd mobile
npm install
npx expo start
```

The app talks to `https://oceinhouse.gg` by default (configured via
`expo.extra.apiBase` in `app.json`). To point at a local dev server,
either edit `app.json` or set the override before starting:

```bash
EXPO_PUBLIC_API_BASE=http://10.0.0.42:5000 npx expo start
```

Note: when developing against a local server you must use your machine's
LAN IP (not `localhost`) so the phone can reach it, AND you'll need to
add a CORS allow-list entry on the server (`CORS_ALLOWED_ORIGINS`) only
if you're testing on the web target — native fetches do not send an
`Origin` header.

## Server endpoints used

All routes already exist on the server, plus the three added in this
task:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/matches?limit=&offset=` | Paginated recent matches list (page size 25) |
| GET | `/api/matches/:matchId` | Match detail |
| GET | `/api/leaderboard` | MMR leaderboard |
| GET | `/api/players/:accountId` | Player profile (MMR, rank, wins/losses) |
| GET | `/api/players/:accountId/recent-matches?limit=5` | Last N matches for Home card |
| GET | `/api/players/:accountId/streak` | Current W/L streak |
| GET | `/api/auth/me` | Resolve account from session cookie |
| GET | `/api/auth/complete?t=<token>` | Exchange Steam token → session cookie (single-use, 2-min TTL) |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/me/notifications` | List push preferences |
| POST | `/api/me/notifications` | Update push preferences |
| **POST** | **`/api/me/expo-push/register`** | **New: store an Expo push token** |
| **POST** | **`/api/me/expo-push/unregister`** | **New: revoke a token** |
| **POST** | **`/api/me/expo-push/test`** | **New: send a test push** |

The server's existing imminent-push dispatcher
(`/internal/inhouse/:id/imminent-push`) now fans out to Expo tokens in
addition to VAPID web-push subscribers — preferences are checked once
per account and both transports share the same gate.

## Deep linking

The Steam OpenID hand-off uses `expo-web-browser`'s `openAuthSessionAsync`
with the redirect URL `oceinhouse://?t=<token>`. The redirect is handled
in **exactly one place — `app/_layout.tsx`** — which calls
`GET /api/auth/complete?t=<token>` and stores the returned session cookie
(captured from the `Set-Cookie` response header) in `expo-secure-store`.

The token is single-use and lives for 2 minutes on the server, so the
sign-in screen deliberately does NOT also try to consume it — otherwise
the layout handler and the screen would race and one of them would get a
spurious "invalid or expired token" error.

The redirect scheme is strictly allow-listed to `oceinhouse://` on the
server (both when stashing `mobile_redirect` in the session and when
consuming it after the Steam round-trip). `exp://`, `http(s)://`, and
everything else are rejected, so the single-use Steam auth token cannot
be redirected to an attacker-controlled Expo experience.

## Session storage

We re-attach the express-session cookie (`oi.sid=...`) on every request
because React Native does not implement a browser-style cookie jar.
Cookie value lives encrypted at rest via `expo-secure-store`.

## Assets

`assets/icon.png`, `assets/splash.png`, and `assets/adaptive-icon.png`
are referenced by `app.json` but not committed. Drop in the OA logo
(1024×1024 PNG) before the first EAS build — Expo will surface a clear
error if they're missing.

## What's deliberately not here

- **No** `ios/` / `android/` native projects committed. Use EAS Build
  (`eas build --profile development --platform ios`) when ready.
- **No** package-lock — the root repo's lockfile only covers the bot +
  web bundle, and the mobile app installs into its own `node_modules`.
- **No** CI yet — the existing pre-deploy gates (parser, a11y,
  community paywall) intentionally skip `mobile/`.
