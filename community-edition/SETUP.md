# Inhouse Stats — Community Edition Setup

Self-hosted, open-source edition for running a Dota 2 inhouse league. Includes match recording, leaderboards, hero stats, synergy analysis, draft stats, TrueSkill ratings, and a Discord bot.

---

## Quick Start on Replit

### Step 0 — Bootstrap a new Replit project

1. Create a new **Node.js** Repl on [replit.com](https://replit.com).
2. In the Shell, clone or copy all files from the `community-edition/` folder into your project root so the layout is:
   ```
   src/
   web/
   package.json
   SETUP.md
   ```
3. Run `npm install` in the Shell to install backend dependencies.
4. Continue with Step 1 below.

### Step 1 — Add secrets

Open **Secrets** (the lock icon in the sidebar) and add the following:

| Secret key | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Yes** | PostgreSQL connection URL |
| `DISCORD_TOKEN` | **Yes** | Bot token from https://discord.com/developers/applications |
| `SESSION_SECRET` | **Yes** | Long random string (e.g. `openssl rand -hex 32`) |
| `UPLOAD_KEY` | **Yes** | Password for the `/admin` panel login |
| `SUPERUSER_PASSWORD` | **Yes** | Superuser password for full admin access and feature flags |
| `STEAM_ACCOUNT` | **Yes** | Steam username — required for lobby creation and rank sync |
| `STEAM_PASSWORD` | **Yes** | Steam password — required for lobby creation and rank sync |
| `ANNOUNCE_CHANNEL_ID` | No | Discord channel ID for match summaries, recaps, and announcements |
| `STATS_CHANNEL_IDS` | No | Comma-separated channel IDs for match stat posts (falls back to `ANNOUNCE_CHANNEL_ID`) |
| `WEEKLY_RECAP_CHANNEL_ID` | No | Channel for weekly recap (falls back to `ANNOUNCE_CHANNEL_ID`) |
| `PORT` | No | Web server port (default: `5000`) |
| `STEAM_API_KEY` | No | Steam Web API key for Dota 2 rank lookups |
| `SHEET_ID` | No | Google Sheet ID for stats sync |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | No | Service account email for Sheets |
| `GOOGLE_PRIVATE_KEY` | No | RSA private key for Sheets |
| `REPLAY_STORE_DIR` | No | Path to store .dem replay files |

### Step 2 — Configure the workflow

In the **Workflows** panel, create a workflow named `Start Bot` with the run command:

```
node src/index.js
```

### Step 3 — Build the frontend

Run this once in the Shell to build the web dashboard:

```bash
cd web && npm install && npm run build
```

### Step 4 — Start

Click **Run** (or start the workflow). The server starts on port 5000.

On first boot, the database schema is created automatically — no manual migration needed.

---

## Local Setup (non-Replit)

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Install

```bash
npm install
cd web && npm install && npm run build && cd ..
```

### Configure

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Then open `.env` and set the variables listed in the table above.

### Run

```bash
node src/index.js
```

---

## Discord Bot Commands

| Command | Description |
|---|---|
| `!help` | Show all available commands |
| `!top` | Top players by MMR |
| `!stats [@user]` | Player stats summary |
| `!register <steam_id>` | Link a Steam account |
| `!history` | Last 10 matches |
| `!balance @p1 ... @p10` | Suggest a balanced 5v5 split |
| `!assign` | Apply last `!balance` result to lobby slots |
| `!rematch` | Re-balance last game's players |
| `!streak [@user]` | Current win/loss streak |
| `!herostats <hero>` | Hero win rate and pick stats |
| `!vs @user1 @user2` | Head-to-head comparison |
| `!match <matchId>` | Look up a specific match |
| `!rank [@user]` | Show a player's TrueSkill rank |
| `!meta` | Current patch hero meta summary |
| `!mystats` | Your own stats summary |
| `!reportcard on\|off` | Toggle post-match stats DM |
| `!ratings on\|off` | Toggle post-match rating DMs |
| `!recap` | Post the weekly stats recap |

## Web Dashboard

Visit the web URL (shown in the preview pane) for:

- Leaderboard, player profiles, hero stats, synergy
- Draft stats, records, match history, hall of fame
- Admin panel at `/admin` (log in with `UPLOAD_KEY`)
- Superuser panel at `/admin` (log in with `SUPERUSER_PASSWORD`)

---

## What's Included

- Match recording via replay upload and Discord bot
- Leaderboards, player profiles, hero stats
- Synergy heatmaps and draft stats
- Season management and TrueSkill ratings
- Player registration and Steam rank sync (requires `STEAM_ACCOUNT`/`STEAM_PASSWORD`)
- Weekly recap and post-match DMs
- Tournaments (display only, no buy-ins)
- Streaks, multi-kill tracking, records
- Hall of Fame, benchmarks, pudge stats

## What's Not Included

- Pro tier / paid memberships
- Coaching marketplace
- AI commentary and analysis (requires Groq — removed)
- Scoreboard image generation (requires canvas — removed)
- Schedule / RSVP system (removed)
- Ward placement heatmaps (removed)
- Player social graph and insights (removed)
- Season pass / XP system (removed)
- Web push notifications (removed)
- Stripe buy-ins for tournaments (removed)
- Match predictions (removed)
