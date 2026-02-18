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
    matchPoller.js     - Automatic match detection by polling OpenDota for registered players
  stats/
    statsService.js    - TrueSkill MMR calculations, match stat normalization
  sheets/
    sheetsStore.js     - Google Sheets data store (Matches, PlayerStats, Ratings, Players, RecordedMatches tabs)
  replay/
    replayParser.js    - .dem replay file download and header parsing for match ID extraction
```

## Data Flow
1. **Auto-detect (Primary):** Players register with `!register` -> Poller checks OpenDota every 5 min -> Finds lobby matches with 2+ registered players -> Auto-records stats + TrueSkill
2. **Manual Record:** `!record <match_id>` -> OpenDota API fetch -> Google Sheets write -> TrueSkill update
3. **Replay Upload:** .dem file upload -> Extract match ID from header -> OpenDota fetch -> Record stats
4. **Lobby Creation (Optional):** Discord command -> Steam login -> Dota 2 GC protobuf -> Lobby created
5. **Leaderboard:** Google Sheets Ratings tab -> Sort by MMR -> Display in Discord embed

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

## Auto-Detect System
The bot automatically detects and records inhouse matches:
1. Players register their Steam ID with `!register <steam_id>`
2. Every 5 minutes, the poller checks registered players' recent matches on OpenDota
3. Practice lobby matches (lobby_type=1) with 2+ registered players are auto-recorded
4. TrueSkill ratings are updated and match summary posted to Discord
5. Duplicate matches are tracked via RecordedMatches sheet to prevent re-recording
6. **Requires:** At least one player per match has "Expose Public Match Data" enabled in Dota 2

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
- steam-user v5 - Steam client (headless login with 2FA via steam-totp)
- dota2-user v2 - Dota 2 Game Coordinator client (handles GC handshake, protobuf serialization, SO cache)
- google-spreadsheet v5 - Google Sheets API
- ts-trueskill - TrueSkill MMR calculations
- node-fetch v2 - HTTP client for OpenDota API and replay downloads

## Notes
- Auto-detect via OpenDota polling is the primary data collection method. It's reliable and doesn't require the bot to be in the lobby.
- Steam/GC lobby features are optional bonuses for lobby creation/management but not needed for stat tracking.
- Match data fetched from the free OpenDota API (rate limited to ~1 req/sec, polled in batches of 10 players).
- Replay parsing extracts match ID from .dem header; full stat parsing requires OpenDota.
- Bot gracefully degrades: works without Steam (no lobbies) or without Sheets (no persistence/auto-detect).

## Recent Changes
- 2026-02-18: Added auto-detect match system via OpenDota polling. Players register with !register, bot auto-detects lobby matches every 5 min.
- 2026-02-18: Added Players and RecordedMatches sheets for player registration and duplicate prevention.
- 2026-02-17: Added !join_lobby command and auto-accept lobby invites.
- 2026-02-17: Added rich presence for lobby visibility on Steam friends list.
- 2026-02-17: Added !invite command for direct lobby invites via GC.
- 2026-02-17: Migrated from custom protobufjs GC implementation to dota2-user library.
- 2026-02-17: Initial build with full architecture.
