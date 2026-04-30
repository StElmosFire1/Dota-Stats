# Dota 2 Inhouse Stats Bot

## Overview
This Node.js Discord bot tracks Dota 2 inhouse game statistics for an OCE community, offering a privacy-first solution by recording match data without relying on public match APIs. It provides various recording methods, including replay parsing and real-time lobby monitoring, complemented by a web dashboard for stats, leaderboards, and player profiles. The project aims to be a comprehensive platform for competitive inhouse Dota 2 communities.

## User Preferences
I prefer iterative development, with a focus on delivering core features first and then refining them. When making changes, please prioritize robust error handling and graceful degradation. I value clear, concise explanations for any complex technical decisions or implementations.

After completing a meaningful batch of changes, add a single grouped entry to `src/data/patchNotes.js` summarising everything that changed (incrementing the version number from the current latest). Group related changes into one patch note rather than posting one per individual change — only publish when there is a significant set of work to describe. This must be done automatically — never wait to be asked.

After completing any set of changes and rebuilding, the latest commit is pushed to GitHub automatically by the post-merge hook (`scripts/post-merge.sh`), which runs after the platform's auto-commit and uses the `GITHUB_PERSONAL_ACCESS_TOKEN` secret with this credential-helper one-liner:
`git -c credential.helper='!f() { echo "username=StElmosFire1"; echo "password=${GITHUB_PERSONAL_ACCESS_TOKEN}"; }; f' push origin HEAD:main`

The bot runs under PM2. Standard deploy command:
`cd ~/Dota-Stats && bash deploy.sh`
This script: pulls latest code (`git reset --hard origin/main`), runs `npm install` in the `web/` dir, builds the frontend (`npm run build`), then restarts PM2 process 2.
After rebuilding the Java JAR (`cd odota-parser && mvn package -q -DskipTests`), run the deploy script to pick it up.

## System Architecture
The bot is built with Node.js, utilizing `discord.js` for Discord integration and a custom Steam client (`steam-user`, `dota2-user`) for Dota 2 Game Coordinator interactions. Data is primarily stored in PostgreSQL.

**UI/UX Decisions:**
A web dashboard (React + Vite frontend, Express backend) provides extensive features for match history, detailed scoreboards, TrueSkill MMR-based leaderboards, player profiles with hero and statistical breakdowns, and synergy matrices. It includes player management, replay uploads, season and prize pool management (Stripe integration), and Steam OpenID sign-in. Key UI/UX features include multi-kill leaderboards, combined Player Tools (Head to Head, Compare Players), enhanced captain win rate displays, improved gold lead computation, hero position meta, and expandable hero stats tables. Support reporting details are granular, and the power spikes panel is refined. Recent additions include a Hero Breakdown tab, a merged Draft page, a comprehensive Predictions page, and "Most Improved" and "Form Guide" widgets on the Leaderboard. Further UI enhancements include a Hero Tier List, Hero Matchups, Player Benchmarks, an expanded achievement system, a Player Network page, a Hall of Fame page, and a Tournament Brackets system. Player profiles are enhanced with shareable links, Best Allies, and rolling 5-game win rate charts. A live search/filter box is available on the Players page. The Records page features Most Denies, Most Courier Kills, and Most Buybacks. A "Join the League" page allows prospective players to submit interest forms.

**Technical Implementations & Feature Specifications:**
- **Replay Parsing:** Uses a local instance of OpenDota's Java-based parser to extract detailed match statistics from `.dem` files, extended for deeper combat log analysis.
- **Lobby-Based Recording:** Monitors Dota 2 lobbies via the Game Coordinator for basic match outcome recording.
- **Friend Lobby Auto-Detection:** Automatically detects and joins lobbies via Steam friends' rich presence.
- **Auto-Detect System (OpenDota Fallback):** Can poll OpenDota for recent practice lobby matches with public data.
- **TrueSkill MMR:** Implements TrueSkill for dynamic player rating calculations, with a specific display formula and 8-tier ladder system configurable via `season_tiers`.
- **Impact Score System:** A position-neutral 1–10 performance rating.
- **Courier Kills Tracking:** Tracks courier kills and awards related achievements.
- **Sign-Up / Join Page:** Manages community interest forms through a dedicated `/join` route and admin panel.
- **TrueSkill 2 (Experimental):** Hidden admin-only simulation for evaluating TrueSkill 2.
- **Per-Tournament Stripe Buy-ins:** Supports paid tournament sign-ups with auto-growing prize pools via Stripe.
- **MVP-per-Match Badges:** Displays MVPs in match details and player profiles.
- **Profile Chart V2:** Shows 5-game rolling K/D/A and GPM on player profiles.
- **Welcome Modal & Home Page CTA:** One-shot welcome modal and prominent call-to-action on the home page.
- **Feature Flags + Season 10 Launch:** A three-state toggle system (`off` / `preview` / `on`) for features, managed via an Admin Panel with a manual two-step "Launch Season 10 Now" button.
- **Web Security Hardening:** Includes Stripe webhook signature verification, secure session cookies, an allowlist for CORS, and rate limiting for public signup forms.
- **Discord Commands:** Provides commands for player registration, lobby management, stats, and manual match recording.
- **Nickname System:** Manages custom player nicknames.
- **Match Deletion:** Supports authenticated match deletion with TrueSkill recalculation.
- **Draft Team Assignment:** Determines teams using `hero_id` for accurate assignments.
- **AI Match Commentary:** Grok generates post-match MVP one-liners and narratives.
- **Scoreboard Image Generation:** Creates and sends PNG scoreboard cards to Discord after matches.
- **Hot Streak Announcements:** Notifies players of 5-win and 10-win streaks.
- **Match Notes:** Allows admins to add/delete text notes to matches via the web dashboard.
- **Match Prediction System:** Discord command `!predict` and API endpoints for predictions.
- **Replay File Retention:** Archives and manages uploaded `.dem` files with configurable expiry.
- **Discord ID Linking:** Links player profiles to Discord IDs for DMs.
- **Team Balancer:** Discord command `!balance` for optimal MMR-balanced team splits.
- **Game Schedule:** Discord commands for scheduling, listing, and canceling games, with a web view.
- **Post-match MVP + Attitude Ratings:** DMs players for MVP votes and teammate attitude ratings.
- **Records & Comebacks Page:** Displays all-time single-game bests, First Blood leaderboard, and greatest comebacks.
- **Player Profiles Enhancements:** Includes First Bloods stats and Win Rate by Game Duration.
- **Skill Builds Tab:** Shows common ability leveling data.
- **Patch Notes Auto-Announce:** Bot announces new patch notes to Discord.
- **Automated Tests:** Comprehensive tests for the V3 rating engine.
- **FACEIT-Style Inhouse Lobby (`/inhouse`):** End-to-end inhouse session flow with player sign-in, position registration, timed Accept Phase, captain selection, captain draft UI, and dedicated server integration for game provisioning and replay pulling.
- **Hero Meta V2 (`hero_meta_v2`):** Position-specific win rates per hero (using `lane_role`), pick frequency, and tier-aware breakdown. Surfaced as a "Hero Meta V2" panel on `/heroes`. Endpoint: `GET /api/heroes/meta-v2`.
- **Draft Assistant V2 (`draft_assistant_v2`):** Live counter-pick + synergy scoring based on already-picked heroes for both teams. Endpoint: `POST /api/draft/suggestions { allies, enemies, banned, side, season }`.
- **Season Pass (`season_pass_s10`):** Per-season XP economy. New `season_pass_xp_events` table (id SERIAL PK, idempotent UNIQUE on account+season+match+source). XP rules: win=+30, loss=+10, mvp=+20, hot_streak_5=+50, hot_streak_10=+100. Tiers Bronze/Silver/Gold/Platinum/Diamond/Master. Auto-grant in `recordMatch()` and `saveMatchRating()` (best-effort). Endpoints: `GET /api/player/:id/season-pass`, `GET /api/season-pass/leaderboard`, `POST /api/admin/season-pass/recompute`. UI: progress bar on PlayerProfile, optional XP column on Leaderboard.
- **Notification Preferences (`notification_prefs`):** Per-player opt-out per category (post_match_dm, mvp_vote, attitude_vote, hot_streak, schedule_reminder, weekly_recap). Settings page at `/settings/notifications`. Bot DM senders consult `db.isNotificationEnabled(accountId, category)`. Endpoints: `GET/POST /api/me/notifications`.
- **Tournament Bracket Live (`tournament_live_v2`):** Auto-refreshing live panel inside `/tournaments/:id` with prize pool, configurable prize-distribution split (default 50/30/20 via new `tournaments.prize_split` JSONB column) and recent matches. Endpoints: `GET /api/tournaments/:id/live`, `POST /api/tournaments/:id/prize-split`.
- **MVP / Attitude Analytics (`mvp_attitude_analytics`):** Per-player MVP rate + attitude trend (rolling 10-game window) on PlayerProfile. Endpoint: `GET /api/player/:id/mvp-attitude-trends`. Voter-quality weighting + dispute mechanism PARKED.
- **Web Push (`web_push`):** Browser push subscriptions stored in new `web_push_subscriptions` table (id SERIAL PK, endpoint UNIQUE). Service worker at `web/public/sw.js`. Settings page enable/test/disable buttons. Endpoints: `GET /api/web-push/public-key`, `POST /api/me/push/subscribe`, `POST /api/me/push/test`, `DELETE /api/me/push/subscriptions`. Requires `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` env vars; endpoints return 503 cleanly if missing.

**System Design Choices:**
- **Modularity:** Structured components for Discord, Steam, Lobby, API, Stats, Sheets, Replay.
- **Graceful Degradation:** Core functionality persists even if optional components are unavailable.
- **Child Processes:** Java replay parser runs as a child process.

## External Dependencies
- **Discord API:** `discord.js`
- **Steam API:** `steam-user`, `dota2-user`
- **OpenDota API:** For match data and via `odota/parser`
- **Google Sheets API:** `google-spreadsheet` (optional)
- **PostgreSQL Database**
- **odota/parser (Java):** OpenDota's replay parser
- **ts-trueskill:** TrueSkill MMR library
- **node-fetch:** HTTP requests, Steam OpenID
- **Stripe:** For payment processing (`stripe` npm package)
- **express-session:** Server-side sessions for Steam auth
- **helmet:** HTTP security middleware
- **express-rate-limit:** Rate limiting on auth endpoints
- **@napi-rs/canvas:** For scoreboard image generation