# Dota 2 Inhouse Stats Bot

## Overview
A Node.js Discord bot for tracking stats from Dota 2 inhouse games (custom lobbies) in an OCE community server with up to 100 players. Privacy-first design.

## Architecture
```
src/
  index.js             - Main entry point, startup orchestration
  config.js            - Environment config & validation
  discord/
    bot.js             - Discord.js bot, all command handlers, replay upload
  steam/
    steamClient.js     - Steam login via steam-user, Dota 2 GC lifecycle
    dota2GC.js         - Dota 2 Game Coordinator client with protobuf encoding
  lobby/
    lobbyManager.js    - Lobby lifecycle state machine (IDLE->CREATING->WAITING->IN_PROGRESS->ENDED)
  api/
    opendota.js        - OpenDota API client for match data fetching (free, no auth)
  stats/
    statsService.js    - TrueSkill MMR calculations, match stat normalization
  sheets/
    sheetsStore.js     - Google Sheets data store (Matches, PlayerStats, Ratings tabs)
  replay/
    replayParser.js    - .dem replay file download and header parsing for match ID extraction
```

## Data Flow
1. Lobby Creation: Discord command -> Steam login -> Dota 2 GC protobuf -> Lobby created
2. Match Recording: `!record <match_id>` -> OpenDota API fetch -> Google Sheets write -> TrueSkill update
3. Replay Upload: .dem file upload -> Extract match ID from header -> OpenDota fetch -> Record stats
4. Leaderboard: Google Sheets Ratings tab -> Sort by MMR -> Display in Discord embed

## Discord Commands
- `!help` - Show all commands
- `!create_lobby <name> <password>` - Create private lobby via Steam (requires Steam creds)
- `!invite <steam_id>` - Invite a player to the lobby by Steam64 ID
- `!lobby_status` - Check current lobby & join info
- `!end` - End current lobby
- `!record <match_id>` - Fetch match from OpenDota API and record stats
- `!top [count]` - Leaderboard (TrueSkill MMR)
- `!stats [@user]` - Player stats
- `!history` - Recent matches
- `!steam_status` - System connection status

## Required Secrets
- `DISCORD_TOKEN` - Discord bot token (required)
- `STEAM_ACCOUNT` - Steam alt account username (optional, for lobby features)
- `STEAM_PASSWORD` - Steam alt account password (optional)
- `STEAM_SHARED_SECRET` - Steam Guard shared secret from maFile (optional)
- `SHEET_ID` - Google Sheets spreadsheet ID (optional, for persistent storage)

## Google Sheets Setup
1. Create a Google Cloud service account with Sheets API enabled
2. Download the credentials JSON file
3. Upload it as `creds.json` in the project root (gitignored)
4. Share your Google Sheet with the service account email
5. Set `SHEET_ID` secret to your spreadsheet ID
6. Bot auto-creates Matches, PlayerStats, and Ratings sheets

## Tech Stack
- discord.js v14 - Discord bot framework
- steam-user v5 - Steam client (headless login with 2FA via steam-totp)
- dota2-user v2 - Dota 2 Game Coordinator client (handles GC handshake, protobuf serialization, SO cache)
- google-spreadsheet v5 - Google Sheets API
- ts-trueskill - TrueSkill MMR calculations
- node-fetch v2 - HTTP client for OpenDota API and replay downloads

## Notes
- Uses `dota2-user` npm package (modern maintained alternative to deprecated `dota2` package) for GC communication. It handles protobuf serialization and GC connection lifecycle automatically.
- Lobby creation is detected via SO (Shared Object) cache messages from the GC. The GC responds to lobby create via SO cache subscription/update messages (types 21-28), not always via the direct PracticeLobbyResponse message. Our code handles both paths.
- SO cache type 2004 = CSODOTALobby (lobby data including lobbyId, matchId, gameState, players).
- Match data is fetched from the free OpenDota API (rate limited to ~1 req/sec).
- Replay parsing extracts match ID from .dem header; full stat parsing requires OpenDota.
- Bot gracefully degrades: works without Steam (no lobbies) or without Sheets (no persistence).

## Lobby Joining
Players join lobbies via Steam, not the Dota 2 lobby browser (known Valve limitation with password-protected lobbies). Methods:
1. Add the bot's Steam account as a friend, then right-click > Join Game
2. Use `!invite <steam_id>` to receive a Dota 2 lobby invite notification
The bot sends invites via GC message k_EMsgGCInviteToLobby (4512).

## Recent Changes
- 2026-02-17: Added !invite command for direct lobby invites via GC. Fixed protobuf field numbers to match Valve's official schema. Removed invalid console join command.
- 2026-02-17: Migrated from custom protobufjs GC implementation to dota2-user library. Fixed lobby creation timeout caused by unhandled SO cache messages.
- 2026-02-17: Initial build with full architecture.
