# Dota 2 Inhouse Stats Bot

## Overview
This project is a Node.js Discord bot designed to track statistics from Dota 2 inhouse games (custom lobbies) for an OCE community server with up to 100 players. Its primary purpose is to provide a privacy-first solution for recording match data, bypassing reliance on public match APIs for detailed stats. The bot offers various methods for recording games, from direct replay parsing to real-time lobby monitoring, and provides a comprehensive web dashboard for viewing stats, leaderboards, and player profiles. The ambition is to create a robust and feature-rich platform for competitive inhouse Dota 2 communities to manage and analyze their games.

## User Preferences
I prefer iterative development, with a focus on delivering core features first and then refining them. When making changes, please prioritize robust error handling and graceful degradation. I value clear, concise explanations for any complex technical decisions or implementations.

## System Architecture
The bot is built on Node.js using `discord.js` for Discord integration and a custom Steam client (`steam-user`, `dota2-user`) for Dota 2 Game Coordinator (GC) interactions. Data persistence is handled primarily via PostgreSQL, with an optional Google Sheets integration for flexible data viewing.

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
The dashboard emphasizes clear data presentation, sortable tables, and detailed insights.

**Technical Implementations & Feature Specifications:**

- **Replay Parsing:** Utilizes OpenDota's production Java-based `odota/parser` as a local service to extract detailed match statistics (KDA, GPM, damage, healing, items, skill builds, multi-kills, streaks, lane CS) from `.dem` replay files. It handles complex parsing challenges like mapping combat log events to player slots and protobuf epilogue data.
- **Lobby-Based Recording:** The bot monitors Dota 2 lobbies via the Game Coordinator. When present in a lobby, it records basic match outcomes (teams, heroes, winner, duration) for TrueSkill calculations, crucial for practice lobbies unavailable through external APIs.
- **Friend Lobby Auto-Detection:** The bot's Steam account monitors friends' rich presence to automatically detect and join Dota 2 lobbies, facilitating seamless match recording. It auto-accepts friend requests to simplify setup.
- **Auto-Detect System (OpenDota Fallback):** For players with public match data enabled, the bot can poll OpenDota to identify and record recent practice lobby matches.
- **TrueSkill MMR:** Implements TrueSkill for player rating calculations, dynamically updated based on match outcomes.
- **Discord Commands:** Provides a suite of commands for player registration, lobby creation/management, stats lookup, and manual match recording.
- **Data Storage:** Primary storage is PostgreSQL for structured match data, player stats, items, abilities, ratings, and nicknames. Google Sheets serves as an optional, secondary storage for visibility and specific data points.
- **Nickname System:** Allows assignment of custom nicknames to players for display across the platform.
- **Match Deletion:** Supports authenticated match deletion, archiving data, and recalculating TrueSkill ratings.

**System Design Choices:**
- **Modularity:** The codebase is structured into logical components (Discord, Steam, Lobby, API, Stats, Sheets, Replay) for maintainability.
- **Graceful Degradation:** The bot is designed to function even if optional components (e.g., Steam integration, Google Sheets, replay parser) are unavailable, ensuring core functionality.
- **Child Processes:** The Java replay parser runs as a child process, managed by the bot for lifecycle control.

## External Dependencies
- **Discord API:** Accessed via `discord.js` for bot interactions, commands, and rich embeds.
- **Steam API:** Accessed via `steam-user` (for headless login, 2FA, friend monitoring) and `dota2-user` (for Dota 2 Game Coordinator communication and protobuf handling).
- **OpenDota API:** Used for fetching match data (e.g., for `!record` command, auto-detect fallback) and indirectly through the `odota/parser` for replay analysis.
- **Google Sheets API:** Integrated via `google-spreadsheet` for optional data storage and display. Requires a Google Cloud service account.
- **PostgreSQL Database:** The primary database for persistent storage of all application data.
- **odota/parser (Java):** OpenDota's Java-based replay parser, a separate service used for detailed `.dem` file analysis.
- **ts-trueskill:** A library for TrueSkill MMR calculations.
- **node-fetch:** Used for HTTP requests to external APIs and replay file downloads.

## Recent Changes
- 2026-03-12: Added seasons system — `seasons` table with active-season tracking; `patch` and `season_id` columns on `matches`. Season CRUD API routes. All stat pages (Players, OverallStats, Heroes, HeroBreakdown, Synergy, PositionStats, MatchList) now filter by active season via global SeasonSelector in nav. Upload page has patch input field (persisted in localStorage, stamped on each batch). Match detail shows patch/season badges and has admin "Edit Patch / Season" panel. Seasons admin page at /seasons for creating seasons and setting the active one.
- 2026-03-11: Players page — split "Best Pos" into "Most Played" (mode position) and "Best Pos" (1-10 performance rating based on win rate, KDA, GPM). Score formula: min(10, winRate*3.5 + min(3.5, kda*0.7) + min(3.0, gpm/250)).
- 2026-03-11: Position Stats — removed 3-game minimum (now configurable via dropdown: 1/2/3/5/10). Added "Player Profiles" tab showing expandable per-player position breakdown (like the Google Sheet layout).
- 2026-03-11: Heroes page — now shows ALL 127 Dota 2 heroes alphabetically. Unplayed heroes appear dimmed with blank stats.
- 2026-03-11: Added Hero Breakdown page — player-centric hero view showing each player's hero pool, games, avg KDA, win%, diversification %, dire/radiant win split. Expandable rows show individual hero details.
- 2026-03-11: Fixed position detection — parser outputs coords on 0-256 scale (center ~128), not 0-32768. Positions now correctly detect Pos 1-5 from laning data.
- 2026-03-11: Fixed final inventory items — Entry.java `hero_inventory` was `transient` (never serialized). Removed transient flag; JS code reads `hero_inventory` array with item names/slots.
- 2026-03-11: Added Aghs Scepter/Shard indicators on match detail — small icons next to items, blue glow when active, greyed out when inactive.
- 2026-03-11: Parallel chunk uploads (3 concurrent, 5MB chunks) for faster replay uploads.
- 2026-03-11: Removed "Last Played" column from Players page.
- 2026-03-11: Fixed leaderboard duplication — ratings table now properly reset when matches are cleared.
- 2026-03-11: Fixed buyback tracking — uses DOTA_COMBATLOG_BUYBACK events, prefers combat log count over interval count.
- 2026-03-11: Added items, abilities, and extended stats to replay parser (buybacks, courier kills, multi-kills, kill streaks, smoke kills, first death, lane CS@10, Aghs/Shard, final inventory, skill build).
- 2026-03-11: Added player_items and player_abilities DB tables for per-match item builds and skill orders.
- 2026-03-11: Added hero icons (Dota 2 CDN) and item icons to match scoreboard UI.
- 2026-03-11: Fixed Java byte-array serialized player names throughout the app.
- 2026-03-11: Added nickname system, match deletion with audit trail, duplicate replay prevention.
- 2026-03-11: Added Hero Stats, Overall Stats, Position Stats, Synergy pages to web dashboard.
- 2026-03-11: Added position detection, captain tracking, and ward/stack/rune stats to replay parser.