# Dota 2 Inhouse Stats Bot

## Overview
A Node.js Discord bot for tracking stats from Dota 2 inhouse games (custom lobbies) in an OCE community server with up to 100 players. Privacy-first design - no public match data required.

## Architecture
```
src/
  index.js             - Main entry point, startup orchestration
  config.js            - Environment config & validation
  discord/
    bot.js             - Discord.js bot, all command handlers, replay upload
  steam/
    steamClient.js     - Steam login via steam-user, Dota 2 GC lifecycle, friend lobby monitoring
    dota2GC.js         - Dota 2 Game Coordinator client with protobuf encoding
  lobby/
    lobbyManager.js    - Lobby lifecycle state machine, lobby-based match recording
  api/
    opendota.js        - OpenDota API client for match data fetching (free, no auth)
    matchPoller.js     - Automatic match detection by polling OpenDota for registered players
  stats/
    statsService.js    - TrueSkill MMR calculations, match stat normalization
  sheets/
    sheetsStore.js     - Google Sheets data store (Matches, PlayerStats, Ratings, Players, RecordedMatches tabs)
  replay/
    replayParser.js    - Full .dem replay parsing via odota/parser (Java), with header-only fallback
odota-parser/          - OpenDota's Java replay parser (Clarity-based), built with Maven
```

## Data Flow
1. **Replay Upload (Full Stats):** .dem file uploaded to Discord -> Bot downloads -> Sends to local odota/parser service -> Full stats extracted (KDA, GPM, hero damage, etc.) -> Google Sheets + TrueSkill
2. **Lobby Recording (Primary):** Bot is in lobby (created/joined/auto-detected) -> Match ends -> GC lobby data provides teams, heroes, winner -> Record to Sheets + TrueSkill
3. **Friend Auto-Join:** Bot monitors Steam friends' rich presence -> Detects friend in Dota 2 lobby -> Auto-joins lobby -> Records match when it ends
4. **Auto-Detect (Fallback):** Players register with `!register` -> Poller checks OpenDota every 5 min -> Only works if someone has public match data enabled
5. **Manual Record:** `!record <match_id>` -> OpenDota API fetch -> Google Sheets write -> TrueSkill update
6. **Lobby Creation:** Discord command -> Steam login -> Dota 2 GC protobuf -> Lobby created
7. **Leaderboard:** Google Sheets Ratings tab -> Sort by MMR -> Display in Discord embed

## Replay Parsing System
The bot uses OpenDota's production replay parser (odota/parser) running as a local Java service:
1. Parser runs as a child process on port 5600, started automatically on bot startup
2. When a .dem file is uploaded to Discord, bot downloads it and POSTs to the parser
3. Parser returns line-delimited JSON events (combat log, interval data, entity states)
4. Bot aggregates events into full player stats: KDA, last hits, denies, GPM, XPM, hero damage, tower damage, hero healing, level
5. Stats are recorded to Google Sheets and TrueSkill ratings are updated
6. Works for ALL match types including practice lobbies (no OpenDota/API dependency)
7. Falls back to header-only parsing + OpenDota if parser service is unavailable

## Discord Commands
- `!help` - Show all commands
- `!register <steam_id>` - Link Steam account for auto-tracking (Steam64 ID)
- `!players` - Show all registered players
- `!create_lobby <name> <password>` - Create private lobby via Steam (requires Steam creds)
- `!join_lobby <lobby_id> [password]` - Bot joins an existing player-created lobby to track stats
- `!invite <steam_id>` - Invite a player to the lobby by Steam64 ID
- `!lobby_status` - Check current lobby & join info
- `!end` - End current lobby
- `!record <match_id>` - Fetch match from OpenDota API and record stats (manual)
- `!top [count]` - Leaderboard (TrueSkill MMR)
- `!stats [@user]` - Player stats
- `!history` - Recent matches
- `!steam_status` - System connection status
- Upload `.dem` file - Full replay parsing with KDA, GPM, damage, etc.

## Lobby-Based Match Recording
Practice lobby matches are NOT available via any external API (OpenDota, Steam Web API). The bot records match data directly from the Game Coordinator:
1. Bot must be IN the lobby (as host, spectator, or auto-joined)
2. When match enters POST_GAME state, CSODOTALobby provides: matchOutcome, matchId, matchDuration, player heroIds, team assignments
3. This gives us enough for TrueSkill calculations (win/loss + team composition)
4. Detailed KDA stats are NOT available from lobby data - only heroes, teams, and winner
5. For full stats: upload the .dem replay file to Discord after the match

## Friend Lobby Auto-Detection
The bot monitors Steam friends' rich presence to auto-join lobbies:
1. Bot's Steam account must be friends with at least one player in the lobby
2. When a friend starts/joins a Dota 2 practice lobby, their `steam_player_group` rich presence reveals the lobby ID
3. Bot auto-joins the lobby if it's not already in one
4. Bot also auto-accepts all friend requests, so players just need to add the bot's Steam account
5. Monitored via both real-time `user` events and periodic polling (every 60 seconds)

## Auto-Detect System (OpenDota Fallback)
The bot can also detect matches via OpenDota polling (requires public match data):
1. Players register their Steam ID with `!register <steam_id>`
2. Every 5 minutes, the poller checks registered players' recent matches on OpenDota
3. Practice lobby matches (lobby_type=1) with 2+ registered players are auto-recorded
4. **Requires:** At least one player per match has "Expose Public Match Data" enabled in Dota 2

## Required Secrets
- `DISCORD_TOKEN` - Discord bot token (required)
- `STEAM_ACCOUNT` - Steam alt account username (optional, for lobby features)
- `STEAM_PASSWORD` - Steam alt account password (optional)
- `STEAM_SHARED_SECRET` - Steam Guard shared secret from maFile (optional)
- `SHEET_ID` - Google Sheets spreadsheet ID (optional, for persistent storage + auto-detect)

## Google Sheets Setup
1. Create a Google Cloud service account with Sheets API enabled
2. Download the credentials JSON file
3. Upload it as `creds.json` in the project root (gitignored)
4. Share your Google Sheet with the service account email
5. Set `SHEET_ID` secret to your spreadsheet ID
6. Bot auto-creates these sheets: Matches, PlayerStats, Ratings, Players, RecordedMatches

## Tech Stack
- discord.js v14 - Discord bot framework
- steam-user v5 - Steam client (headless login with 2FA via steam-totp, friend monitoring)
- dota2-user v2 - Dota 2 Game Coordinator client (handles GC handshake, protobuf serialization, SO cache)
- google-spreadsheet v5 - Google Sheets API
- ts-trueskill - TrueSkill MMR calculations
- node-fetch v2 - HTTP client for OpenDota API and replay downloads
- odota/parser (Java) - OpenDota's production Dota 2 replay parser using Clarity library
- Java 21 + Maven - Runtime for the replay parser service

## Web Dashboard
The bot includes a web dashboard for viewing match data and uploading replays:
- **Match History** (`/`) - List of all recorded matches with winner, duration, player count
- **Match Detail** (`/match/:id`) - Full scoreboard with KDA, GPM, damage, healing per player; includes match deletion with audit trail
- **Leaderboard** (`/leaderboard`) - TrueSkill MMR rankings with nickname support
- **Player Profile** (`/player/:accountId`) - Player stats, averages (including TD/HH/denies), hero history with per-hero KDA/GPM/HD, position breakdown, recent matches. Supports both account_id and persona_name lookup.
- **Overall Stats** (`/stats`) - Comprehensive player rankings: games, W/L, avg KDA, win%, kill involvement%, captain win%
- **Position Stats** (`/positions`) - Per-position (1-5) stats with tabs: GPM, XPM, damage, tanked, wards, stacks (min 3 games)
- **Synergy** (`/synergy`) - Teammate/opponent win rate matrices (min 3 games together)
- **Hero Stats** (`/heroes`) - Per-hero aggregate stats: pick count, win rate, avg KDA/GPM/HD/TD/HH; sortable columns
- **Players** (`/players`) - All players (including account_id=0) with editable nicknames, game count, last played date
- **Upload** (`/upload`) - Upload .dem replay files (requires UPLOAD_KEY); duplicate prevention via SHA256 file hash

Data is stored in PostgreSQL (primary) and optionally synced to Google Sheets.
The Express server runs on port 5000 alongside the Discord bot in the same process.
Frontend is React + Vite, built to `web/dist/` and served as static files.

## Nickname System
Players can be assigned nicknames (preferred display names) via the Players page:
- Stored in `nicknames` table (account_id -> nickname)
- Nicknames appear in match scoreboards, leaderboard, and player profiles
- Requires upload key for editing (same auth as upload)

## Match Deletion
Matches can be deleted from the Match Detail page:
- Requires upload key authentication
- Full match data is archived in `match_deletions` table before removal
- All TrueSkill ratings are recalculated from remaining matches after deletion

## Replay Parser Details
- Combat log events (damage, healing) use `attackername` strings, not slot numbers. Parser builds NPC-name-to-slot mapping from interval events + hero constants.
- Epilogue data (player names, Steam IDs, match ID) uses protobuf Java serialization with possible trailing-underscore field names (e.g., `gameInfo_`, `playerInfo_`). Parser tries multiple field name variants.
- Complete hero ID to NPC name mapping from dotaconstants (155 heroes as of 2026-03-11).

## Notes
- Replay upload with full parsing is the best way to get detailed stats from practice lobby matches.
- Lobby-based recording via GC is the primary data collection method for basic stats (teams, heroes, winner).
- Friend lobby auto-detection is the main way the bot discovers lobbies without being explicitly invited.
- Practice lobby matches are intentionally blocked by Valve from all external APIs to protect pro scrims.
- Lobby data only provides basic match results (teams, heroes, winner) - not KDA/GPM/items.
- For full KDA/GPM/damage stats from practice lobbies, upload the .dem replay file.
- Bot gracefully degrades: works without Steam (no lobbies), without Sheets (no persistence), or without parser (header-only replay parsing).
- Bot auto-accepts all Steam friend requests for easy setup.
- Parser service is started as a child process and cleaned up on shutdown.

## Recent Changes
- 2026-03-11: Fixed combat log parsing (HD/TD/HH) - combat log events don't carry slot, built NPC-name→slot mapping.
- 2026-03-11: Fixed epilogue extraction - handles protobuf trailing-underscore field names for player names/Steam IDs.
- 2026-03-11: Updated hero name mapping with complete dotaconstants list (155 heroes including Largo #155, Ring Master #131).
- 2026-03-11: Added nickname system (DB + API + Players page with inline editing).
- 2026-03-11: Added match deletion with audit trail (match_deletions table) and automatic rating recalculation.
- 2026-03-11: Added duplicate replay prevention via SHA256 file hash (unique constraint in DB).
- 2026-03-11: Added Hero Stats page with sortable columns (pick count, win rate, avg stats).
- 2026-03-11: Enhanced Player Profile with tower damage, healing, denies averages and per-hero KDA/GPM/HD.
- 2026-03-11: Added position detection (lane classification + LH rank) to replay parser; assigns pos 1-5 per team.
- 2026-03-11: Added captain tracking (slot 0=Radiant, slot 5=Dire), obs/sen placed, creeps/camps stacked, damage_taken to player_stats.
- 2026-03-11: Added Overall Stats, Position Stats (Pos 1-5 tabs), and Synergy (teammate + opponent matrices) pages.
- 2026-03-11: Fixed Players page to show all players including account_id=0 (grouped by persona_name).
- 2026-03-11: Player Profile now supports persona_name lookup for anonymous players.
- 2026-03-11: Fixed formatNumber(0) displaying "-" instead of "0" in match scoreboards.
- 2026-03-11: Added web dashboard (Express + React) with match history, scoreboards, leaderboard, player profiles, and replay upload.
- 2026-03-11: Added PostgreSQL database as primary data store (alongside optional Google Sheets sync).
- 2026-03-11: Web upload protected by UPLOAD_KEY secret; public viewing for all other pages.
- 2026-02-19: Added full .dem replay parsing via odota/parser (Java). Extracts KDA, GPM, hero damage, tower damage, hero healing, etc.
- 2026-02-19: Parser runs as a local Java service on port 5600, managed as a child process.
- 2026-02-19: Updated replay upload handler with full parsing -> Sheets + TrueSkill flow, with graceful fallbacks.
- 2026-02-18: Added friend lobby auto-detection via Steam rich presence monitoring.
- 2026-02-18: Added lobby-based match recording from GC data (no external API needed).
- 2026-02-18: Added auto-detect match system via OpenDota polling as fallback.
- 2026-02-18: Added Players and RecordedMatches sheets for player registration and duplicate prevention.
- 2026-02-17: Added !join_lobby command and auto-accept lobby invites.
- 2026-02-17: Added rich presence for lobby visibility on Steam friends list.
- 2026-02-17: Added !invite command for direct lobby invites via GC.
- 2026-02-17: Migrated from custom protobufjs GC implementation to dota2-user library.
- 2026-02-17: Initial build with full architecture.
