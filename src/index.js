require('dotenv').config();
const { config, validateConfig } = require('./config');
const { getDiscordBot } = require('./discord/bot');
const { getReplayParser } = require('./replay/replayParser');
const db = require('./db');
const { createServer } = require('./web/server');

function logEditionBanner() {
  const edition = 'FULL';
  const cwd = process.cwd();
  const base = require('path').basename(cwd).toLowerCase();
  const looksLikeCommunity = base.includes('community') || /dota-stats$/.test(base);
  if (looksLikeCommunity) {
    console.warn(`[Startup] WARNING: Running ${edition} edition from ${cwd} — directory name suggests this is a community-edition checkout. The full-edition entrypoint (src/index.js) should run from ~/Dota-Stats-Full/. If PM2 is misconfigured, see the "One-time PM2 re-registration for community edition" snippet in replit.md to re-register the inhouse-bot process against community-edition/src/index.js.`);
  } else {
    console.log(`[Startup] Running ${edition} edition from ${cwd}`);
  }
}

// Track startup status for health checks
const startupStatus = {
  discord: false,
  database: false,
  steam: false,
  replayParser: false,
  sheets: false,
  matchPoller: false,
  lobby: false,
  startedAt: new Date().toISOString(),
};

async function main() {
  console.log('=== Dota 2 Inhouse Stats Bot ===');
  console.log('Starting up...\n');

  logEditionBanner();

  validateConfig();

  // --- Database ---
  try {
    startupStatus.database = await db.init();
  } catch (err) {
    console.error('[Startup] Database init failed:', err.message);
  }

  // --- Auto-seed patch notes on every startup (upsert by version) ---
  if (startupStatus.database) {
    try {
      const patchNotesSeed = require('./data/patchNotes');
      await db.seedPatchNotes(patchNotesSeed);
    } catch (err) {
      console.error('[Startup] Patch note seed failed:', err.message);
    }
  }

  // --- Google Sheets (dormant) ---
  // To re-enable: set config.features.sheets = true and configure SHEET_ID + creds.json
  let sheetsStore = null;
  if (config.features.sheets) {
    const { getSheetsStore } = require('./sheets/sheetsStore');
    sheetsStore = getSheetsStore();
    try {
      await sheetsStore.init();
      startupStatus.sheets = sheetsStore.initialized;
      console.log('[Startup] Google Sheets initialised.');
    } catch (err) {
      console.error('[Startup] Sheets init failed:', err.message);
    }
  } else {
    console.log('[Startup] Google Sheets: disabled (config.features.sheets = false)');
  }

  // --- Replay parser ---
  const replayParser = getReplayParser();
  try {
    startupStatus.replayParser = await replayParser.startParserService();
  } catch (err) {
    console.warn('[Startup] Replay parser failed to start:', err.message);
  }

  // --- Steam login (kept for connectivity health check) ---
  let steamConnected = false;
  let steamLoggedInElsewhere = false;
  if (config.steam.accountName && config.steam.password && process.env.DISABLE_STEAM !== 'true') {
    try {
      const { getSteamClient } = require('./steam/steamClient');
      const steamClient = getSteamClient();
      await steamClient.login();
      steamConnected = true;
      startupStatus.steam = true;
      console.log('[Startup] Steam connected.\n');

      // Add all known players as Steam friends (non-blocking, runs in background)
      db.getAllSteamAccountIds().then(ids => {
        if (ids.length) {
          console.log(`[Startup] Sending Steam friend requests to ${ids.length} known players...`);
          steamClient.addAllKnownFriends(ids).catch(err =>
            console.error('[Startup] addAllKnownFriends error:', err.message)
          );
        }
      }).catch(() => {});

      steamClient.on('steamDisconnected', (reason) => {
        startupStatus.steam = false;
        console.warn(`[Steam] Marked offline in health status (reason: ${reason})`);
      });
    } catch (err) {
      console.error('[Startup] Steam login failed:', err.message);
      if (err.message && err.message.includes('LoggedInElsewhere')) {
        steamLoggedInElsewhere = true;
        console.warn('[Startup] Another instance holds the Steam session — Discord commands will be silenced on this instance.');
      }
    }
  } else {
    console.warn('[Startup] Steam credentials not set — Steam offline.');
  }

  // --- Discord bot ---
  const bot = getDiscordBot();
  bot.setSteamAvailable(steamConnected && config.features.lobby);
  if (steamLoggedInElsewhere) bot.setCommandsDisabled(true);

  // --- Lobby manager + friend monitor ---
  let lobbyManager = null;
  if (config.features.lobby && steamConnected) {
    try {
      console.log('[Startup] Initialising lobby manager...');
      const { getLobbyManager } = require('./lobby/lobbyManager');
      lobbyManager = getLobbyManager();
      console.log('[Startup] getLobbyManager() succeeded, calling initListeners...');
      lobbyManager.initListeners();
      startupStatus.lobby = true;
      console.log('[Startup] initListeners() done, starting friend monitor...');

      const { getSteamClient } = require('./steam/steamClient');
      const steamClient = getSteamClient();
      steamClient.startFriendMonitor();

      steamClient.on('friendInLobby', async (info) => {
        const { LobbyState } = require('./lobby/lobbyManager');
        if (lobbyManager.state !== LobbyState.IDLE && lobbyManager.state !== LobbyState.ENDED) {
          console.log(`[FriendMonitor] Already in a lobby (${lobbyManager.state}), skipping`);
          return;
        }
        console.log(`[FriendMonitor] Auto-joining lobby ${info.lobbyId} (friend: ${info.playerName})`);
        try {
          await lobbyManager.joinLobby(info.lobbyId, '', `friend-auto:${info.steamId64}`);
          bot._notifyChannel(
            `Auto-joined a lobby detected from friend **${info.playerName}**'s rich presence.\n` +
            'The bot will track the match when it completes.'
          );
        } catch (err) {
          console.warn(`[FriendMonitor] Failed to auto-join lobby ${info.lobbyId}: ${err.message}`);
        }
      });
      console.log('[Startup] Lobby manager + friend monitor enabled.');
    } catch (err) {
      console.error('[Startup] Lobby init failed:', err.message);
      console.error('[Startup] Lobby init stack:', err.stack || err);
    }
  } else if (!config.features.lobby) {
    console.log('[Startup] Lobby/friend monitor: disabled (config.features.lobby = false)');
  } else {
    console.log('[Startup] Lobby/friend monitor: skipped (Steam not connected)');
  }

  if (lobbyManager) bot.setupLobbyEvents(lobbyManager);

  // --- OpenDota match poller (dormant) ---
  // To re-enable: set config.features.matchPoller = true
  if (config.features.matchPoller && sheetsStore?.initialized) {
    const { getMatchPoller } = require('./api/matchPoller');
    const { getStatsService } = require('./stats/statsService');
    const poller = getMatchPoller();
    const statsService = getStatsService();

    poller.on('matchRecorded', async (matchStats) => {
      try {
        const radiantPlayers = matchStats.players.filter((p) => p.team === 'radiant');
        const direPlayers = matchStats.players.filter((p) => p.team === 'dire');
        const radiant = radiantPlayers.map((p) => ({ id: p.accountId.toString(), mu: 25, sigma: 8.333 }));
        const dire = direPlayers.map((p) => ({ id: p.accountId.toString(), mu: 25, sigma: 8.333 }));
        for (const p of [...radiant, ...dire]) {
          const existing = await sheetsStore.getPlayerRating(p.id);
          if (existing) { p.mu = existing.mu; p.sigma = existing.sigma; }
        }
        const result = statsService.calculateMatch(radiant, dire, matchStats.radiantWin);
        for (const r of result) {
          const player = matchStats.players.find((p) => p.accountId.toString() === r.id);
          const won = player ? (player.team === 'radiant' ? matchStats.radiantWin : !matchStats.radiantWin) : false;
          await sheetsStore.updateRating(r.id, '', player?.personaname || r.id, r.mu, r.sigma, r.mmr, won);
        }
        bot.notifyMatchRecorded(matchStats);
      } catch (err) {
        console.error('[Poller] Rating update error:', err.message);
      }
    });

    poller.start();
    startupStatus.matchPoller = true;
    console.log('[Startup] OpenDota match poller started.');
  } else if (!config.features.matchPoller) {
    console.log('[Startup] OpenDota match poller: disabled (config.features.matchPoller = false)');
  }

  // --- Start Discord ---
  try {
    await bot.start();
    startupStatus.discord = true;
    console.log('\n[Startup] Bot is running! Use !help in Discord.');
    console.log('[Startup] Active features:');
    console.log(`  - Discord:        YES`);
    console.log(`  - Database:       ${startupStatus.database ? 'YES' : 'NO'}`);
    console.log(`  - Steam:          ${startupStatus.steam ? 'YES (connected)' : 'NO'}`);
    console.log(`  - Replay parser:  ${startupStatus.replayParser ? 'YES (full stats)' : 'NO (header-only)'}`);
    console.log(`  - TrueSkill MMR:  YES`);
    console.log(`  - Google Sheets:  ${startupStatus.sheets ? 'YES' : 'DORMANT'}`);
    console.log(`  - Match poller:   ${startupStatus.matchPoller ? 'YES' : 'DORMANT'}`);
    console.log(`  - Lobby/monitor:  ${startupStatus.lobby ? 'YES' : 'DORMANT'}`);
  } catch (err) {
    console.error('[Startup] Discord bot failed to start:', err.message);
    process.exit(1);
  }

  // --- Stripe configuration diagnostic (Task #113) ---
  // Coaching marketplace returns a generic "Payments are not configured" error
  // when STRIPE_SECRET_KEY is unset, which is hard to spot in PM2 logs after
  // the fact. Surface the configuration state at boot, and shout loudly when
  // the marketplace flag is on (or in preview) but the key is missing.
  try {
    const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
    let coachingFlagState = 'off';
    try {
      const flag = await db.getFeatureFlag('coaching_marketplace');
      coachingFlagState = flag?.state || 'off';
    } catch (_) { /* table may not exist yet on first boot — fall through */ }
    if (stripeConfigured) {
      console.log('[Stripe] STRIPE_SECRET_KEY present — payments enabled.');
    } else if (coachingFlagState === 'on' || coachingFlagState === 'preview') {
      console.error(`[Stripe] coaching marketplace ${coachingFlagState.toUpperCase()} but STRIPE_SECRET_KEY missing — payouts will 503`);
    } else {
      console.log('[Stripe] STRIPE_SECRET_KEY missing — payments disabled (coaching marketplace flag is off).');
    }
  } catch (err) {
    console.warn('[Stripe] startup diagnostic failed:', err.message);
  }

  // --- Web server ---
  const webApp = createServer(startupStatus);
  const webPort = parseInt(process.env.PORT) || 5000;
  webApp.listen(webPort, '0.0.0.0', () => {
    console.log(`[Web] Dashboard running on port ${webPort}`);
    console.log(`[Startup] All systems ready.\n`);

    // v5.75: kick off the inhouse auto-start ticker once the API is up so
    // its internal /select-captains call can hit the live server.
    if (startupStatus.database) {
      try {
        const ticker = require('./inhouse/autoStartTicker');
        ticker.start(db, {
          basePort: webPort,
          // Task #136 — pass the live express-session store so the ticker
          // can drop inhouse seats whose Steam session is gone.
          sessionStore: webApp.locals && webApp.locals.sessionStore,
        });
      } catch (err) {
        console.warn('[Startup] Inhouse auto-start ticker failed to start:', err.message);
      }
    }
  });
}

process.on('SIGINT', async () => {
  console.log('\n[Shutdown] Graceful shutdown...');
  try { getDiscordBot().shutdown(); } catch (e) {}
  try { getReplayParser().shutdown(); } catch (e) {}
  try {
    const { getSteamClient } = require('./steam/steamClient');
    getSteamClient().shutdown();
  } catch (e) {}
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Shutdown] Received SIGTERM...');
  try { getDiscordBot().shutdown(); } catch (e) {}
  try { getReplayParser().shutdown(); } catch (e) {}
  try {
    const { getSteamClient } = require('./steam/steamClient');
    getSteamClient().shutdown();
  } catch (e) {}
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  console.error('[Error] Unhandled rejection:', err);
});

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
