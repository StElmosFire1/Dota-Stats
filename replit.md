# Dota 2 Inhouse Stats Bot

## Overview
This project is a Node.js Discord bot designed to track statistics from Dota 2 inhouse games for an OCE community server. Its primary purpose is to provide a privacy-first solution for recording match data, bypassing reliance on public match APIs for detailed stats. The bot offers various methods for recording games, from direct replay parsing to real-time lobby monitoring, and provides a comprehensive web dashboard for viewing stats, leaderboards, and player profiles. The ambition is to create a robust and feature-rich platform for competitive inhouse Dota 2 communities to manage and analyze their games.

## User Preferences
I prefer iterative development, with a focus on delivering core features first and then refining them. When making changes, please prioritize robust error handling and graceful degradation. I value clear, concise explanations for any complex technical decisions or implementations.

**Auto-push:** After completing any set of changes and rebuilding, always push to GitHub automatically using:
`git -c credential.helper='!f() { echo "username=StElmosFire1"; echo "password=${GITHUB_PERSONAL_ACCESS_TOKEN}"; }; f' push origin main`
The lock file warning that sometimes appears is harmless — the push itself succeeds.

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
- Multi-kill leaderboard page (/multikills) — sortable by rampages, ultra kills, triples, doubles.
- Hero position meta tab on the Heroes page — win rates per hero by position (Pos 1–5).
- Most Improved widget on the Leaderboard — top MMR gainers over 30 days (from rating_history).
- Match prediction system: `!predict <matchId> radiant|dire` Discord command + `/api/predictions` endpoints.
- Achievement badges on player profiles expanded: rampage, ultra kill, first blood, massacre, ward lord/breaker.
- Player prediction accuracy stats shown on player profiles.
The dashboard emphasizes clear data presentation, sortable tables, and detailed insights.

**Technical Implementations & Feature Specifications:**

- **Replay Parsing:** Utilizes OpenDota's production Java-based `odota/parser` as a local service to extract detailed match statistics from `.dem` replay files (KDA, GPM, damage, healing, items, skill builds, multi-kills, streaks, lane CS).
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