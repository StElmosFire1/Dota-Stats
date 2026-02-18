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
    replayParser.js    - .dem replay file download and header parsing for match ID extraction
```

## Data Flow
1. **Lobby Recording (Primary):** Bot is in lobby (created/joined/auto-detected) -> Match ends -> GC lobby data provides teams, heroes, winner -> Record to Sheets + TrueSkill
2. **Friend Auto-Join:** Bot monitors Steam friends' rich presence -> Detects friend in Dota 2 lobby -> Auto-joins lobby -> Records match when it ends
3. **Auto-Detect (Fallback):** Players register with `!register` -> Poller checks OpenDota every 5 min -> Only works if someone has public match data enabled
4. **Manual Record:** `!record <match_id>` -> OpenDota API fetch -> Google Sheets write -> TrueSkill update
5. **Replay Upload:** .dem file upload -> Extract match ID from header -> OpenDota fetch -> Record stats
6. **Lobby Creation:** Discord command -> Steam login -> Dota 2 GC protobuf -> Lobby created
7. **Leaderboard:** Google Sheets Ratings tab -> Sort by MMR -> Display in Discord embed

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

## Lobby-Based Match Recording
Practice lobby matches are NOT available via any external API (OpenDota, Steam Web API). The bot records match data directly from the Game Coordinator:
1. Bot must be IN the lobby (as host, spectator, or auto-joined)
2. When match enters POST_GAME state, CSODOTALobby provides: matchOutcome, matchId, matchDuration, player heroIds, team assignments
3. This gives us enough for TrueSkill calculations (win/loss + team composition)
4. Detailed KDA stats are NOT available from lobby data - only heroes, teams, and winner
5. If OpenDota has the match (someone has public data), detailed stats are fetched as a bonus

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

## Notes
- Lobby-based recording via GC is the primary data collection method. It doesn't require public match data.
- Friend lobby auto-detection is the main way the bot discovers lobbies without being explicitly invited.
- Practice lobby matches are intentionally blocked by Valve from all external APIs to protect pro scrims.
- Lobby data only provides basic match results (teams, heroes, winner) - not KDA/GPM/items.
- Bot gracefully degrades: works without Steam (no lobbies) or without Sheets (no persistence/auto-detect).
- Bot auto-accepts all Steam friend requests for easy setup.

## Recent Changes
- 2026-02-18: Added friend lobby auto-detection via Steam rich presence monitoring.
- 2026-02-18: Added lobby-based match recording from GC data (no external API needed).
- 2026-02-18: Added auto-detect match system via OpenDota polling as fallback.
- 2026-02-18: Added Players and RecordedMatches sheets for player registration and duplicate prevention.
- 2026-02-17: Added !join_lobby command and auto-accept lobby invites.
- 2026-02-17: Added rich presence for lobby visibility on Steam friends list.
- 2026-02-17: Added !invite command for direct lobby invites via GC.
- 2026-02-17: Migrated from custom protobufjs GC implementation to dota2-user library.
- 2026-02-17: Initial build with full architecture.
