# OCE Inhouse — Mobile companion (Task #381)

Read-only Expo app for [oceinhouse.gg](https://oceinhouse.gg). Full edition
only — the community edition is intentionally not wired up.

## What's in scope (v0.1)

- Home, Leaderboard, Recent Matches, Match Detail, Settings.
- Steam OpenID sign-in via the in-app browser (`expo-web-browser`).
- Expo push notifications, registered against the new server-side
  `expo_push_tokens` table.
- Notification preferences mirror the website's web-push prefs (same
  `notification_prefs` rows, so toggles are shared across web + mobile).

## Out of scope (intentionally)

- Any write/mutation flow (queue join, captain draft, accept phase, hero
  signup, coaching bookings, payments).
- The inhouse lobby UI — the website stays the source of truth.
- Community-edition wiring.
- App-store submission. This first cut is for Expo Go + internal EAS dev
  builds only.

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
| GET | `/api/matches` | Recent matches list |
| GET | `/api/match/:id` | Match detail |
| GET | `/api/leaderboard` | MMR leaderboard |
| GET | `/api/player/:id` | Player profile (used downstream) |
| GET | `/api/auth/me` | Resolve account from session cookie |
| POST | `/api/auth/complete` | Exchange Steam token → session cookie |
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
in `app/_layout.tsx` — it calls `POST /api/auth/complete` and stores the
returned session cookie in `expo-secure-store`.

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
