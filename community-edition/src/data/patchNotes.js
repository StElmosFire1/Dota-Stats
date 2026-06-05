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
  },
  {
    "version": "1.4",
    "title": "Centered layout restored + Synergy page now loads",
    "published_at": "2026-05-16",
    "content": "Two more leftovers from the wrong-edition deploy window:\n\n1. Site no longer stretches edge-to-edge. The full edition wraps every page in <main className=\"container\"> (max-width 1200px, auto-centered margins). The community App.jsx had been using <main className=\"main-content\"> instead — a class that has zero CSS in community-edition/web/src/styles.css, so every page rendered at full viewport width with no centering. Swapped to the same .container wrapper as the full edition; layout now matches the screenshots you remember.\n\n2. Synergy page now shows real data. Same root cause as the /home-stats fix in v1.3: Synergy.jsx calls /synergy/heatmap (and /enemy-synergy/heatmap for the Enemies tab), and those routes existed in the full-edition server but had never been ported to community. fetchJson was 404ing, the heatmap component was falling through to its empty-state branch (\"Not enough match data yet. Play more games together!\"). Ported both routes from src/web/server.js — DB functions getSynergyHeatmap / getEnemySynergyHeatmap were already in community-edition/src/db/index.js, just the HTTP wiring was missing. No requirePro gate on the community ports, per the paywall-free policy."
  },
  {
    "version": "1.5",
    "title": "AI agent detection, owner alerts & opt-in blocking",
    "published_at": "2026-05-29",
    "content": "The community edition now has the same AI-scraper / clone-builder hardening the full edition shipped — previously community only had the passive parts (a generated robots.txt and a \"noai\" meta tag). New runtime protections:\n\n1. UA classifier middleware. Every request is checked against the shared agent list (src/security/agentUaList.js — the single source of truth that also generates both editions' robots.txt). Known AI crawlers (GPTBot, ClaudeBot, CCBot, PerplexityBot, Bytespider, etc.) and app-builder agents (Replit-Agent, Lovable, v0, Cursor, Bolt, Devin, …) are recognised; a cheap catch-all flags unknown bots for observability only.\n\n2. X-Robots-Tag on every response. \"noai, noimageai\" is now emitted as a header (not just an HTML meta tag), so honourable AI crawlers see the opt-out on JSON and image responses too.\n\n3. Owner Discord alert on first-seen. The first time a real agent family shows up in any 24h window, the bot DMs the owner (OWNER_DISCORD_ID) with the family, path, and a truncated UA. Suppressed per-family for 24h so a sustained scrape doesn't spam.\n\n4. Stricter rate limit. Classified agents get a tighter (ip, ua-family) rate-limit bucket so one bot can't hammer the API; humans are untouched.\n\n5. New admin card. AdminPanel → Overview now has a \"🕷️ AI agent traffic\" card (superuser) showing per-family hit / blocked / throttled / logged counts, unique IPs/paths, last-seen, and a recent-requests drill-down, backed by GET /api/admin/agent-traffic-report. Data comes from an in-process ring buffer (cap 5000).\n\n6. Opt-in hard block. Set BLOCK_AI_AGENTS=1 in the community prod environment to return 403 for known AI crawlers / app-builders (unknown bots are never hard-blocked — observability only). Left UNSET by default so nothing changes until you flip it. Community edition stays paywall-free — none of this touches Pro/Stripe (there is none here)."
  },
  {
    "version": "1.6",
    "title": "AI agent owner alerts now report hit counts + timestamps",
    "published_at": "2026-05-29",
    "content": "The AI-agent owner DM used to only say \"first-seen\". It now reports how many times an agent visited and when. _maybeAlertOwner accumulates every blockable hit per agent family (count + first/last timestamps); the first sighting still DMs immediately (count 1), then the family is suppressed for 24h while hits keep counting, and the next hit past the window flushes a digest: \"N hits between <first> and <last> (Sydney time)\". The DM is sent before the 403 block return, so turning on BLOCK_AI_AGENTS=1 never silences alerts — blocked agents are still counted and reported. Only ai-crawler / app-builder families are DM'd (unknown bots stay observability-only via the admin card). Applied identically to both editions."
  },
  {
    "version": "1.7",
    "title": "Hall of Fame page no longer errors",
    "published_at": "2026-05-31",
    "content": "The Hall of Fame page could fail to load because its career-stats query crashed in the database. The average-KDA and average-GPM calculations were rounding a floating-point average directly, which PostgreSQL rejects (\"function round(double precision, integer) does not exist\") — so the whole query threw and the page showed an error. Fixed by casting those averages to numeric before rounding (matching how the player-benchmark query already did it). This mirrors the same fix the full edition shipped. Verified against the live database: the corrected query now returns rows."
  },
  {
    "version": "1.8",
    "title": "Match History filters now search across every match, not just the page",
    "published_at": "2026-06-04",
    "content": "The Win/Loss and story-type (Stomp / Decisive / Close Game / Neck and Neck) filters on Match History used to only narrow the 20 matches on the current page, so \"show me all the stomps this season\" felt incomplete. They now pass through to GET /api/matches as query params and are applied server-side across every match: story type is computed from kill margin + duration (mirroring the on-card story pill exactly) and result filtering joins your account's team against the match winner. Pagination totals now reflect the filtered set. Mirrors the full edition."
  },
  {
    "version": "1.9",
    "title": "Discord post-match summary no longer attaches the recap card",
    "published_at": "2026-06-05",
    "content": "When a match finishes, the Discord bot used to post three things: a text embed (highlights + KDA), a scoreboard image, and the branded recap card graphic (\"RADIANT VICTORY\" with PERF rows and the site footer). The recap card is no longer posted to Discord — only the text embed and scoreboard image are sent. The recap card itself is untouched everywhere else: it still renders on the web match detail page and is still served by GET /api/matches/:matchId/recap-card.png. This change is community-edition only."
  }
];
