module.exports = [
  {
    "version": "0.1",
    "title": "Bot Foundation & Steam Lobby Creation",
    "published_at": "2026-02-17",
    "content": "Initial release: Discord bot with lobby creation, match recording, and basic leaderboard."
  },
  {
    "version": "0.2",
    "title": "Player Stats & Leaderboard",
    "published_at": "2026-03-01",
    "content": "Added player stats tracking, leaderboard, and hero statistics pages."
  },
  {
    "version": "0.3",
    "title": "Season Support",
    "published_at": "2026-03-15",
    "content": "Seasons system: create and manage seasons, assign matches to seasons, season-filtered leaderboards."
  },
  {
    "version": "0.4",
    "title": "Ratings & Match Detail",
    "published_at": "2026-04-01",
    "content": "Post-match player ratings, match detail page with player performance breakdown."
  },
  {
    "version": "0.5",
    "title": "Community Edition Release",
    "published_at": "2026-05-01",
    "content": "Open-source community edition released. Core features: match recording, leaderboard, player stats, seasons, Discord bot, hero stats, ratings."
  },
  {
    "version": "0.6",
    "title": "Season Archiving",
    "published_at": "2026-05-01",
    "content": "Admins can now archive seasons from the Seasons page. Archived seasons and their matches are marked as legacy and hidden from all stats, leaderboards, and hero statistics — keeping current-season data clean without permanently deleting historical records."
  },
  {
    "version": "0.7",
    "title": "Self-Hosting Improvements",
    "published_at": "2026-05-02",
    "content": "Several improvements to make self-hosting easier and more reliable.\n\n- Healthcheck endpoint: GET /api/health returns status, db reachability, and uptime — useful for monitoring or Docker health checks.\n- Startup validation: the bot now checks all required environment variables at launch and exits with a clear error listing every missing var before attempting any connections.\n- .env.example: a fully annotated template covering every environment variable (required and optional) is now included. Run `cp .env.example .env` to get started.\n- Admin panel stability: an error boundary now catches React render errors and shows a readable error card instead of a blank white screen."
  },
  {
    "version": "1.1",
    "title": "Community deploy fixed: synergy heatmap is free again",
    "published_at": "2026-05-16",
    "content": "The community edition is now deployed by its own dedicated script (`community-edition/deploy.sh`), completely independent of the full-edition deploy. Previously the production host was accidentally running the full-edition entrypoint, which made the Synergy heatmap appear paywalled on the community site. With the new deploy in place, `/synergy` is open to everyone again and `/pro` no longer exists on community."
  },
  {
    "version": "1.2",
    "title": "Replay downloads are now free for everyone",
    "published_at": "2026-05-16",
    "content": "The community edition is paywall-free by design (see `SETUP.md` — \"Pro tier / paid memberships — removed\"), but an audit turned up a leftover server route that still returned HTTP 402 \"requires Pro membership\" when anyone tried to download a stored replay. Removed: replay downloads at `/replays/:matchId/download` and `/matches/:matchId/replay` are now open to anyone who can reach the API. A couple of unused Pro-status frontend hooks and one dead error-handling branch on the player profile page have also been cleaned up. A new automated check rejects any future deploy that reintroduces paywall code anywhere in the community source tree."
  },
  {
    "version": "1.3",
    "title": "Home page recent matches + leaked Discord patch-note cleanup",
    "published_at": "2026-05-16",
    "content": "Two more leftovers from the wrong-edition deploy window have been fixed:\n\n1. Recent Matches on the home page now show data. The community Home page calls /home-stats to populate the four stat cards (Total Matches, Players, This Week, Most Played Hero) and the Recent Matches list. The route existed in the full-edition server but had never been ported to the community server, so every home-page load was getting a 404 and silently falling back to empty placeholders (“—” everywhere + “No matches recorded yet”). Ported /home-stats and the matching /latest-recap route from src/web/server.js — both DB functions already existed in community-edition/src/db/index.js, just the HTTP wiring was missing.\n\n2. One-off Discord cleanup script for the leaked patch posts. During the wrong-edition window the community Discord channel received ≈97 full-edition patch-note announcements (“📋 Bot Update — v6.x | ...” through v7.x). Deleting the DB rows stopped any future re-announcement but didn't touch the existing Discord posts. Added community-edition/scripts/purge-leaked-patch-posts.js: connects with the community bot's DISCORD_TOKEN, scans the configured PATCH_CHANNEL_IDS / ANNOUNCE_CHANNEL_ID, matches its own embed posts by title pattern (“📋 Bot Update — vX.Y | ...”), and deletes anything whose version isn't on the keep-list (v0.1–v0.7, v1.1–v1.3). Supports --dry-run for a safe preview pass, --keep=X.Y for one-off overrides, and uses bulkDelete for messages under 14 days old + single delete for older ones."
  }
];
