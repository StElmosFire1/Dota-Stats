# Dota 2 Inhouse Stats Bot

## Overview
The Dota 2 Inhouse Stats Bot is a Node.js Discord bot designed to track and display Dota 2 inhouse game statistics for an OCE community. It prioritizes privacy by not relying on public match APIs and offers various methods for recording match data, including replay parsing and real-time lobby monitoring. A comprehensive web dashboard complements the bot, providing features like match history, TrueSkill MMR leaderboards, detailed player profiles, and tools for community management. The project aims to be a complete platform for competitive inhouse Dota 2 communities, incorporating features such as season management, prize pools, and advanced statistical analysis.

## User Preferences
I prefer iterative development, with a focus on delivering core features first and then refining them. When making changes, please prioritize robust error handling and graceful degradation. I value clear, concise explanations for any complex technical decisions or implementations.

After completing a meaningful batch of changes, add a single grouped entry to `src/data/patchNotes.js` summarising everything that changed (incrementing the version number from the current latest). Group related changes into one patch note rather than posting one per individual change — only publish when there is a significant set of work to describe. This must be done automatically — never wait to be asked.

After completing any set of changes and rebuilding, the latest commit is pushed to GitHub automatically by the post-merge hook (`scripts/post-merge.sh`), which runs after the platform's auto-commit and uses the `GITHUB_PERSONAL_ACCESS_TOKEN` secret with this credential-helper one-liner:
`git -c credential.helper='!f() { echo "username=StElmosFire1"; echo "password=${GITHUB_PERSONAL_ACCESS_TOKEN}"; }; f' push origin HEAD:main`

The bot runs under PM2. The prod host has **two separate checkouts** side-by-side:
- `~/Dota-Stats-Full/` — **full edition** (OCE Inhouse, `oceinhouse.gg`). Standard deploy: `cd ~/Dota-Stats-Full && bash deploy.sh`
- `~/Dota-Stats/` — **community edition**. Standard deploy: `cd ~/Dota-Stats && bash deploy.sh`

Each `deploy.sh`: pulls latest code (`git reset --hard origin/main`), runs `npm install` in the `web/` dir, builds the frontend (`npm run build`), then restarts the matching PM2 process **by name** (full = `oi-bot`, community = `inhouse-bot`). Override the target at call-site with `PM2_APP=other-name bash deploy.sh`. Always confirm you're in the correct directory before deploying — running the wrong one will swap a site to the wrong edition.
The Java replay parser jar (`odota-parser/target/stats-0.1.0.jar`) is rebuilt automatically on each deploy/start by `scripts/build-parser.sh` (invoked from `npm prestart`, the Replit `[deployment].run` command, and `scripts/post-merge.sh`). The script only re-runs `mvn install -DskipTests` when the jar is missing or older than any file under `odota-parser/src/` or `odota-parser/pom.xml`, so normal restarts are no-ops. To force a manual rebuild, run `npm run build:parser`.

Both `deploy.sh` and `scripts/post-merge.sh` run `bash scripts/build-parser.sh --check` (also exposed as `npm run check:parser`) as a hard gate **before** any local rebuild. The check exits non-zero if the committed jar is older than any file under `odota-parser/src/` (whole tree, not just `src/main/java`) or `odota-parser/pom.xml`, so a deploy/post-merge with a stale committed jar fails fast and cannot be silently self-healed by a rebuild on the deploy host. The check never invokes Maven, so it is also safe to wire into CI runners without a JDK.

## System Architecture
The system is built on Node.js, integrating with Discord and Steam for game interactions. Data persistence is managed using PostgreSQL.

**Branding:**
As of v5.59 the site is rebranded to **OCE Inhouse** under the OA logo (`web/public/oa-logo.png` + `web/public/favicon.png`). The global palette is the **Hybrid · Court & Pitch** system — ink-navy `#0d1424` backgrounds, brass `#c5a975` accent, amber `#f59e0b` highlights, parchment `#f5efe2` light theme — driven by the existing CSS token names in `web/src/styles.css` (`--bg-primary`, `--accent`, `--gold`, `--brass`, `--amber`, `--parchment`, `--ink-navy`). Fonts: Inter (sans, `--font`), Oswald (condensed, `--font-condensed`), Playfair Display (serif, `--font-serif`).

**UI/UX Decisions:**
The web dashboard is a React-based frontend with an Express backend, offering extensive features such as match history, TrueSkill MMR leaderboards, player profiles with detailed breakdowns, and synergy matrices. Key UI elements include multi-kill leaderboards, player comparison tools, enhanced gold lead displays, hero meta analysis, and expandable stats tables. Recent additions include a Hero Breakdown tab, a merged Draft page, a Predictions page, and "Most Improved" and "Form Guide" widgets. Further planned enhancements include a Hero Tier List, Hero Matchups, Player Benchmarks, an expanded achievement system, a Player Network page, a Hall of Fame, and Tournament Brackets. Player profiles feature shareable links, best allies, and rolling win rate charts.

**Technical Implementations:**
- **Data Recording:** Supports replay parsing via a local OpenDota Java parser instance and real-time lobby monitoring through the Dota 2 Game Coordinator.
- **Automated Match Detection:** Includes friend lobby auto-detection and an OpenDota fallback system for practice lobby matches.
- **Player Rating:** Implements TrueSkill for dynamic MMR calculations, with an 8-tier ladder system and an Impact Score for position-neutral performance rating. TrueSkill 2 is also being experimentally evaluated.
- **PERF (Positive Impact Score):** Position-aware, duration-normalised 1.0–10.0 score persisted in `player_stats.perf` (with full per-stat breakdown in `perf_breakdown` and source in `perf_source`). Computed against per-position avg/elite per-minute targets defined in `src/perf/perfWeights.config.js` so a score of 5.0 = average for the role, 9.0+ = top 1%, and 10.0 is achievable for any position with elite play. Calculated automatically after every match record via `src/perf/perfService.js` (mirrored to `community-edition/src/perf/`); historical matches can be backfilled with the owner-only Discord command `!perf-backfill [limit]`. Match scoreboards prefer the persisted PERF when present, falling back to the legacy match-relative score otherwise.
- **Monetization & Management:** Integrates Stripe for per-tournament buy-ins and managing prize pools. Features include season pass with XP economy, player profile customization, and a "Pro Tier" subscription for advanced features like detailed hero meta and analytics.
- **Community Features:** Includes a sign-up/join page, nickname system, Discord commands for bot interaction, and an AI match commentary system using Grok.
- **Advanced Match Analytics:** Provides post-match MVP voting, attitude ratings, scoreboard image generation, and hot streak announcements.
- **Match Prediction System:** Allows users to predict match outcomes.
- **Game Scheduling & Balancing:** Features Discord commands for scheduling games and an MMR-based team balancer.
- **Inhouse Lobby System:** A FACEIT-style inhouse lobby (`/inhouse`) provides a complete session flow from player sign-in, position registration, timed accept phase, captain selection, and a captain draft UI, integrated with dedicated servers for game provisioning and replay pulling.
- **Hero Meta & Draft Assistant:** `Hero Meta V2` provides position-specific hero win rates and pick frequencies. `Draft Assistant V2` offers live counter-pick and synergy scoring based on real-time picks.
- **Notifications:** A comprehensive notification system allows players to manage preferences for various alerts (e.g., post-match DMs, MVP votes, hot streaks) through a dedicated settings page and web push notifications.
- **Profile Customization:** Signed-in players can personalize their profiles with bios, custom titles, accent colors, pinned heroes, and matches.
- **Coaching Marketplace:** A peer-to-peer coaching marketplace, built with Stripe Connect Express, allows eligible top players or high-ranked users to offer paid coaching sessions.

**System Design Choices:**
- **Modularity:** Components are structured for Discord, Steam, Lobby, API, Stats, Sheets, and Replay processing.
- **Graceful Degradation:** Core functionalities are designed to remain operational even if non-critical components are unavailable.
- **Child Processes:** The Java replay parser is executed as a child process.

## External Dependencies
- **Discord API:** `discord.js`
- **Steam API:** `steam-user`, `dota2-user`
- **OpenDota API:** For match data and the `odota/parser`
- **PostgreSQL Database**
- **odota/parser (Java):** OpenDota's replay parser for detailed match statistics.
- **ts-trueskill:** Library for TrueSkill MMR calculations.
- **Stripe:** For payment processing, including tournament buy-ins, season passes, and the coaching marketplace.
- **@napi-rs/canvas:** Used for generating scoreboard images.
- **Google Sheets API:** (Optional) `google-spreadsheet` for sheets integration.
- **node-fetch:** For HTTP requests and Steam OpenID authentication.
- **express-session:** For server-side session management.
- **helmet:** For HTTP security.
- **express-rate-limit:** For rate limiting on authentication endpoints.