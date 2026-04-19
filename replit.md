# Dota 2 Inhouse Stats Bot

## Overview
This Node.js Discord bot tracks Dota 2 inhouse game statistics for an OCE community, offering a privacy-first solution by recording match data without relying on public match APIs. It provides various recording methods, including replay parsing and real-time lobby monitoring, complemented by a web dashboard for stats, leaderboards, and player profiles. The project aims to be a comprehensive platform for competitive inhouse Dota 2 communities.

## User Preferences
I prefer iterative development, with a focus on delivering core features first and then refining them. When making changes, please prioritize robust error handling and graceful degradation. I value clear, concise explanations for any complex technical decisions or implementations.

After completing a meaningful batch of changes, add a single grouped entry to `src/data/patchNotes.js` summarising everything that changed (incrementing the version number from the current latest). Group related changes into one patch note rather than posting one per individual change — only publish when there is a significant set of work to describe. This must be done automatically — never wait to be asked.

After completing any set of changes and rebuilding, always push to GitHub automatically using:
`git -c credential.helper='!f() { echo "username=StElmosFire1"; echo "password=${GITHUB_PERSONAL_ACCESS_TOKEN}"; }; f' push origin main`

The bot runs under PM2. Standard deploy command:
`cd ~/Dota-Stats && bash deploy.sh`
This script: pulls latest code (`git reset --hard origin/main`), runs `npm install` in the `web/` dir, builds the frontend (`npm run build`), then restarts PM2 process 2.
After rebuilding the Java JAR (`cd odota-parser && mvn package -q -DskipTests`), run the deploy script to pick it up.

## System Architecture
The bot is built with Node.js, utilizing `discord.js` for Discord integration and a custom Steam client (`steam-user`, `dota2-user`) for Dota 2 Game Coordinator interactions. Data is primarily stored in PostgreSQL.

**UI/UX Decisions:**
A web dashboard (React + Vite frontend, Express backend) provides extensive features for match history, detailed scoreboards, TrueSkill MMR-based leaderboards, player profiles with hero and statistical breakdowns, and synergy matrices. It also includes player management, replay uploads, season and prize pool management (Stripe integration), and Steam OpenID sign-in. Key UI/UX features include a multi-kill leaderboard, a combined Player Tools page (Head to Head, Compare Players), enhanced captain win rate displays, improved gold lead computation for greatest comebacks, hero position meta, and expandable hero stats tables. Support reporting details are granular (observer/sentry dewarding), and power spikes panel is refined. Recent additions include a Hero Breakdown tab, a merged Draft page (Assistant and Stats), a comprehensive Predictions page, and a "Most Improved" widget and Form Guide on the Leaderboard. Further UI enhancements include a Hero Tier List, Hero Matchups, Player Benchmarks, and an expanded achievement system (50+ badges across 11 categories with group display and show/hide locked toggle). A Player Network page (`/social`) shows top duos and player connections. Hall of Fame page (`/hall-of-fame`) shows all-time match records and career rankings. Player Benchmarks page (`/benchmarks`) compares average stats across all players with colour coding. Tournament Brackets system (`/tournaments`) supports creating single/double-elimination tournaments with MMR-seeded bracket generation, admin winner entry, and live bracket display. Player profiles enhanced with shareable link button, Best Allies section, and rolling 5-game win rate chart. Players page has a live search/filter box. Records page features Most Denies, Most Courier Kills, and Most Buybacks in Hall of Records (Hero Level removed). Join the League page (`/join`) lets prospective players submit interest forms reviewed in the Admin Panel.

**Technical Implementations & Feature Specifications:**
- **Replay Parsing:** Uses a local instance of OpenDota's Java-based `odota/parser` to extract detailed match statistics from `.dem` files, extended for deeper combat log analysis (e.g., assist players, kill locations, spell evasion).
- **Lobby-Based Recording:** Monitors Dota 2 lobbies via the Game Coordinator for basic match outcome recording.
- **Friend Lobby Auto-Detection:** Automatically detects and joins lobbies via Steam friends' rich presence.
- **Auto-Detect System (OpenDota Fallback):** Can poll OpenDota for recent practice lobby matches with public data.
- **TrueSkill MMR:** Implements TrueSkill for dynamic player rating calculations.
- **Impact Score System:** Position-neutral 1–10 performance rating using kill involvement, win rate, K/D/A efficiency and games played. Appears on Leaderboard (column), Player Profile (stat card replacing GPM), Hall of Fame career tab (column), Match Detail scoreboard (per-match Perf rank), and Discord post-match highlights (Top Impact player).
- **Courier Kills Tracking:** `player_stats.courier_kills` tracked by replay parser. Two achievements: "Chicken Killer" (20+) and "Courier Slayer" (50+ career courier kills). Single-game record on Records page.
- **Sign-Up / Join Page:** `/join` route for community interest forms (`signup_requests` DB table). Admin Panel shows pending/approved/rejected requests with notes.
- **TrueSkill 2 (Experimental):** Hidden admin-only simulation that reruns all match history under a TS2 variant — μ updates scaled by per-match K/D/A performance (modifier 0.65×–1.35×, z-scored within each match), σ unchanged. Accessible via Admin Panel "Run TS2 Simulation" button. Read-only — nothing is stored. Used to evaluate TS2 before Season 10 launch.
- **Discord Commands:** Provides commands for player registration, lobby management, stats, and manual match recording.
- **Data Storage:** PostgreSQL is the primary database for all structured game data.
- **Nickname System:** Manages custom player nicknames.
- **Match Deletion:** Supports authenticated match deletion with TrueSkill recalculation.
- **Draft Team Assignment:** Determines teams using `hero_id` and a CM_PATTERN for bans, bypassing unreliable `draft_active_team`.
- **AI Match Commentary:** Grok generates post-match MVP one-liners and narratives.
- **Scoreboard Image Generation:** Creates and sends PNG scoreboard cards to Discord after matches.
- **Hot Streak Announcements:** Notifies players of 5-win and 10-win streaks.
- **Match Notes:** Allows admins to add/delete text notes to matches via the web dashboard.
- **Match Prediction System:** Discord command `!predict` and API endpoints for predictions.
- **Replay File Retention:** Archives and manages uploaded `.dem` files with configurable expiry.
- **Discord ID Linking:** Links player profiles to Discord IDs for DMs (e.g., team balancer, post-match ratings).
- **Team Balancer:** Discord command `!balance` for optimal MMR-balanced team splits.
- **Game Schedule:** Discord commands for scheduling, listing, and canceling games, with a web view.
- **Post-match MVP + Attitude Ratings:** DMs players for MVP votes and teammate attitude ratings.
- **Records & Comebacks Page:** Displays all-time single-game bests, First Blood leaderboard, and greatest comebacks.
- **Player Profiles Enhancements:** Includes First Bloods stats and Win Rate by Game Duration.
- **Skill Builds Tab:** Shows common ability leveling data.
- **Patch Notes Auto-Announce:** Bot announces new patch notes from `src/data/patchNotes.js` to Discord.

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