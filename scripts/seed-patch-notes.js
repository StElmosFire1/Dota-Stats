#!/usr/bin/env node
const db = require('../src/db');

const notes = [
  {
    version: '0.1',
    title: 'Bot Foundation & Steam Lobby Creation',
    author: 'StElmosFire1',
    content: `## What's This Bot?
The Dota 2 Inhouse Stats Bot was built to solve a real problem — public match APIs like OpenDota can't see private lobby games. This bot tracks everything in-house, from raw match results to detailed per-player stats from replay files.

## Steam & Lobby Features
- Bot Steam account connects to the Dota 2 Game Coordinator (GC) directly
- Create organised inhouse lobbies via Discord command
- Bot auto-accepts friend requests and can join existing player-created lobbies
- Friends' rich presence monitoring — bot detects when you're in a Dota lobby and can join automatically
- Lobby invite acceptance handled automatically

## Discord Commands (Initial Set)
- **!register** — link your Steam account to your Discord profile
- **!lobby** — create a new inhouse lobby through the bot
- **!join** — join an existing lobby by ID
- **!help** — full command reference`,
  },
  {
    version: '0.2',
    title: 'Replay Parsing & Full Match Stats',
    author: 'StElmosFire1',
    content: `## Replay-Based Stat Tracking
Instead of relying on the public Dota 2 API (which doesn't cover private lobbies), the bot now uses OpenDota's Java-based replay parser to extract stats directly from .dem replay files.

## Stats Extracted Per Player
- Kills, Deaths, Assists (KDA)
- Gold Per Minute (GPM) and Experience Per Minute (XPM)
- Hero damage dealt and taken
- Healing output
- Last hits and denies, split by lane phase and total
- Level at end of game
- Item builds (final inventory)
- Ability upgrade order (skill build)
- Multi-kill events: Double Kill, Triple Kill, Ultra Kill, Rampage
- Kill streaks: First Blood, Killing Spree, Dominating, Mega Kill, Unstoppable, Wicked Sick, Monster Kill, Godlike, Beyond Godlike

## Match-Level Data
- Match duration
- Radiant/Dire team composition
- Draft order (picks and bans in CM mode)
- Final score and winning team
- Game date extracted from the replay file itself`,
  },
  {
    version: '0.3',
    title: 'Web Dashboard Launched',
    author: 'StElmosFire1',
    content: `## Website Goes Live
A full web dashboard is now available for the community to view all match data, stats, and leaderboards without needing to use Discord commands.

## Pages Available
- **Matches** — paginated match history with scores and duration
- **Match Detail** — full scoreboard with every player's stats, items, KDA, GPM, damage, and more. Tooltips on all stat column headers.
- **Leaderboard** — TrueSkill MMR rankings with win/loss records
- **Heroes** — hero pick rates and win rates across all matches
- **Players** — browse all registered players

## Upload System
- Drag-and-drop replay file upload directly on the website
- Background processing with live status polling — no need to wait on the page
- Persistent upload indicator visible on all pages while a replay is processing
- Duplicate file detection prevents the same replay being recorded twice
- Multi-file upload support — queue multiple replays at once
- Chunked uploading for large .dem files with a progress bar`,
  },
  {
    version: '0.4',
    title: 'Player Profiles & Detailed Statistics',
    author: 'StElmosFire1',
    content: `## Player Profile Pages
Each registered player now has a dedicated profile page with a full breakdown of their history.

## What's on a Profile
- Career totals: games, wins, losses, win rate
- Averages per game: KDA, GPM, XPM, damage, healing, last hits
- Hero history — every hero played with win rate and average stats
- Position breakdown — how they perform in each role (carry, mid, offlane, support, hard support)
- Best performances and worst games highlighted

## Overall Stats Page
- Aggregated stats across all players and matches
- Top performers in each category (most kills in a game, highest GPM, best KDA)
- Fun records like highest single-game damage, most deaths, biggest healing output

## Position Stats Page
- Per-position rankings — who is the best carry? The best pos 5?
- Separate leaderboards for each of the 5 positions
- Stats weighted for what matters at each position (e.g. GPM for carry, assists for support)

## Synergy Matrix
- Shows your win rate when playing with or against each other player
- Full matrix view of all teammate/opponent combinations
- Useful for drafting — see which duos win more often together`,
  },
  {
    version: '0.5',
    title: 'Season System, Stripe Buy-In & Steam Login',
    author: 'StElmosFire1',
    content: `## Season Management
- All stats can now be filtered by season — use the season selector in the top bar
- Each season has its own leaderboard, hero stats, and player rankings
- Historical seasons viewable separately or combined in an "All Time" view
- Legacy data imported and correctly attributed to historical seasons

## Season Buy-In via Stripe
- Players can pay a season buy-in fee directly through the website
- Secure payment processing via Stripe
- Prize pool is tracked and displayed on the Seasons page
- Payment confirmation page with success state

## Steam OpenID Sign-In
- Players can verify their Steam identity by signing in with Steam on the website
- Verified players are visually indicated in the prize pool / buy-in table
- Ties your Steam account to your site presence without sharing credentials

## Security Improvements
- HTTP security headers added via Helmet
- Rate limiting on authentication endpoints
- Session-based auth for admin actions`,
  },
  {
    version: '0.6',
    title: 'Match Management, Admin Tools & Stats Editing',
    author: 'StElmosFire1',
    content: `## Admin & Superuser System
- Admin login modal — log in with your upload key for admin actions
- Superuser login — elevated access for match data correction
- Superuser icon displayed in the nav when logged in as superuser

## Match Data Editing
- Superusers can edit match dates if the replay timestamp was incorrect
- Pick and ban phase data can be corrected after the fact
- Full stats editing available for individual player rows in a match
- Changes are logged for audit purposes

## Match Deletion
- Authenticated match deletion — only admins can remove matches
- Deleted match data is archived rather than permanently erased
- TrueSkill MMR is fully recalculated across all remaining matches after a deletion
- Duplicate match detection improved with net worth comparison to distinguish similar-looking games

## Replay Processing Improvements
- Better game date extraction from replay files
- Improved handling of corrupted player names in older replays
- Re-upload of the same replay file now correctly replaces the old record`,
  },
  {
    version: '0.7',
    title: 'Head to Head, Compare & Draft Assistant',
    author: 'StElmosFire1',
    content: `## Head to Head
- Select any two players to see their direct matchup history
- Win rate when playing against each other, on the same team, and overall
- Useful for settling disputes about who actually beats who

## Player Compare
- Side-by-side stat comparison for two players across all tracked metrics
- See at a glance who has the edge in GPM, KDA, win rate, damage, and more

## Draft Assistant
- Pick and ban helper for inhouse drafts
- Shows hero win rates from your server's own match history
- Suggests picks based on what's been strong in your specific meta
- Counter-pick information drawn from your inhouse data

## Predictions (Beta)
- Pre-match win probability estimate based on team compositions and player MMR
- Experimental — accuracy improves as more matches are recorded`,
  },
  {
    version: '0.8',
    title: 'Weekly Recaps, Discord Roles & Nickname System',
    author: 'StElmosFire1',
    content: `## Automated Weekly Recap
- Every Monday at 9am AEST the bot posts a weekly recap to the announcement channel
- **!recap** Discord command to pull the recap on demand at any time
- Recap includes: match count, Radiant vs Dire win rates, top KDA, most kills, most deaths, highest damage, most assists, most healing, best GPM
- Fun awards each week: Bloodbath King, Glass Cannon, Healing Hero, Ward Machine, Gold Goblin

## Role-Based Fun Awards (in recap and after matches)
- Slippery Fish (most deaths)
- The Invisible Man (least fights)
- AFK Farmer (highest GPM but low kills/assists)
- The Bus Driver (most assists)
- Tower Diver (most reckless plays)
- Win Streak MVP and Loss Streak Victim callouts

## Discord MMR Roles
- Players are automatically assigned a Discord role based on their TrueSkill MMR
- Role updates after every recorded match
- Configurable role IDs via environment variables

## Nickname System
- Assign a custom display name to any player
- Nicknames appear everywhere: leaderboard, profiles, match scoreboards, Discord commands
- Set via admin panel on the Players page`,
  },
  {
    version: '0.9',
    title: 'Nemesis Tracking, Support Gold & Win Streaks',
    author: 'StElmosFire1',
    content: `## Nemesis System
- The bot now tracks who kills whom across all matches
- Your **lifetime nemesis** is the player who has killed you the most
- **Current nemesis streak** tracked — if they've killed you in the last 3+ games it gets called out
- Post-match summary highlights active nemesis rivalries (e.g. "SlimeGuy continues to haunt SteelFist — 7 lifetime kills")
- **!stats** command shows your nemesis with kill count

## Support Gold Tracking
- Observer wards purchased, sentry wards purchased, and TP scrolls purchased all tracked from replay data
- Displayed on player profiles and in match scoreboard
- Weekly recap highlights the player who spent the most on vision items

## Win & Loss Streaks
- Current win and loss streaks tracked per player
- **Leaderboard** shows a 🔥 or 💀 badge for players on 2+ game streaks
- **!stats** command shows current streak in the embed title
- Post-match message calls out players hitting milestones (3-game win streak, 5-game win streak, etc.)
- Weekly recap surfaces the hottest streak of the week`,
  },
  {
    version: '1.0',
    title: 'Grok AI — !analyze, !roast & AI Match Commentary',
    author: 'StElmosFire1',
    content: `## AI-Powered Discord Commands
The bot now uses Grok (xAI) to generate personalised, stat-aware commentary.

## New Commands
- **!analyze [@user]** — in-depth AI performance analysis based on that player's actual stats: win rate, KDA, GPM, hero pool, MMR. Gets specific, not generic.
- **!roast [@user]** — friendly AI trash-talk tailored to the player's numbers. Funnier the worse they're doing.

## Weekly Recap AI Blurb
- Every Monday recap now ends with a short AI-written highlight summary
- Covers the week's storylines, who popped off, who needs to practice more
- Written in a cheeky commentator style

## Post-Match MVP Commentary
- After each replay upload, the standout performer gets a one-liner from GrokBot
- Based on actual KDA, damage, GPM, and hero — not random
- Appears in the match summary embed`,
  },
  {
    version: '1.1',
    title: 'Custom MMR Tier System',
    author: 'StElmosFire1',
    content: `## 11 Tiers — Position 6 to Gaben
Replaced generic MMR numbers with 11 custom rank tiers that actually match the inhouse server's vibe.

## The Tiers (worst → best)
- 🗺️ **Position 6** — The position that doesn't exist, neither do your contributions
- 👁️ **Observer Ward** — Placed. Ignored. Immediately dewarded.
- 🐗 **Neutral Creep** — You exist. The jungle thanks you for feeding it.
- ⚓ **Anchor** — Dragging your team straight to the bottom.
- 🤖 **NPC** — Standing in the trees doing nothing.
- 😐 **Average** — Not bad. Not good. Just... there.
- 💪 **Solid** — Reliable. People can actually count on you.
- 🎖️ **Veteran** — Seen things. Done things. Knows things.
- ⚡ **Apex** — Operating at peak Dota capacity.
- 🎯 **Prime Pick** — Everyone wants you on their team.
- 🎩 **Gaben** — A personal friend of the man himself.

## Where Tiers Appear
- **Leaderboard** — tier badge shown in its own column, with a worst→best legend at the top
- **!stats** command — tier badge and description shown in the embed footer
- **!top** command — tier emoji shown next to each player's name
- **Discord roles** — bot auto-assigns the matching role after each match (requires role IDs configured)`,
  },
  {
    version: '1.2',
    title: 'Patch Notes & GrokBot AI Chat',
    author: 'StElmosFire1',
    content: `## Patch Notes Page (you're reading it)
- Full version history for every bot and website update under Tools → Patch Notes
- Accordion-style cards, newest shown open by default
- Updated automatically every time changes are deployed — no manual work needed

## GrokBot AI Chat Widget
- 🤖 floating chat button on the bottom-right of every page
- Powered by Grok AI with awareness of your server's live leaderboard and hero win rates
- Ask about: pick/ban suggestions, counter strategies, item builds, player stats, meta questions
- Strictly limited to Dota 2 topics — asks you to stay on topic if you go off-script
- Four quick-tap suggested questions when you first open it
- Remembers the last 10 messages in the conversation
- Context (leaderboard, hero stats) refreshes every 5 minutes automatically
- Rate limited to 20 messages per minute`,
  },
];

(async () => {
  for (const note of notes) {
    const created = await db.createPatchNote(note);
    console.log(`[PatchNote] v${created.version} — ${created.title} (id=${created.id})`);
    // Small delay so timestamps are in correct ascending order
    await new Promise(r => setTimeout(r, 100));
  }
  console.log('\nDone. All patch notes seeded.');
  process.exit(0);
})();
