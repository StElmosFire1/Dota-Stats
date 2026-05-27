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
  The hook self-heals non-fast-forward rejections (it fetches the platform's recommitted SHA, verifies the tree matches, and force-with-lease pushes). The only allowed source of divergence is `artifacts/mockup-sandbox/src/.generated/`.

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
**OCE Inhouse** under the OA logo (`web/public/oa-logo.png` + `favicon.png`). Palette: **Hybrid · Court & Pitch** — ink-navy `#0d1424`, brass `#c5a975`, amber `#f59e0b`, parchment `#f5efe2`. CSS tokens in `web/src/styles.css`: `--bg-primary`, `--accent`, `--gold`, `--brass`, `--amber`, `--parchment`, `--ink-navy`. Fonts: Inter (`--font`), Oswald (`--font-condensed`), Playfair Display (`--font-serif`).

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

## Environment variables (security-relevant)
- `OWNER_DISCORD_ID` — overrides the hardcoded Discord owner ID used by `!perf-backfill`, `!backfill-pick-source`, and other owner-only Discord commands in both editions (`src/discord/bot.js`, `community-edition/src/discord/bot.js`). Falls back to the historical default (`135991380760592384`) when unset so prod doesn't break on a missed env update — set this in Replit secrets / prod env any time the owner handle changes.
- `OTEL_EXPORTER_OTLP_ENDPOINT` — Task #417 observability gate. When **unset**, OpenTelemetry stays fully disabled (no SDK, no exporter, no perf cost). Set to the Grafana Cloud OTLP/HTTP base URL (e.g. `https://otlp-gateway-prod-us-east-0.grafana.net/otlp`) to enable HTTP + Express auto-instrumentation, plus custom spans/metrics on the parser, Stripe SDK, dedicated-server provisioner, Discord sends, replay download, and push delivery. Companion vars: `OTEL_EXPORTER_OTLP_HEADERS` (e.g. `Authorization=Basic <base64(instanceID:token)>`), `OTEL_SERVICE_NAME` (defaults to `oi-bot`), `OTEL_METRICS_EXPORT_INTERVAL_MS` (defaults to `30000`). Dashboard JSON committed at `ops/grafana/dashboard.json` — import it via Grafana → Dashboards → New → Import.
- `attached_assets/*.json|*.pem|*.key` are now `.gitignore`-blocked after Task #362's leaked GCP service-account incident. Don't bypass; if a JSON dump genuinely needs to be in-tree, scrub the secrets first.

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
