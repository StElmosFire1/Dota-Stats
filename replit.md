# Dota 2 Inhouse Stats Bot

## Overview
This project is a Node.js Discord bot designed to track statistics from Dota 2 inhouse games for an OCE community server. Its primary purpose is to provide a privacy-first solution for recording match data, bypassing reliance on public match APIs for detailed stats. The bot offers various methods for recording games, from direct replay parsing to real-time lobby monitoring, and provides a comprehensive web dashboard for viewing stats, leaderboards, and player profiles. The ambition is to create a robust and feature-rich platform for competitive inhouse Dota 2 communities to manage and analyze their games.

## User Preferences
I prefer iterative development, with a focus on delivering core features first and then refining them. When making changes, please prioritize robust error handling and graceful degradation. I value clear, concise explanations for any complex technical decisions or implementations.

**Auto-push:** After completing any set of changes and rebuilding, always push to GitHub automatically using:
`git -c credential.helper='!f() { echo "username=StElmosFire1"; echo "password=${GITHUB_PERSONAL_ACCESS_TOKEN}"; }; f' push origin main`
The lock file warning that sometimes appears is harmless — the push itself succeeds.

**DO server deploy:** The bot runs under PM2. Standard deploy command:
`cd ~/Dota-Stats && git pull && pm2 restart inhouse-bot --update-env`
Never use `nohup node src/index.js` directly — it bypasses PM2 and creates ghost processes.
After rebuilding the Java JAR (`cd odota-parser && mvn package -q -DskipTests`), run the PM2 restart to pick it up.

## System Architecture
The bot is built on Node.js using `discord.js` for Discord integration and a custom Steam client (`steam-user`, `dota2-user`) for Dota 2 Game Coordinator (GC) interactions. Data persistence is handled primarily via PostgreSQL.

**UI/UX Decisions:**
A web dashboard (React + Vite frontend, Express backend) provides a comprehensive interface for:
- Match history and detailed scoreboards.
- Leaderboards based on TrueSkill MMR.
- Player profiles with stats, averages, hero history, and position breakdowns.
- Overall and position-specific statistical rankings.
- Synergy matrices for teammate and opponent win rates.
- Hero statistics with pick rates and win rates.
- Player management, including nickname assignment.
- Replay file uploads with duplicate prevention.
- Season buy-in and prize pool management via Stripe.
- Prize category configuration (leaderboard rank, position MVPs, stat-based awards, custom) with both fixed AUD $ and % of prize pool modes.
- Steam OpenID sign-in for verified identity on buy-ins.
- Multi-kill leaderboard — now lives as a tab inside Records & Comebacks page (/records), season-aware, sortable by rampages/ultra kills/triples/doubles.
- Head to Head and Compare Players combined into single Player Tools page (/player-tools) with tab switcher; both season-aware. Compare uses improved center-anchored bars with % advantage indicator.
- Skill Builds tab removed from Heroes page (data not populating meaningfully).
- Seasons page removed from Tools dropdown — accessible via Admin Panel Quick Links.
- Players page removed from main nav — accessible via Admin Panel Quick Links.
- Captain win rate column now shows game count in parentheses e.g. "75% (4g)" with hover tooltip showing W/L breakdown.
- Synergy matrix threshold: 1 game minimum when season filter is active (vs 3 for all-time) — fixes 100% display for players with few season games.
- Greatest Comebacks fixed: now correctly computes gold lead from per-player networth samples in game_timeline (previous query looked for non-existent goldLead key).
- Hero position meta tab on the Heroes page — win rates per hero by position (Pos 1–5).
- Hero Stats table now has expandable rows — click any played hero to see who has played it and their stats on that hero. Pudge (hero_id=14) shows hook accuracy (hits/attempts/%) in the expanded view.
- Support Report: YDEW/W.LIFE split into O.DEW/O.LIFE (observer) + S.DEW/S.LIFE (sentry) — separate OBS/SEN deward tracking in DB (obs_dewarded_count, obs_avg_lifespan, sen_dewarded_count, sen_avg_lifespan). LSHEAL column removed.
- Power Spikes panel: fixed item names (item_ultimate_scepter replaces item_aghanims_scepter, added shard + more items). Courier markers removed from timeline. EVAD column removed from Detailed Stats.
- Buyback tracking improved: e.value used as slot fallback for streaming DOTA_COMBATLOG_BUYBACK events.
- Smoke/dust slot normalization: Dire Valve slots (128-132) now correctly mapped to 5-9 for per-player smoke/dust tracking.
- Purchase log fallback (Priority 3): consumables (clarity, tango, mango, flask, faerie fire, smoke, dust, etc.) now filtered from end-of-game item reconstruction.
- Heroes page now has a Hero Breakdown tab (formerly a separate page), showing each player's full hero history; /hero-breakdown now redirects to Heroes tab.
- Draft Assistant and Draft Stats merged into single Draft page (/draft) with two tabs; Draft Stats now uses player_stats picks (always populated) not just Captain's Mode draft data.
- Draft Assistant now has player pool selector — add players to My Team / Enemy Team to see their hero pools and click to add heroes; player hero pool data drives synergy/counter analysis.
- Predictions page now has three tabs: Submit Prediction, All Predictions, and Accuracy Scores (compares predictions to actual season standings with exact/in-top-5 scoring).
- Home page has a Predictions widget showing count of predictions for the active season with a link to submit.
- Discord webhook support for prediction submissions: set DISCORD_WEBHOOK_URL env var to get notified when someone submits a season prediction.
- Most Improved widget on the Leaderboard — top MMR gainers over 30 days (from rating_history).
- Form Guide on Leaderboard — last 10 game results shown as green (W) / red (L) dots next to each player; season-aware; fetched from `/api/player-form`.
- Hero Tier List tab on Heroes page — heroes ranked S/A/B/C/D by inhouse win rate; minimum 2 games; color-coded tier cards.
- Hero Matchups tab on Heroes page — select any hero to see win rate vs every opponent they've faced; filterable, sortable table with advantage bar.
- Player Benchmarks section on player profiles — compares GPM, Damage, LH, Healing vs server average for the player's most-played position; color-coded bars with +/- % indicator.
- Achievement system expanded: veteran_200 (Elder), deathless_5 (Ghost), carry_king (20+ Pos 1 games), support_master (20+ Pos 4/5 games), hero_diversity_25 (Hero Collector), big_damage (30k+ dmg in one game), efficient (600+ GPM in one game) — 7 new badges added.
- Player Network page (/social) under Tools → shows Top Duos tab (best teammate win-rate pairings, min-games filter) and Player Connections tab (select a player to see their top 10 teammates + top 10 opponents with win rates).
- Match prediction system: `!predict <matchId> radiant|dire` Discord command + `/api/predictions` endpoints.
- Achievement badges on player profiles expanded: rampage, ultra kill, first blood, massacre, ward lord/breaker.
- Player prediction accuracy stats shown on player profiles.
- Tower kill markers on match timeline (🗼 towers, 🏛️ barracks) — color-coded green/red by which team loses the building; shown on both the gold lead AreaChart and per-player LineChart with legend.
- Pudge Hook Stats page (/pudge-stats) under Tools — per-player: games as Pudge, win rate, KDA, avg GPM, hook attempts, hook hits, accuracy %, hits/game, attempts/game, rampages. Hook data only populated from replay uploads.
- Replay file retention: uploaded .dem files are archived after parsing to `REPLAY_STORE_DIR` (default `replay-store/`). Expire after `REPLAY_STORE_DAYS` days (default 7). Superusers can download replays from match detail page ("Download Replay" button) and manage all stored replays from the Admin Panel (load, extend expiry, keep forever, download).
- Discord ID linking: Admin panel Players page has a "Discord ID" column (superuser editable). Discord IDs stored in `nicknames.discord_id`. Used by bot for DMs (team balancer lookups, post-match rating DMs).
- Team Balancer: `!balance @p1 @p2 ...` Discord command — brute-forces optimal MMR-balanced team split. Works with @mentions (via Discord ID lookup) or plain nicknames as args.
- Game Schedule: `!schedule YYYY-MM-DD HH:MM [note]` / `!upcoming` / `!cancel <id>` Discord commands. `scheduled_games` DB table. Web page at `/schedule` shows upcoming games with countdown.
- Post-match MVP + Attitude Ratings: After every recorded match, bot DMs players with linked Discord IDs. Step 1: MVP vote (pick a number). Step 2: Rate each teammate's attitude 1–10 (space-separated). Ratings stored in `match_ratings` table. Shown on player profiles as ⭐ MVP Votes + attitude score. Ratings are anonymous. Bot needs `DirectMessages` gateway intent.
- Records & Comebacks page (/records) — Hall of Records (all-time single-game bests for kills/GPM/damage/healing etc.), First Blood leaderboard (most FBs with rate), Greatest Comebacks (gold lead deficit overcome, sorted by margin).
- Player profiles: 🩸 First Bloods stat card (count + rate%), Win Rate by Game Duration section (4 brackets: <25m, 25-35m, 35-45m, >45m).
- Heroes page: 🔧 Skill Builds tab — hero selector showing most common ability leveled at each skill point with timing and frequency data.
The dashboard emphasizes clear data presentation, sortable tables, and detailed insights.

**Technical Implementations & Feature Specifications:**

- **Replay Parsing:** Utilizes OpenDota's production Java-based `odota/parser` as a local service to extract detailed match statistics from `.dem` replay files (KDA, GPM, damage, healing, items, skill builds, multi-kills, streaks, lane CS). Extended via `S2CombatLogEntry` cast to unlock: assist players per kill, kill location coordinates, kill-time networth, spell evasion counts, heal saves, lifesteal vs spell healing split, long-range kills, dust usage, pull count (timing heuristic).
- **Lobby-Based Recording:** The bot monitors Dota 2 lobbies via the Game Coordinator, recording basic match outcomes for TrueSkill calculations.
- **Friend Lobby Auto-Detection:** The bot's Steam account monitors friends' rich presence to automatically detect and join Dota 2 lobbies.
- **Auto-Detect System (OpenDota Fallback):** Can poll OpenDota to identify and record recent practice lobby matches for players with public data.
- **TrueSkill MMR:** Implements TrueSkill for dynamic player rating calculations based on match outcomes.
- **Discord Commands:** Provides commands for player registration, lobby creation/management, stats lookup, and manual match recording.
- **Data Storage:** Primary storage is PostgreSQL for structured match data, player stats, items, abilities, ratings, and nicknames.
- **Nickname System:** Allows assignment of custom nicknames to players.
- **Match Deletion:** Supports authenticated match deletion, archiving data, and recalculating TrueSkill ratings.
- **Draft Team Assignment:** Uses `hero_id` against `player_stats` for picks and a CM_PATTERN for bans to reliably determine teams, as `draft_active_team` is unreliable.

**System Design Choices:**
- **Modularity:** Codebase is structured into logical components (Discord, Steam, Lobby, API, Stats, Sheets, Replay).
- **Graceful Degradation:** Designed to function even if optional components (e.g., Steam integration, Google Sheets, replay parser) are unavailable.
- **Child Processes:** The Java replay parser runs as a child process.

## External Dependencies
- **Discord API:** Accessed via `discord.js`.
- **Steam API:** Accessed via `steam-user` and `dota2-user`.
- **OpenDota API:** Used for fetching match data and indirectly through the `odota/parser` for replay analysis.
- **Google Sheets API:** Integrated via `google-spreadsheet` for optional data storage.
- **PostgreSQL Database:** Primary database for persistent storage.
- **odota/parser (Java):** OpenDota's Java-based replay parser for detailed `.dem` file analysis.
- **ts-trueskill:** Library for TrueSkill MMR calculations.
- **node-fetch:** Used for HTTP requests and Steam OpenID verification.
- **Stripe:** Payment processing for season buy-ins (`stripe` npm package, `STRIPE_SECRET_KEY` env).
- **express-session:** Server-side sessions for Steam auth (`SESSION_SECRET` env recommended).
- **helmet:** HTTP security headers middleware.
- **express-rate-limit:** Rate limiting on auth endpoints.

**Environment Variables (DO server):**
- `SESSION_SECRET` — secret for signing session cookies (add to DO env for security)
- `STRIPE_SECRET_KEY` — Stripe API key
- `STRIPE_WEBHOOK_SECRET` — optional, for Stripe webhook signature verification
- `SITE_URL` — base URL used for Stripe redirect and Steam auth return (e.g. `http://170.64.182.110:5000`)