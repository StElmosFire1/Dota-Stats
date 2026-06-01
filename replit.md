# Dota 2 Inhouse Stats Bot

## Overview
Node.js Discord bot + React/Express dashboard for an OCE Dota 2 inhouse community. Replay parsing (local OpenDota Java parser), TrueSkill MMR, real-time lobby monitoring, season management, prize pools, FACEIT-style inhouse lobbies, Stripe-backed monetisation, and a coaching marketplace. Two editions deploy side-by-side (see "Editions & deploys" below).

## User Preferences
- **Iterative development.** Core feature first, refine after. Prioritise robust error handling and graceful degradation. Explain complex technical decisions concisely.
- **Patch notes.** After completing a meaningful batch of changes, add a single grouped entry to `src/data/patchNotes.js`, incrementing the version. Group related work into one note rather than one per change — publish only when there's a significant set of work to describe. Do this automatically, never wait to be asked.
- **GitHub push.** After every batch the post-merge hook (`scripts/post-merge.sh`) auto-pushes to GitHub using `GITHUB_PERSONAL_ACCESS_TOKEN`. If a manual push is needed, the credential one-liner is:
  ```
  git -c credential.helper='!f() { echo "username=StElmosFire1"; echo "password=${GITHUB_PERSONAL_ACCESS_TOKEN}"; }; f' push origin HEAD:main
  ```
  The hook self-heals non-fast-forward rejections by reading the live remote SHA (`ls-remote`), fetching it by SHA, and force-with-lease pushing local HEAD **whenever it can prove no real remote work would be lost**. It auto-resolves all four normal cases: (1) remote is an ancestor of HEAD (strictly ahead); (2) remote/HEAD differ only in allowed paths (`artifacts/mockup-sandbox/src/.generated/`, `attached_assets/`); (3) **remote tip is a re-commit of a recent local ancestor** — the platform routinely re-commits a merge under a new SHA, and once local has advanced past it, remote is no longer an ancestor and `diff(remote..HEAD)` shows all our newer work, so the hook instead checks whether `remote_sha`'s tree matches *any* local ancestor's tree (modulo allowed paths); if so every byte on remote is already in local history and the push is lossless. This case used to require a manual reconciliation task on every queued batch of merges — it is now automatic. **Only genuine remote-only work** — where `origin/main` carries a unique commit local lacks that is NOT a re-commit of any recent local ancestor — is deferred: treated as **non-fatal** (warn + `exit 0`), the hook refuses to force-push (so it never clobbers real remote work) but does NOT fail post-merge setup, because lossless reconciliation needs a merge commit + conflict resolution that only the dedicated "push outstanding commits to GitHub" task can perform.

## Editions & deploys
Two checkouts side-by-side on the prod host. Each edition has its own deploy script — they are deliberately independent so a mistaken invocation can never cross-deploy.

| Edition | Domain | Checkout | Deploy command | PM2 process | Entrypoint |
|---|---|---|---|---|---|
| Full | `oceinhouse.gg` | `~/Dota-Stats-Full/` | `cd ~/Dota-Stats-Full && bash deploy.sh` | `oi-bot` | `src/index.js` (serves `web/dist/`) |
| Community | `dota.stats.corvidaeinc.com` | `~/Dota-Stats/` | `cd ~/Dota-Stats && bash community-edition/deploy.sh` | `inhouse-bot` | `community-edition/src/index.js` (serves `community-edition/web/dist/`) |

Both scripts: `git reset --hard origin/main` → run the safety gates below → `npm install` + `npm run build` in the edition's web dir → `pm2 restart <name> --update-env`. Always confirm you're in the correct checkout before deploying.

**Community edition is paywall-free by policy** (see `community-edition/SETUP.md`). Pro tier, Stripe, and every paywall touchpoint is full-edition-only.

### Pre-deploy safety gates
All gates run in both `deploy.sh` and `scripts/post-merge.sh`. The scripts are the source of truth — the summary here is just so I know what's protecting me. Any gate failure aborts the deploy / GitHub push before PM2 is touched.

1. **Parser-jar freshness** (`scripts/build-parser.sh --check`, also `npm run check:parser`). Fails if the committed `odota-parser/target/stats-0.1.0.jar` is older than any file under `odota-parser/src/` or `odota-parser/pom.xml`. No JDK required — never invokes Maven.
2. **A11y gate** (`scripts/check-a11y.js`, also `npm run check:a11y`). Six passes enforcing the frontend house rules below. See `docs/a11y-gates-history.md` for per-pass detail.
3. **Community paywall gate** (`scripts/check-community-paywall.sh`). Source-scan pass (runs before build, fails fast) plus dist-scan pass (after build). Allow-list: `community-edition/SETUP.md`, `community-edition/README.md`, `community-edition/src/data/patchNotes.js`.
4. **Wrong-edition + PM2-entrypoint gates** (inline in each `deploy.sh`). Aborts if the checkout's directory basename looks wrong for its edition, AND verifies via `pm2 jlist` that the target PM2 process's `pm_exec_path` + `pm_cwd` actually point at this checkout's entrypoint. First-time deploys (no PM2 process yet) are a no-op. If gate 4 fires, the abort message points at the one-time PM2 re-registration snippet (see below).
5. **Patch-notes uniqueness** (`scripts/check-patch-notes.js`, also `npm run check:patch-notes`). Asserts every entry in `src/data/patchNotes.js` has a unique `version`. Replaces the silent runtime warning `db.seedPatchNotes()` used to emit on every bot boot.

### One-time PM2 re-registration (community edition)
If `pm2 describe inhouse-bot | grep -E 'script path|cwd'` shows the full-edition entrypoint, re-register once:
```
pm2 delete inhouse-bot
cd ~/Dota-Stats && pm2 start community-edition/src/index.js --name inhouse-bot --update-env
pm2 save
```

### Java replay parser
`odota-parser/target/stats-0.1.0.jar` is rebuilt automatically on deploy/start by `scripts/build-parser.sh` (invoked from `npm prestart`, the Replit `[deployment].run` command, and the post-merge hook). Only re-runs `mvn install -DskipTests` when stale. Force a rebuild: `npm run build:parser`.

## Branding
**OCE Inhouse** under the OA logo (`web/public/oa-logo.png` + `favicon.png`). Palette: **Hybrid · Court & Pitch** — ink-navy `#0d1424`, brass `#c5a975`, amber `#f59e0b`, parchment `#f5efe2`. CSS tokens in `web/src/styles.css`: `--bg-primary`, `--accent`, `--gold`, `--brass`, `--amber`, `--parchment`, `--ink-navy`. Fonts: Inter (`--font`, body), Oswald (`--font-condensed`, eyebrows), **Playfair Display (`--font-serif`, headlines/editorial text)**, **Newsreader (`--font-num`, numeric stats — apply via the `.pb-num` helper for tabular lining figures)**. Type rule of thumb: text → Playfair, numbers → Newsreader.

## Architecture (high level)
- **Data recording:** local OpenDota Java parser + real-time Dota 2 GC lobby monitoring + friend-lobby auto-detection + OpenDota fallback for practice lobbies.
- **Player rating:** TrueSkill with 8-tier ladder. PERF score (1.0–10.0, position-aware, duration-normalised) persisted in `player_stats.perf` with breakdown in `perf_breakdown`. Targets in `src/perf/perfWeights.config.js`. Backfill: `!perf-backfill [limit]`.
- **Monetisation:** Stripe for Pro membership, tournament buy-ins, prize pools, frame purchases, gift checkouts, coaching marketplace (Stripe Connect Express). In-app coin currency (v6.79) for individual cosmetic unlocks — priced above Stripe equivalents so it's an alternative path, not a shortcut. See `src/web/server.js` `COIN_PRICES` for the catalog.
- **Inhouse lobby system** (`/inhouse`, full edition only): FACEIT-style flow — sign-in → position registration → timed accept → captain draft → auto-provisioned dedicated server on 10th pick (via `src/inhouse/serverProvisioner.js`, single-flight Set + recovery sweep in `autoStartTicker.js`). Failed provision → `server_failed` state with captain-visible Retry + admin Discord ping.
- **Hero meta / draft assistant:** position-specific win rates + live counter-pick scoring.
- **Notifications:** preference-driven web push + post-match DMs + MVP/hot-streak alerts.
- **Modularity:** Discord, Steam, Lobby, API, Stats, Sheets, Replay each in their own module. Graceful degradation — non-critical components can be missing without breaking the core. Java parser runs as a child process.

## Frontend accessibility house rule
Every clickable thing in `web/src/` and `community-edition/web/src/` must be keyboard-reachable, screen-reader-labelled, and operable without a mouse. The a11y gate (`npm run check:a11y`) enforces all six rules:

1. **No `<div onClick>` for actions.** Use `<button type="button">`, or if button-in-button is invalid HTML, add `role="button"` + `tabIndex={0}` + `onKeyDown` (Enter/Space) + `aria-label`. Toggles need `aria-expanded` / `aria-pressed` / `aria-checked`.
2. **Sortable table columns** use the shared `SortableTh` component — never raw `<th onClick>`.
3. **Modals/dialogs** use the shared `<Dialog>` primitive (handles backdrop, `role="dialog"`+`aria-modal`, focus capture/restore/trap, body-scroll lock, Escape-to-close). Pass `labelledBy` or `label`. To exempt a file, add it to `DIALOG_ALLOWLIST` in `scripts/check-a11y.js`.
4. **Hover-only reveals are forbidden.** Anything that appears on `:hover` must also appear on `:focus`/`:focus-within` and work on touch (`@media (hover: none)`).
5. **Custom toggle/switch/radio shapes** use the matching ARIA role (`role="switch"`+`aria-checked`, or `role="radiogroup"` + `role="radio"`).
6. **Icon-only buttons** carry an `aria-label`. `title=` is NOT a substitute.

`scripts/check-a11y.js` is authoritative; per-pass detail in `docs/a11y-gates-history.md`; synthetic coverage in `tests/checkA11y.test.js`. If a new clickable shape doesn't fit one of these, add the shape and document it here before it spreads.

## Test coach end-to-end (Task #312)
Stripe Connect Express requires real KYC, so dev-testing the coaching marketplace UI needs a shortcut.

**Path A — UI only (no real Stripe):** Admin Panel → 🎓 Coaching → **🧪 Test: Promote to Coach (skip Stripe Connect)** → leave `account_id` blank to use your superuser account → click *Promote to coach*. Calls `POST /api/admin/coaching/promote-test-coach` (superuser-only), inserts a `coaches` row with synthetic `acct_test_<accountId>_<ts>` + status `active`. Editor, availability, public profile, and `/coaches` listing all work. Bookings will fail at Checkout creation because the synthetic id isn't real — use Path B for full E2E.

**Path B — Full booking against Stripe test mode:**
1. Stripe dashboard → toggle **View test data**.
2. *Developers → API keys* → copy the test-mode **Secret key** (`sk_test_…`).
3. Swap `STRIPE_SECRET_KEY` to that key (Replit secret), restart workflow.
4. Apply to coach → Stripe Connect Express. Test mode accepts: DOB `01/01/1990`, address autocomplete `address_full_match`, SSN `000-00-0000`, routing `110000000`, bank `000123456789`.
5. Booking flow on `/coaches/:id/book` completes through Checkout. Test card: `4242 4242 4242 4242`, any future expiry, any CVC.

Production must continue using the live `sk_live_…` key. Both keys go through Replit secrets, never committed.

## Release ritual (Task #426)
Five-minute manual smoke I run after every meaningful prod deploy, in addition to the
automated browser-smoke suite below. Burn through it in order; bail on the first thing
that looks off and fix forward.

1. **Sign in via Steam** on `oceinhouse.gg`. Confirm the avatar + nickname load in the
   top-right and `/profile` resolves to my own account.
2. **Spin up an inhouse lobby** (`/inhouse` → Sign in → register a position → wait for
   the auto-fill bot, or run with 2 friends + bots). Confirm the captain draft renders
   and the dedicated server provisions on the 10th pick.
3. **Complete one coaching surface action** — book a 1:1 (or open the coach editor as a
   promoted test coach via Path A in the "Test coach end-to-end" section), confirm the
   Stripe Checkout page loads (or test-card succeeds in test mode), and `/coach/earnings`
   reflects the row.
4. **Skim `/admin/feature-health`** — every probe green, no NEVER RUN tiles since the
   last deploy, scheduler "last ran" within the last 35 minutes.
5. **Skim `/admin/browser-smoke`** — most recent run green, screenshot thumbnails match
   the baselines, no orphan RUNNING rows older than 10 minutes.
6. **Confirm the Discord bot is online** in the OCE Inhouse server (presence pill green)
   and post a `!ping` in #bot-spam. Sub-200ms reply means the gateway is healthy.

### Automated browser smoke suite (Task #426)
Real-browser Playwright check that loads ~12 user journeys against prod and
perceptual-diffs each page against a stored baseline. Catches visual / route /
interaction regressions the feature-health probe layer can't see.

- **Specs + baselines** live under `tests/smoke/` — `smoke.spec.js` iterates
  `src/smoke/journeys.js`; baselines are PNGs at `tests/smoke/baselines/<key>.png`.
- **Programmatic runner** at `src/smoke/runner.js` is the production entry point —
  uses the `playwright` package directly, screenshots each journey, perceptual-diffs
  via `pixelmatch`, writes per-step results to `browser_smoke_runs` /
  `browser_smoke_steps`, and DMs `OWNER_DISCORD_ID` on any step failure.
- **Three triggers**:
  1. Weekly cron `0 3 * * 0` in `Australia/Sydney` (registered in `src/index.js`).
  2. Admin button on `/admin/browser-smoke` → ▶ Run smoke now (superuser-gated).
  3. `scripts/trigger-major-smoke.js` invoked from `scripts/post-merge.sh` — fires
     `POST /api/internal/smoke/trigger` when the most-recently-merged patch note
     carries `major: true`. Requires `SMOKE_INTERNAL_TOKEN` (shared bearer token,
     set in Replit secrets + prod env) and optionally `SMOKE_TRIGGER_URL` (defaults
     to `https://oceinhouse.gg`).
- **Baseline approval** — every step's detail card on `/admin/browser-smoke/:id`
  has an *Approve new baseline* button that copies the current screenshot over
  `tests/smoke/baselines/<key>.png`. Commit the changed PNG with the next batch
  so production picks it up on the next deploy.
- **Optional devDependencies**: `@playwright/test`, `playwright`, `pixelmatch`,
  `pngjs`. On a fresh prod host: `npx playwright install chromium` once. The
  runner degrades gracefully when these aren't installed — the run records a
  single SKIPPED step with a clear message instead of throwing.

## Environment variables (security-relevant)
- `OWNER_DISCORD_ID` — overrides the hardcoded Discord owner ID used by `!perf-backfill`, `!backfill-pick-source`, and other owner-only Discord commands in both editions (`src/discord/bot.js`, `community-edition/src/discord/bot.js`). Falls back to the historical default (`135991380760592384`) when unset so prod doesn't break on a missed env update — set this in Replit secrets / prod env any time the owner handle changes.
- `OTEL_EXPORTER_OTLP_ENDPOINT` — Task #417 observability gate. When **unset**, OpenTelemetry stays fully disabled (no SDK, no exporter, no perf cost). Set to the Grafana Cloud OTLP/HTTP base URL (e.g. `https://otlp-gateway-prod-us-east-0.grafana.net/otlp`) to enable HTTP + Express auto-instrumentation, plus custom spans/metrics on the parser, Stripe SDK, dedicated-server provisioner, Discord sends, replay download, and push delivery. Companion vars: `OTEL_EXPORTER_OTLP_HEADERS` (e.g. `Authorization=Basic <base64(instanceID:token)>`), `OTEL_SERVICE_NAME` (defaults to `oi-bot`), `OTEL_METRICS_EXPORT_INTERVAL_MS` (defaults to `30000`). Dashboard JSON committed at `ops/grafana/dashboard.json` — import it via Grafana → Dashboards → New → Import.
- `attached_assets/*.json|*.pem|*.key` are now `.gitignore`-blocked after Task #362's leaked GCP service-account incident. Don't bypass; if a JSON dump genuinely needs to be in-tree, scrub the secrets first.
- `FULL_SITE_LOCKDOWN` — Task #493 owner-only login gate for the full edition (`oceinhouse.gg`). **Unset** (default) means the gate falls through to the DB-backed runtime toggle from Task #497 (default: off). Set to `1` to **force the gate ON regardless of the AdminPanel toggle** — useful as an emergency lock or for the initial deploy before the DB row exists. Behavior when the gate is on: unauthenticated HTML navigations get an inline sign-in page (no app HTML, no meta description, no OG tags); non-HTML requests get a 401 with an empty body. Allowlist (always works): `/api/stripe/webhook`, `/api/admin/superuser-login`, `/auth/steam`, `/auth/steam/return`, `/api/auth/complete`, `/robots.txt`, `/favicon.ico`. Successful superuser login (session cookie OR `x-superuser-key` header) bypasses the gate. **Day-to-day, prefer the AdminPanel toggle** (Overview tab → "🔒 Site lockdown" card) which flips the gate live without a restart — the env var is the fallback / override. Community edition (`dota.stats.corvidaeinc.com`) is untouched.
- `SESSION_FINGERPRINT_SALT` — Task #431 smurf-detector fingerprint signal. Optional. The session middleware in `src/web/sessionFingerprint.js` stamps `sess.ip` + `sess.ua` as salted-SHA-256 hashes truncated to 16 hex chars so the smurf scorer can detect two accounts signing in from one machine. Falls back to `SESSION_SECRET` when unset (same trust boundary as the cookie signature). Rotating this value effectively forgets all stored fingerprints on next login. Privacy posture: raw IP / UA never hit the DB; only the hash is stored on the `user_sessions.sess` JSONB; retention is bounded by the 7-day cookie maxAge plus connect-pg-simple's pruner — there is no separate long-lived audit log. Only authenticated sessions are stamped; anonymous visitors leave nothing behind. The hash is re-written at most once every 15 minutes per session or immediately when the hashed IP/UA changes (the case the smurf scorer cares about).
- `SESSION_COOKIE_DOMAIN` / `CANONICAL_HOST` — Task #661 apex↔www session persistence (full edition only; community untouched). The live full site is reachable on both `oceinhouse.gg` and `www.oceinhouse.gg`; a host-only `oi.sid` cookie meant a sign-in on one host wasn't sent on the other, so a refresh that drifted hosts came back signed-out. **`SESSION_COOKIE_DOMAIN`** sets the session cookie's `Domain` so `oi.sid` spans the apex + every subdomain. **Unset** defaults to `.oceinhouse.gg` *only when `NODE_ENV=production`* (so dev/preview on `*.replit.dev` keeps a host-only cookie — a non-matching Domain makes the browser silently reject the Set-Cookie and nobody can sign in). Set to `none`/`host-only`/`off` to force the legacy host-only cookie. **`CANONICAL_HOST`** (defaults to `oceinhouse.gg` in prod, unset elsewhere) drives a 301 that settles `www.<host>` navigations on the bare apex so the two never diverge; only GET/HEAD are redirected and `/auth/steam/return` + `/api/stripe/webhook` are skipped (signature- and POST-sensitive). `/api/auth/me` and the SPA HTML shell are also marked `no-store` so no upstream proxy can serve a stale signed-out reload.
- `BRAND_ASSET_REFERER_ALLOWLIST` — Task #491 brand-asset hotlink protection (full edition only; community untouched). Comma-separated list of extra referer host suffixes that are permitted to load our **distinctive** brand assets (`/oa-logo.png`, `/favicon.png`, `/favicon.ico`, `/badges/*`, `/voice-packs/*`, `/sounds/*`, scoreboard renders `*/recap-card.png` + `/overlay/scoreboard/*`). The middleware in `src/security/assetHotlink.js` (mounted just before the static handler in `src/web/server.js`) inspects the `Referer` header: empty/unparseable referer, same-origin, our built-in domains (`oceinhouse.gg`, `dota.stats.corvidaeinc.com`, `corvidaeinc.com`, `localhost`, `replit.dev`, `repl.co`, `replit.app`), and known social unfurlers (Discord/Twitter/Slack/Telegram/etc. by UA) are allowed; anything else gets a 403 text body. Generic bundled assets (JS/CSS/fonts, the Dota minimap, `sw.js`, `robots.txt`) are NOT gated. Every decision (allowed/blocked) is recorded into an in-memory ring buffer (5000 cap, no schema). The admin "Brand-asset hotlinks" card in the full-edition AdminPanel (Overview tab) renders the aggregated report grouped by referer host via `GET /api/admin/asset-hotlink-report` (superuser). Set this var to add partner domains that should be allowed to embed our imagery.
- `BLOCK_AI_AGENTS` — Task #492 AI scraper / clone-builder hardening. **Unset** (default) means "observability only": the UA classifier in `src/security/agentClassifier.js` still records every classified agent hit into the in-process ring buffer (5000 cap), still applies the stricter `(ip, ua-family)` rate-limit bucket (custom `handler` flips the entry's decision to `throttled` before returning 429), still DMs the bot owner on first-seen-per-24h, and the X-Robots-Tag + `<meta name="robots" content="noai, noimageai">` are still emitted — but classified agents are NOT hard-blocked. Set `BLOCK_AI_AGENTS=1` to return a 403 with a short policy message for any UA matching `ai-crawler` or `app-builder` in the registry. `unknown-bot` is never hard-blocked (observability only). The classification source-of-truth is `src/security/agentUaList.js`; `web/public/robots.txt` and `community-edition/web/public/robots.txt` are **generated** from it via `node scripts/build-robots-txt.js` (drift gate: `npm run check:robots`). The admin "AI agent traffic" card in the full-edition AdminPanel (Overview tab) renders the live aggregated report (decisions: blocked / throttled / logged) via `GET /api/admin/agent-traffic-report` (superuser).

## External Dependencies
- **Discord:** `discord.js`
- **Steam:** `steam-user`, `dota2-user`
- **OpenDota:** match data + `odota/parser` (Java replay parser)
- **PostgreSQL** (Replit-managed)
- **ts-trueskill** for MMR
- **Stripe** — payments, Connect Express for coaching
- **@napi-rs/canvas** — scoreboard image generation
- **Google Sheets API** (optional) — `google-spreadsheet`
- **node-fetch**, **express-session**, **helmet**, **express-rate-limit**
