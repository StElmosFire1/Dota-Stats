require('dotenv').config();
const { config, validateConfig } = require('./config');
const { getDiscordBot } = require('./discord/bot');
const { getReplayParser } = require('./replay/replayParser');
const db = require('./db');
const { createServer } = require('./web/server');

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
  if (config.steam.accountName && config.steam.password) {
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
    }
  } else {
    console.warn('[Startup] Steam credentials not set — Steam offline.');
  }

  // --- Lobby manager + friend monitor (dormant) ---
  // To re-enable: set config.features.lobby = true
  let lobbyManager = null;
  if (config.features.lobby && steamConnected) {
    try {
      const { getLobbyManager } = require('./lobby/lobbyManager');
      lobbyManager = getLobbyManager();
      lobbyManager.initListeners();
      startupStatus.lobby = true;

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
    }
  } else if (!config.features.lobby) {
    console.log('[Startup] Lobby/friend monitor: disabled (config.features.lobby = false)');
  }

  // --- Discord bot ---
  const bot = getDiscordBot();
  bot.setSteamAvailable(steamConnected && config.features.lobby);
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

  // --- Web server ---
  const webApp = createServer(startupStatus);
  const webPort = parseInt(process.env.PORT) || 5000;
  webApp.listen(webPort, '0.0.0.0', () => {
    console.log(`[Web] Dashboard running on port ${webPort}`);
    console.log(`[Startup] All systems ready.\n`);
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
