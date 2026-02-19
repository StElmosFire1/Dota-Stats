const { config, validateConfig } = require('./config');
const { getDiscordBot } = require('./discord/bot');
const { getSheetsStore } = require('./sheets/sheetsStore');
const { getMatchPoller } = require('./api/matchPoller');
const { getReplayParser } = require('./replay/replayParser');

async function main() {
  console.log('=== Dota 2 Inhouse Stats Bot ===');
  console.log('Starting up...\n');

  const missing = validateConfig();

  const sheetsStore = getSheetsStore();
  try {
    await sheetsStore.init();
  } catch (err) {
    console.error('[Startup] Sheets init failed:', err.message);
    console.warn('[Startup] Continuing without Google Sheets...');
  }

  const replayParser = getReplayParser();
  let replayParserReady = false;
  try {
    replayParserReady = await replayParser.startParserService();
  } catch (err) {
    console.warn('[Startup] Replay parser failed to start:', err.message);
  }

  let steamConnected = false;
  let lobbyManager = null;

  if (config.steam.accountName && config.steam.password) {
    try {
      const { getSteamClient } = require('./steam/steamClient');
      const steamClient = getSteamClient();
      await steamClient.login();
      console.log('[Startup] Steam + Dota 2 GC connected.\n');

      const { getLobbyManager } = require('./lobby/lobbyManager');
      lobbyManager = getLobbyManager();
      lobbyManager.initListeners();
      steamConnected = true;
    } catch (err) {
      console.error('[Startup] Steam login failed:', err.message);
      console.warn('[Startup] Lobby features will be unavailable.');
      console.warn('[Startup] You can still use replay uploads and manual recording.\n');
    }
  } else {
    console.warn('[Startup] Steam credentials not set. Lobby features disabled.');
    console.warn('[Startup] Set STEAM_ACCOUNT, STEAM_PASSWORD, STEAM_SHARED_SECRET in secrets.\n');
  }

  const bot = getDiscordBot();
  bot.setSteamAvailable(steamConnected);

  if (lobbyManager) {
    bot.setupLobbyEvents(lobbyManager);
    console.log('[Startup] Lobby auto-record events wired.');

    const { getSteamClient } = require('./steam/steamClient');
    const steamClient = getSteamClient();
    steamClient.startFriendMonitor();

    steamClient.on('friendInLobby', async (info) => {
      const { LobbyState } = require('./lobby/lobbyManager');
      if (lobbyManager.state !== LobbyState.IDLE && lobbyManager.state !== LobbyState.ENDED) {
        console.log(`[FriendMonitor] Already in a lobby (${lobbyManager.state}), skipping auto-join for lobby ${info.lobbyId}`);
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
    console.log('[Startup] Friend lobby auto-detection enabled.');
  }

  let pollerActive = false;
  if (sheetsStore.initialized) {
    const poller = getMatchPoller();
    const { getStatsService } = require('./stats/statsService');
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
    pollerActive = true;
    console.log('[Startup] Match auto-detect poller started.');
  }

  try {
    await bot.start();
    console.log('\n[Startup] Bot is running! Use !help in Discord.');
    console.log('[Startup] Features available:');
    console.log(`  - Discord commands: YES`);
    console.log(`  - Google Sheets:    ${sheetsStore.initialized ? 'YES' : 'NO (set SHEET_ID + creds.json)'}`);
    console.log(`  - Steam/Lobby:      ${steamConnected ? 'YES' : 'NO (set STEAM_ACCOUNT + STEAM_PASSWORD)'}`);
    console.log(`  - OpenDota API:     YES`);
    console.log(`  - Replay parsing:   ${replayParserReady ? 'YES (full stats)' : 'NO (header-only)'}`);
    console.log(`  - TrueSkill MMR:    YES`);
    console.log(`  - Auto-detect:      ${pollerActive ? 'YES' : 'NO (requires Sheets)'}`);
    console.log(`  - Friend monitor:   ${steamConnected ? 'YES' : 'NO (requires Steam)'}`);
    console.log(`  - Lobby recording:  ${steamConnected ? 'YES' : 'NO (requires Steam)'}\n`);
  } catch (err) {
    console.error('[Startup] Discord bot failed to start:', err.message);
    console.error('[Startup] Make sure DISCORD_TOKEN is set correctly.');
    process.exit(1);
  }
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
